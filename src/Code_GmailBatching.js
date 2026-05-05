/**
 * @file src/Code_GmailBatching.js
 * @description Gmail batching utilities for cleaning labels, recovering memory state, and backfilling dates.
 *
 * @version 1.0.0
 * @last_modified 2026-05-04
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial creation from split of Code_Utilities.js. Added standardized documentation header, JSDoc descriptions for all functions, aggressive type checking, and error boundaries.
 */

/**
 * Backfills missing dates in the execution log spreadsheet.
 * @returns {void}
 */
function backfillDatesInLog() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("backfillDatesInLog failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  if (!SPREADSHEET_ID) {
    console.error("backfillDatesInLog failed: Missing MASTER_SHEET_ID in SYSTEM_CONFIG");
    return;
  }

  const LOG_GID = "2131515996";

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID);

    if (!sheet) {
      console.error("Execution Log not found.");
      return;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    let headerRowIdx = 0;
    if (data[0].findIndex(h => h && h.toString().trim().toLowerCase() === "link") === -1 && data.length > 1) {
      headerRowIdx = 1;
    }
    const headers = data[headerRowIdx];
    const linkCol = headers.findIndex(h => h && h.toString().trim().toLowerCase() === "link");
    const firstMsgCol = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes("first message"));
    const lastMsgCol = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes("last message"));

    if (linkCol === -1 || firstMsgCol === -1 || lastMsgCol === -1) {
      console.error("Required columns not found! Ensure 'Link', 'Received First Message', and 'Received Last Message' exist.");
      return;
    }

    let updates = 0;

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i];
      const link = row[linkCol];
      const firstMsgDate = row[firstMsgCol];
      const lastMsgDate = row[lastMsgCol];

      if ((!firstMsgDate || !lastMsgDate) && link) {
        const threadIdMatch = link.toString().match(/#all\/(.+)$/);
        if (threadIdMatch) {
          const threadId = threadIdMatch[1];
          try {
            const thread = GmailApp.getThreadById(threadId);
            if (thread) {
              const messages = thread.getMessages();
              if (messages.length > 0) {
                const firstMsg = Utilities.formatDate(messages[0].getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
                const lastMsg = Utilities.formatDate(messages[messages.length - 1].getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");

                sheet.getRange(i + 1, firstMsgCol + 1).setValue(firstMsg);
                sheet.getRange(i + 1, lastMsgCol + 1).setValue(lastMsg);
                updates++;
                Utilities.sleep(100);
              }
            }
          } catch (e) {
            console.error(`Error on row ${i + 1}: ${e.message}`);
          }
        }
      }
    }

    console.log(`Backfill complete. Updated ${updates} rows.`);
  } catch (e) {
    console.error(`backfillDatesInLog failed: ${e.message}`);
  }
}

/**
 * Recovers previously processed threads and saves them into the Script Properties.
 * @returns {void}
 */
function recoverMemoryState() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.STATE) {
    console.error("recoverMemoryState failed: SYSTEM_CONFIG or SYSTEM_CONFIG.STATE is undefined");
    return;
  }

  try {
    const props = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
    if (!props) {
      console.error("recoverMemoryState failed: PropertiesService is unavailable.");
      return;
    }

    const stateStr = SYSTEM_CONFIG.STATE.THREAD_STATE;
    const threadState = stateStr ? JSON.parse(stateStr) : {};

    const threads = GmailApp.search('label:"99 Label_Reviewed" newer_than:2d', 0, 100);

    let added = 0;
    threads.forEach(thread => {
      const messages = thread.getMessages();
      if (messages.length > 0) {
        const lastMsgId = messages[messages.length - 1].getId();
        if (!threadState[thread.getId()]) {
          threadState[thread.getId()] = lastMsgId;
          added++;
        }
      }
    });

    props.setProperty("THREAD_STATE", JSON.stringify(threadState));
    console.log(`Recovered memory for ${added} previously processed threads.`);
  } catch (e) {
    console.error(`recoverMemoryState failed: ${e.message}`);
  }
}

/**
 * Removes system labels from threads listed in a spreadsheet to re-process them.
 * @returns {void}
 */
function cleanLabelsFromSheetUrls() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("cleanLabelsFromSheetUrls failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  if (!SHEET_ID) {
    console.error("cleanLabelsFromSheetUrls failed: Missing MASTER_SHEET_ID in SYSTEM_CONFIG");
    return;
  }

  const CLEANUP_GID = '1593358623';

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CLEANUP_GID);

    if (!sheet) {
      console.error(`Cleanup sheet with GID ${CLEANUP_GID} not found.`);
      return;
    }

    const data = sheet.getDataRange().getValues();

    const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
    const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
    const tempDeleteLabel = GmailApp.getUserLabelByName("99 To be deleted");

    let count = 0;
    const BATCH_LIMIT = 100; // Process 100 per run to prevent timeout

    console.log(`Starting cleanup... Found ${data.length} total rows in the spreadsheet.`);

    for (let i = 0; i < data.length; i++) {
      if (count >= BATCH_LIMIT) {
        console.log(`\n⏸️ Hit batch limit of ${BATCH_LIMIT}. Run script again to continue.`);
        break;
      }

      const url = data[i][0] ? data[i][0].toString().trim() : "";
      const status = data[i][1] ? data[i][1].toString().trim() : "";

      if (url.includes("mail.google.com/mail/")) {
        if (status === "DONE") {
          continue;
        }

        const parts = url.split('/');
        let threadId = parts[parts.length - 1];
        threadId = threadId.split('?')[0];

        console.log(`\nProcessing Row ${i + 1}... Thread ID: ${threadId}`);

        try {
          const thread = GmailApp.getThreadById(threadId);
          if (thread) {
            if (processedLabel) thread.removeLabel(processedLabel);
            if (manualLabel) thread.removeLabel(manualLabel);
            if (tempDeleteLabel) thread.removeLabel(tempDeleteLabel);

            sheet.getRange(i + 1, 2).setValue("DONE");
            count++;
            console.log(`✅ Success: Removed labels from Thread ${threadId}. Marked DONE.`);
            Utilities.sleep(100);
          } else {
             sheet.getRange(i + 1, 2).setValue("ERROR: NOT FOUND");
             console.log(`❌ Error: Thread not found for Row ${i + 1}`);
          }
        } catch (e) {
          sheet.getRange(i + 1, 2).setValue(`ERROR: ${e.message}`);
          console.error(`❌ Failed for Row ${i + 1} - Error: ${e.message}`);
        }
      }
    }

    console.log(`\n🏁 Finished execution. Successfully processed ${count} threads this run.`);
  } catch (e) {
    console.error(`cleanLabelsFromSheetUrls failed: ${e.message}`);
  }
}
