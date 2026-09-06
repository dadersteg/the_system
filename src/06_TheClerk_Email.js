/**
 * @file 06_TheClerk_Email.js
 * @description The Clerk Email Triage Pipeline, Deterministic Rule Matching, AI BLUF Summarization, Label Management & Task Injection.
 */

/**
 * @file Code_TheClerk_Email.js
 * @description THE CLERK: EMAIL TRIAGE ENGINE. Sweeps unprocessed emails, applies deterministic rules via Google Sheets, infers context via Gemini AI, and auto-labels or temp-deletes them.
 *
 * @version 1.0.2
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Hoisted API calls for configs to runTheClerkEmailOngoing to avoid redundant requests. Refactored log writing to batch operations (writeBatchLogEntries) to prevent timeouts.
 * - 1.0.2: Added comprehensive JSDoc comment for the PROCESS_LIMIT constant.
 */

// --- CONFIGURATION ---
const MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
const RETRO_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_RETRO_MODEL || "gemini-3.5-flash-lite";
const API_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;

// Drive File ID for the AI Prompt provided by the user.
// Drive File ID for the AI Prompt provided by the user.
const DOC_ID = SYSTEM_CONFIG.DOCS.CLERK_EMAIL_PROMPT_ID;
const BLUF_DOC_ID = SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID;
const TAXONOMY_JSON_ID = SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID;

const SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;

const AUDIT_GID = SYSTEM_CONFIG.SHEETS.LABEL_MANAGEMENT; // Label Management Tab
const ALIAS_GID = SYSTEM_CONFIG.SHEETS.ALIAS_WHITELIST; // Alias Whitelist Tab
const LOG_GID = SYSTEM_CONFIG.SHEETS.EMAIL_LOG;   // Granular Execution Log (Ongoing)
const RETRO_LOG_GID = SYSTEM_CONFIG.SHEETS.EMAIL_RETRO_LOG;       // Retro Execution Log (Leave blank to auto-create)
const DETERMINISTIC_RULES_GID = SYSTEM_CONFIG.SHEETS.EMAIL_DETERMINISTIC_RULES; // Combined Rules Tab

// System Labels
const PROCESSED_FLAG = '99 Label_Reviewed'; 
const TEMP_DELETE_LABEL = '99 To be deleted';
const MANUAL_REVIEW_LABEL = '00 Manual Review';

let labelIdMap = null;

// =============================================================================
// 1. MAIN AUTOMATION ENGINE
// =============================================================================

function runTheClerkEmailOngoing() {
  if (!isPipelineAuthorized("CLERK_EMAIL")) {
    return "Skipped (Scope Mismatch)";
  }

  // Check Cross-Machine Heartbeat Lease from local Mac mini
  if (isLocalEngineActive("CLERK_EMAIL", 30)) {
    console.log("[TheClerk_Email] Skipping cloud sweep: Local Mac mini heartbeat lease active.");
    return "Skipped (Local Mac mini engine lease active)";
  }

  getLabelIdByName(PROCESSED_FLAG);
  getLabelIdByName(TEMP_DELETE_LABEL);
  
  // THE SWEEPER: Catch all unprocessed emails (Drops out once labeled, impossible to bury)
  // Temporarily set to 7d to catch up on the 1-week backlog. Can be reduced to 2d later.
  const newEmailQuery = `-label:"${PROCESSED_FLAG}" newer_than:7d`;

  // Fast-Path Zero-Thread Check: If inbox is already triaged by Antigravity, skip all heavy doc reads and AI
  const pendingThreads = GmailApp.search(newEmailQuery, 0, 1);
  if (pendingThreads.length === 0) {
    console.log(`[TheClerk_Email] 0 unprocessed threads found. Inbox clean! Exiting safety net immediately.`);
    return "SUCCESS: 0 unprocessed threads found (Clean queue early exit in <2s)";
  } else {
    let blufPrompt = "";
    try {
      const iterBluf = DriveApp.getFilesByName("202608 - The Clerk BLUF Summary System Prompt.md");
      if (iterBluf.hasNext()) {
        blufPrompt = getSafeDocText(iterBluf.next().getId());
      }
    } catch(e) {}
    if (!blufPrompt && BLUF_DOC_ID) {
      blufPrompt = getSafeDocText(BLUF_DOC_ID);
    }

    // Hoist API calls outside of the main loop
    const configPayload = {
      deterministicRules: getDeterministicRules(),
      allowedAliases: getAllowedAliases(),
      fullDocPrompt: getSafeDocText(DOC_ID),
      blufPrompt: blufPrompt,
      taxonomyJsonStr: getRawFileText(TAXONOMY_JSON_ID),
      personalGoalsStr: IS_CE_ENV ? "" : getSafeDocText(SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID),
      workGoalsStr: getSafeDocText(SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID)
    };

    // Run the batch (Limit 15 to prevent timeout)
    executeTriageEngine(newEmailQuery, 15, false, configPayload);
  }
  
  // INBOX STATUS RECONCILIATION: Continuously update sheet status if emails were archived, trashed, or moved
  try {
    syncEmailTriageInboxStatus(60);
  } catch (e) {
    console.warn("syncEmailTriageInboxStatus warning: " + e.message);
  }

  // BIDIRECTIONAL SYNC: Apply any manual spreadsheet overrides (Revised Labels) back to Gmail
  try {
    processManualSheetOverrides(500);
  } catch (e) {
    console.warn("processManualSheetOverrides warning: " + e.message);
  }

  // THE PHOTO EXTRACTOR: Process any new Telegram/Messenger backup photos (Private only)
  if (isPipelineAuthorized("CLERK_PHOTOS")) {
    try {
      runRetroactivePhotoSync();
    } catch(e) {
      console.warn("runRetroactivePhotoSync failed: " + e.message);
    }
  }
  
  return "Successfully swept inbox, triaged emails, and synchronized inbox statuses.";
}

/**
 * Executes a dedicated recovery pass to process emails missed due to API outages.
 */
function runRecoveryCatchup() {
  console.log("Running recovery catch-up for missed emails...");
  runTheClerkEmailOngoing(); // Just reuse the main sweep logic since it inherently catches up
}

function executeTriageEngine(searchQuery, searchLimit, isRetro, configPayload) {
  const threads = GmailApp.search(searchQuery, 0, searchLimit); 
  
  const runTimestamp = new Date();
  const currentModel = isRetro ? RETRO_MODEL_NAME : MODEL_NAME;
  console.log(`Found ${threads.length} threads. Syncing with ${currentModel}.`);
  if (threads.length === 0) return;

  const deterministicRules = configPayload ? configPayload.deterministicRules : getDeterministicRules();
  const allowedAliases = configPayload ? configPayload.allowedAliases : getAllowedAliases();
  const fullDocPrompt = (configPayload && configPayload.fullDocPrompt) ? configPayload.fullDocPrompt : getSafeDocText(DOC_ID);
  const blufPrompt = (configPayload && configPayload.blufPrompt) ? configPayload.blufPrompt : (BLUF_DOC_ID ? getSafeDocText(BLUF_DOC_ID) : "");
  const taxonomyJsonStr = configPayload ? configPayload.taxonomyJsonStr : getRawFileText(TAXONOMY_JSON_ID);
  const rawPersonalGoals = configPayload ? configPayload.personalGoalsStr : (IS_CE_ENV ? "" : getSafeDocText(SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID));
  const rawWorkGoals = configPayload ? configPayload.workGoalsStr : getSafeDocText(SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID);
  const personalGoalsStr = (typeof getCompactGoalSummaries === 'function') ? getCompactGoalSummaries(rawPersonalGoals) : rawPersonalGoals.substring(0, 2000);
  const workGoalsStr = (typeof getCompactGoalSummaries === 'function') ? getCompactGoalSummaries(rawWorkGoals) : rawWorkGoals.substring(0, 2000);
  
  const taxonomyMaps = _buildTaxonomyMaps(taxonomyJsonStr);
  const safeTaxonomyJsonStr = taxonomyMaps.safeTaxonomyJsonStr;
  const labelToPathMap = taxonomyMaps.labelToPathMap;
  const activeTaskMap = getActiveThreadTaskMap();

  let processedCount = 0;
  const batchLogs = [];
  const cleanupBuffer = [];

  /**
   * @constant {number} PROCESS_LIMIT
   * @description Restricts the total number of email threads processed in a single execution.
   * This limit acts as a critical safety valve to prevent the script from exceeding the
   * Google Apps Script 6-minute hard execution timeout, ensuring state changes and logs
   * are successfully committed before the script terminates.
   */
  const PROCESS_LIMIT = 15; // Max threads processed per run to prevent 6-min timeout
  const sessionStart = Date.now();
  const CHUNK_SIZE = 5;

  for (let index = 0; index < threads.length; index += CHUNK_SIZE) {
    if (processedCount >= PROCESS_LIMIT || (Date.now() - sessionStart > 280000)) {
      console.log(`Hit processing limit or approaching timeout. Stopping safely.`);
      break;
    }
    
    const chunkThreads = threads.slice(index, Math.min(index + CHUNK_SIZE, threads.length));
    const threadContexts = chunkThreads.map((t, idx) => _extractThreadContext(t, index + idx, threads.length, deterministicRules, allowedAliases));
    
    const itemsNeedingAI = [];
    const itemsBypassedAI = [];

    threadContexts.forEach(ctx => {
      if (ctx.ssMatch && ctx.ssMatch.skipAI) {
        ctx.aiMatch = {
          categories: [],
          keepInInbox: ctx.ssMatch.keepInInbox,
          markAsRead: ctx.ssMatch.markAsRead,
          deleteEmail: ctx.ssMatch.labels.includes('99 To be deleted'),
          summary: "Auto-categorized via Spreadsheet Rule (AI Bypassed)",
          actionItems: []
        };
        itemsBypassedAI.push(ctx);
      } else {
        itemsNeedingAI.push(ctx);
      }
    });

    // 1. Process deterministic rule matches immediately
    itemsBypassedAI.forEach(ctx => {
      const res = _formatProcessedThread(ctx, ctx.aiMatch, runTimestamp, labelToPathMap, activeTaskMap);
      cleanupBuffer.push(res.cleanupItem);
      batchLogs.push(res.logItem);
      processedCount++;
    });

    // 2. Process AI threads
    if (itemsNeedingAI.length > 0) {
      const openTasksStr = activeTaskMap.openTasksForAI.join('\n');
      
      // Separate multimodal threads (with attached images) from pure-text threads
      const textThreads = [];
      const imageThreads = [];
      itemsNeedingAI.forEach(ctx => {
        if (ctx.inlineImages && ctx.inlineImages.length > 0) {
          imageThreads.push(ctx);
        } else {
          textThreads.push(ctx);
        }
      });

      // Process pure-text threads in high-efficiency batch
      if (textThreads.length === 1) {
        const ctx = textThreads[0];
        const singleAiMatch = callLLMWithSourceContext(
          ctx.subject, ctx.sender, ctx.body, fullDocPrompt, safeTaxonomyJsonStr,
          ctx.existingLabels, ctx.ssLabels, isRetro, currentModel, ctx.inlineImages,
          ctx.systemNotes, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt
        );
        if (singleAiMatch) {
          const res = _formatProcessedThread(ctx, singleAiMatch, runTimestamp, labelToPathMap, activeTaskMap);
          cleanupBuffer.push(res.cleanupItem);
          batchLogs.push(res.logItem);
          processedCount++;
        } else {
          console.log(` > Skipping thread due to AI failure. Flagging for Manual Review.`);
          const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
          const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
          if (manualLabel) ctx.thread.addLabel(manualLabel);
          if (processedLabel) ctx.thread.addLabel(processedLabel);
        }
      } else if (textThreads.length > 1) {
        console.log(`Executing multi-item batch AI evaluation for ${textThreads.length} text threads...`);
        let batchResults = callLLMBatchEmailThreads(
          textThreads, fullDocPrompt, safeTaxonomyJsonStr, isRetro, currentModel,
          personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt
        );

        if (batchResults && Array.isArray(batchResults) && batchResults.length === textThreads.length) {
          // Happy path: batch succeeded in a single API call!
          textThreads.forEach((ctx, i) => {
            const aiDecision = batchResults[i];
            const res = _formatProcessedThread(ctx, aiDecision, runTimestamp, labelToPathMap, activeTaskMap);
            cleanupBuffer.push(res.cleanupItem);
            batchLogs.push(res.logItem);
            processedCount++;
          });
        } else {
          // Fallback: Split-and-Retry 1-by-1
          console.warn(`[FALLBACK] Multi-item batch did not return valid array. Executing split-and-retry 1-by-1...`);
          textThreads.forEach(ctx => {
            const singleAiMatch = callLLMWithSourceContext(
              ctx.subject, ctx.sender, ctx.body, fullDocPrompt, safeTaxonomyJsonStr,
              ctx.existingLabels, ctx.ssLabels, isRetro, currentModel, ctx.inlineImages,
              ctx.systemNotes, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt
            );
            if (singleAiMatch) {
              const res = _formatProcessedThread(ctx, singleAiMatch, runTimestamp, labelToPathMap, activeTaskMap);
              cleanupBuffer.push(res.cleanupItem);
              batchLogs.push(res.logItem);
              processedCount++;
            } else {
              console.log(` > Skipping thread due to AI failure. Flagging for Manual Review.`);
              const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
              const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
              if (manualLabel) ctx.thread.addLabel(manualLabel);
              if (processedLabel) ctx.thread.addLabel(processedLabel);
            }
          });
        }
      }

      // Process multimodal image threads individually with full image fidelity
      imageThreads.forEach(ctx => {
        console.log(`Analyzing multimodal email thread: ${ctx.subject}...`);
        const singleAiMatch = callLLMWithSourceContext(
          ctx.subject, ctx.sender, ctx.body, fullDocPrompt, safeTaxonomyJsonStr,
          ctx.existingLabels, ctx.ssLabels, isRetro, currentModel, ctx.inlineImages,
          ctx.systemNotes, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt
        );
        if (singleAiMatch) {
          const res = _formatProcessedThread(ctx, singleAiMatch, runTimestamp, labelToPathMap, activeTaskMap);
          cleanupBuffer.push(res.cleanupItem);
          batchLogs.push(res.logItem);
          processedCount++;
        } else {
          console.log(` > Skipping thread due to AI failure. Flagging for Manual Review.`);
          const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
          const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
          if (manualLabel) ctx.thread.addLabel(manualLabel);
          if (processedLabel) ctx.thread.addLabel(processedLabel);
        }
      });
    }
  } // End of chunked loop

  if (batchLogs.length > 0) {
    writeBatchLogEntries(batchLogs, isRetro);
  }

  if (cleanupBuffer.length > 0) {
    cleanupBuffer.forEach(item => {
      executeAtomicCleanup(item.thread, item.config, item.existingLabels);
    });
  }
}

/**
 * Extracts taxonomy parsing into a helper to keep triage engine clean.
 * @param {string} taxonomyJsonStr
 * @returns {Object} Contains safeTaxonomyJsonStr and labelToPathMap
 */
function _buildTaxonomyMaps(taxonomyJsonStr) {
  let safeTaxonomyJsonStr = taxonomyJsonStr;
  const labelToPathMap = {};
  try {
    let parsedTaxonomy = null;
    if (taxonomyJsonStr && typeof taxonomyJsonStr === 'string' && taxonomyJsonStr.trim() !== "") {
      const s = taxonomyJsonStr.indexOf('[');
      if (s !== -1) {
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;
        let e = -1;
        for (let i = s; i < taxonomyJsonStr.length; i++) {
          const char = taxonomyJsonStr[i];
          if (escapeNext) { escapeNext = false; continue; }
          if (char === '\\') { escapeNext = true; continue; }
          if (char === '"') { inString = !inString; continue; }
          if (!inString) {
            if (char === '[') bracketCount++;
            else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) { e = i; break; }
            }
          }
        }
        if (e !== -1) taxonomyJsonStr = taxonomyJsonStr.substring(s, e + 1);
      }
      try {
        parsedTaxonomy = JSON.parse(taxonomyJsonStr);
      } catch (err) {
        console.warn("Could not parse taxonomyJsonStr: " + err.message);
      }
    }

    // Fallback directly to 3 Config - Workspace Taxonomy sheet
    if (!Array.isArray(parsedTaxonomy) || parsedTaxonomy.length === 0) {
      console.log("Loading taxonomy directly from 3 Config - Workspace Taxonomy sheet...");
      const ss = getMasterSpreadsheet();
      const targetGid = SYSTEM_CONFIG.SHEETS.LOS_TAXONOMY;
      const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
      if (sheet) {
        const rows = sheet.getDataRange().getValues();
        if (rows.length > 1) {
          const headers = rows[0];
          const labelIdx = headers.indexOf("Concat (Label)") !== -1 ? headers.indexOf("Concat (Label)") : 8;
          const pathIdx = headers.indexOf("Concat (Path)") !== -1 ? headers.indexOf("Concat (Path)") : 9;
          parsedTaxonomy = [];
          for (let i = 1; i < rows.length; i++) {
            const label = rows[i][labelIdx];
            const path = rows[i][pathIdx];
            if (label && typeof label === "string" && label.trim() !== "") {
              parsedTaxonomy.push({ "Concat (Label)": label.trim(), "Concat (Path)": (path || label).trim() });
            }
          }
        }
      }
    }

    if (Array.isArray(parsedTaxonomy)) {
      parsedTaxonomy.forEach(item => {
        if (item["Concat (Label)"] && item["Concat (Path)"]) {
          labelToPathMap[item["Concat (Label)"]] = item["Concat (Path)"];
        }
        delete item["Concat (Path)"];
      });
      safeTaxonomyJsonStr = JSON.stringify(parsedTaxonomy);
    }
  } catch (e) {
    console.error("Failed to parse taxonomy: " + e.message);
  }
  return { safeTaxonomyJsonStr, labelToPathMap };
}

/**
 * Pushes or appends action items as Tasks to the Importer list.
 * @param {Array} validActions
 * @param {string} primaryCategoryLabel
 * @param {Object} labelToPathMap
 * @param {Object} activeTaskMap
 * @param {string} threadId
 * @param {string} threadUrl
 * @param {string} importerListId
 * @returns {Array} Array of created task IDs.
 */
function _syncTasksForThread(validActions, primaryCategoryLabel, labelToPathMap, activeTaskMap, threadId, threadUrl, importerListId, subject = "") {
  const syncedTaskIds = [];
  const safeSubject = (subject || "").replace(/[\r\n\t]+/g, " ").trim() || "(No Subject)";

  validActions.forEach(actionObj => {
    const actionTitle = actionObj.title;
    const cleanTitle = (actionTitle.split(' - ')[0] || actionTitle).replace(/^\[[A-Za-z]+\]\s*/, "").trim();
    const lookupTitle = cleanTitle.toLowerCase().trim();

    let existingRef = activeTaskMap.byTitle[lookupTitle] || (actionObj.mapped_task_id && actionObj.mapped_task_id !== "None" ? activeTaskMap.byId[actionObj.mapped_task_id] : null);

    if (existingRef) {
        console.log(` > Task already exists or was mapped by AI. Appending action item.`);
        try {
            let existingTask = existingRef.taskObj;
            existingTask.notes = (existingTask.notes || "") + `\n\n[UPDATE - Subject: ${safeSubject}]: ${actionTitle}\nLink: ${threadUrl}`;

            if (actionObj.mark_completed_reason && actionObj.mark_completed_reason !== "None") {
               if (!existingTask.title.startsWith("99 Done ")) {
                  existingTask.title = "99 Done - " + existingTask.title;
               }
               existingTask.notes += `\n\nSYS: To be marked as Done because: ${actionObj.mark_completed_reason}`;
            }

            Tasks.Tasks.patch({ notes: existingTask.notes, title: existingTask.title }, existingRef.listId, existingTask.id);
            console.log(` > Successfully appended to existing task.`);
        } catch (e) {
            console.error(`Failed to append to existing task: ${e.message}`);
        }
    } else {
        const aiCategory = actionObj.category_path || primaryCategoryLabel;
        const finalCategoryPath = labelToPathMap[aiCategory] || aiCategory;

        let deadlineVal = actionObj.deadline && actionObj.deadline !== "None" ? actionObj.deadline : "None";

        const metadata = {
           duration: "15m",
           goal: actionObj.goal_urn && actionObj.goal_urn.startsWith("2026-") ? actionObj.goal_urn : "Maintenance",
           category_path: finalCategoryPath,
           created_at: new Date().toISOString()
        };
        if (deadlineVal !== "None") {
            metadata.deadline = deadlineVal;
        }

        const dueVal = (deadlineVal !== "None") ? deadlineVal + "T00:00:00.000Z" : "";
        const tempNotesForHash = buildTaskNotes(threadUrl, safeSubject, actionTitle, {}, undefined, undefined, "Subject: ", "");
        const initialHash = getStandardizedTaskHash(cleanTitle, tempNotesForHash, dueVal, "needsAction", true);

        const notes = buildTaskNotes(threadUrl, safeSubject, actionTitle, metadata, undefined, undefined, "Subject: ", "");

        try {
           const taskPayload = {
              title: cleanTitle,
              notes: notes
           };
           if (deadlineVal !== "None") {
              taskPayload.due = dueVal;
           }
           const created = Tasks.Tasks.insert(taskPayload, importerListId);
           syncedTaskIds.push(created.id);
           console.log(` > Pushed task to Importer: ${cleanTitle}`);
        } catch(e) {
           console.error("Failed to push task to Importer: " + e.message);
        }
    }
  });
  return syncedTaskIds;
}

/**
 * Merges SS and AI data. Spreadsheet rules take deterministic precedence.
 */
function mergeConfigs(ss, ai) {
  const config = { 
    labels: [], 
    keepInInbox: true, 
    markAsRead: false,
    deleteEmail: false
  };
  
  if (ai) {
    ai.categories.forEach(cat => {
      if (cat && cat !== "Skip" && !cat.includes('99 To be deleted') && !config.labels.includes(cat)) {
        config.labels.push(cat);
      }
    });
    config.keepInInbox = ai.keepInInbox ?? true;
    config.markAsRead = ai.markAsRead ?? false;
    config.deleteEmail = ai.deleteEmail ?? false;
  }

  // Deterministic override (Spreadsheet overrides AI guesses)
  if (ss) {
    if (ss.labels && ss.labels.length > 0) {
      // If the spreadsheet labels are strictly operational (starts with "99 "), we COMBINE them with the AI context labels.
      // If it's a hard category (like "01 Private..."), it OVERWRITES the AI.
      const isOnlyOperational = ss.labels.every(l => l.startsWith('99 '));
      
      if (isOnlyOperational) {
        config.labels = [...new Set([...config.labels, ...ss.labels])];
      } else {
        config.labels = [...ss.labels];
      }
      
      // Deletion Logic: 
      // If the spreadsheet explicitly demands deletion, enforce it.
      if (ss.labels.includes('99 To be deleted')) {
        config.deleteEmail = true;
      }
      
      // Explicit Protection: If the spreadsheet explicitly categorized this as a Newsletter, NEVER delete it.
      // This protects your curated reading list while still allowing the AI to delete Bank 2FA codes.
      if (ss.labels.some(l => l.includes('Newsletters'))) {
        config.deleteEmail = false;
      }
    }
    config.keepInInbox = ss.keepInInbox;
    config.markAsRead = ss.markAsRead;
  }
  
  return config;
}

/**
 * Writes granular logs to the Spreadsheet in a single batch
 */
function writeBatchLogEntries(batchLogsArray, isRetro) {
  if (!batchLogsArray || batchLogsArray.length === 0) return;

  const ss = getMasterSpreadsheet();
  
  const targetGid = isRetro ? RETRO_LOG_GID : LOG_GID;
  const fallbackName = isRetro ? "Execution Log - Retro" : "Execution Log";
  
  let sheet = null;
  if (targetGid) {
    sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  }
  
  if (!sheet) {
    sheet = ss.getSheetByName(fallbackName);
    if (!sheet) {
      sheet = ss.insertSheet(fallbackName);
      sheet.appendRow([
        "Timestamp", "Received First Message", "Received Last Message", "Subject", "AI Categories", "SS Labels", "Alias Labels", 
        "Final Label Set", "Link", "Inbox Status", "Read State", "Sender",
        "AI Summary", "AI Action Items", "Task Synced", "Revised Labels (Override)", "Override Status"
      ]);
      sheet.getRange("A1:Q1").setFontWeight("bold").setBackground("#cfe2f3");
    }
  }

  const data = sheet.getDataRange().getValues();
  let headerRowIdx = 0;
  if (data.length > 1 && data[0].findIndex(h => h.toString().trim().toLowerCase() === "link") === -1) {
    headerRowIdx = 1;
  }
  
  let headers = data.length > 0 ? data[headerRowIdx] : [];
  if (headers.length === 0) {
    headers = Object.keys(batchLogsArray[0]);
    sheet.appendRow(headers);
    headerRowIdx = sheet.getLastRow() - 1;
  }

  const rowsToWrite = [];

  const headerMap = new Map();
  headers.forEach((h, i) => {
    headerMap.set(h.toString().trim().toLowerCase(), i);
  });

  let newHeadersAdded = false;

  batchLogsArray.forEach(rowObj => {
    const newRow = new Array(headers.length).fill("");
    Object.keys(rowObj).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (headerMap.has(lowerKey)) {
        newRow[headerMap.get(lowerKey)] = rowObj[key];
      } else {
        headers.push(key);
        newRow.push(rowObj[key]);
        headerMap.set(lowerKey, headers.length - 1);
        newHeadersAdded = true;

        // Pad all previously processed rows in rowsToWrite to match the new header count
        rowsToWrite.forEach(row => {
          while (row.length < headers.length) {
            row.push("");
          }
        });
      }
    });

    // Pad newRow so all inserted rows have uniform columns
    while (newRow.length < headers.length) {
      newRow.push("");
    }
    rowsToWrite.push(newRow);
  });

  if (newHeadersAdded) {
    sheet.getRange(headerRowIdx + 1, 1, 1, headers.length).setValues([headers]);
  }

  if (rowsToWrite.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, headers.length).setValues(rowsToWrite);
  }
}

// --- CORE UTILITIES ---

/**
 * Extracts valid multimodal attachments (images, small PDFs) and builds system notes for huge PDFs.
 * @param {GoogleAppsScript.Gmail.GmailMessage} lastMsg
 * @returns {Object} { inlineImages: Array, systemNotes: string }
 */
function _extractMultimodalAttachments(lastMsg) {
  let inlineImages = [];
  let systemNotes = "";
  try {
    const attachments = lastMsg.getAttachments();
    for (let att of attachments) {
      const mime = att.getContentType();
      const size = att.getSize();

      const isImage = mime.startsWith('image/') && size > 10240;
      const isSmallPdf = mime === 'application/pdf' && size < 4 * 1024 * 1024;
      const isHugePdf = mime === 'application/pdf' && size >= 4 * 1024 * 1024;

      if (isImage || isSmallPdf) {
        inlineImages.push({
          mimeType: mime,
          data: Utilities.base64Encode(att.getBytes())
        });
        if (inlineImages.length >= 2) break;
      } else if (isHugePdf) {
        systemNotes += `\n- This email contains a large PDF attachment ("${att.getName()}", ${(size / (1024 * 1024)).toFixed(2)} MB) which exceeds the automated processing limit. You MUST extract an action item to "Manually review large PDF attachment: ${att.getName()}".`;
      }
    }
  } catch (e) {
    console.warn(`Failed to extract images: ${e.message}`);
  }
  return { inlineImages: inlineImages, systemNotes: systemNotes };
}

/**
 * Evaluates sender, subject, and body against deterministic rules from the spreadsheet.
 * @param {string} sender
 * @param {string} subject
 * @param {string} body
 * @param {Array} deterministicRules
 * @returns {Object|null}
 */
function _evaluateDeterministicRules(sender, subject, body, deterministicRules) {
  let tempLabels = [];
  let keepInInboxVals = [];
  let markAsReadVals = [];
  let skipAIVals = [];

  const lowerSender = sender.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();

  deterministicRules.forEach(rule => {
    let isMatch = true;
    if (rule.sender && !lowerSender.includes(rule.sender)) isMatch = false;
    if (rule.subject && !lowerSubject.includes(rule.subject)) isMatch = false;
    if (rule.emailContains && !lowerBody.includes(rule.emailContains)) isMatch = false;

    if (isMatch) {
      if (rule.labels && rule.labels.length > 0) tempLabels.push(...rule.labels);
      keepInInboxVals.push(rule.keepInInbox);
      markAsReadVals.push(rule.markAsRead);
      skipAIVals.push(rule.skipAI);
    }
  });

  if (tempLabels.length > 0 || keepInInboxVals.length > 0 || skipAIVals.length > 0) {
     return {
       labels: [...new Set(tempLabels)],
       keepInInbox: keepInInboxVals.length > 0 ? keepInInboxVals.some(v => v === true) : true,
       markAsRead: markAsReadVals.some(v => v === true),
       skipAI: skipAIVals.some(v => v === true)
     };
  }
  return null;
}

function callLLMWithSourceContext(subject, from, body, docInstructions, taxonomyJson, existing, ss, isRetro, modelName, inlineImages, systemNotes, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt) {
  
  // 1. Fetch prompt from docInstructions (which now contains placeholders)
  let finalPrompt = docInstructions || "";

  // 2. Dynamic Replacements
  const systemTime = new Date().toISOString();
  finalPrompt = finalPrompt.replace('{{SYSTEM_TIME}}', systemTime);

  if (isRetro) {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "*** RETRO MODE ACTIVE: Do NOT generate 'actionItems'. Leave it as an empty array to save tokens. Focus ONLY on categorisation, deletion logic, and summary. ***");
  } else {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "");
  }

  const defaultBluf = `## BOTTOM LINE UP FRONT (BLUF) SUMMARY INSTRUCTIONS
For the summary field:
1. Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary for this email/thread.
2. Extract the core message, key decisions, and any critical deadlines or requirements.
3. Maintain a highly efficient, punchy tone. Remove all filler and corporate pleasantries.
4. CRITICAL: Do NOT output any URLs, web links, or markdown link formatting. Output pure plain text only.`;

  const activeBluf = blufPrompt ? blufPrompt.trim() : defaultBluf;

  // 3. Append JSON context, BLUF prompt, and Goal Lists
  finalPrompt += `\n\n${activeBluf}\n\n--- OPEN TASKS ---\n${openTasksStr}\n\n--- VALID TAXONOMY CATEGORIES (Use 'Concat' logic or textual names) ---\n${taxonomyJson}\n\n--- MASTER GOAL LISTS ---\n**PERSONAL GOALS:**\n${personalGoalsStr}\n\n**CE GOALS:**\n${workGoalsStr}\n\n--- CONTEXT: PRE-EXISTING LABELS --- [ ${existing.join(', ') || "None"} ]\n--- CONTEXT: SPREADSHEET RULES --- [ ${ss.join(', ') || "None"} ]\n--- SYSTEM DIRECTIVES ---\n${systemNotes || "None"}\n--- EMAIL DATA ---\nFROM: ${from} | SUBJECT: ${subject} | BODY: ${body}\nJSON:`;
  
  const parts = [{ "text": finalPrompt }];
  if (inlineImages && inlineImages.length > 0) {
    inlineImages.forEach(img => {
      parts.push({
        "inlineData": {
          "mimeType": img.mimeType,
          "data": img.data
        }
      });
    });
  }
  
  const schema = {
    "type": "OBJECT",
    "properties": {
      "categories": { "type": "ARRAY", "items": { "type": "STRING" } },
      "keepInInbox": { "type": "BOOLEAN" },
      "markAsRead": { "type": "BOOLEAN" },
      "deleteEmail": { "type": "BOOLEAN" },
      "summary": { "type": "STRING", "description": "Concise, maximum 500-character Bottom Line Up Front (BLUF) plain-text summary. No URLs or links." },
      "actionItems": { 
        "type": "ARRAY", 
        "items": { 
          "type": "OBJECT",
          "properties": {
            "title": { "type": "STRING" },
            "goal_urn": { "type": "STRING" },
            "category_path": { "type": "STRING" },
            "deadline": { "type": "STRING", "description": "YYYY-MM-DD or None" },
            "mapped_task_id": { "type": "STRING", "description": "If this email is a confirmation or update for an existing OPEN TASK, output its EXACT ID here. Otherwise 'None'."},
            "mark_completed_reason": { "type": "STRING", "description": "If this email confirms the mapped task is complete, provide a detailed reason why (e.g. 'Flight confirmation received'). Otherwise 'None'."}
          },
          "required": ["title", "goal_urn", "category_path", "deadline"]
        } 
      }
    },
    "required": ["categories", "keepInInbox", "markAsRead", "deleteEmail", "summary", "actionItems"]
  };
  
  const genOptions = { maxOutputTokens: 800, thinkingBudget: 0 };
  let parsed = callGemini(parts, modelName, "You are a helpful email clerk assistant.", schema, false, genOptions);
  
  // Resilient Ingestion Fallback: 3.5 Flash-Lite -> 3.7 Flash
  if (!parsed || parsed.error) {
    const liteFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_LITE || "gemini-3.5-flash-lite";
    if (modelName !== liteFallback) {
      console.warn(`The Clerk Email failed on ${modelName}, falling back to Ingestion Fallback: ${liteFallback}...`);
      parsed = callGemini(parts, liteFallback, "You are a helpful email clerk assistant.", schema, false, genOptions);
    }
  }
  if (!parsed || parsed.error) {
    const proFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_PRO || "gemini-3.7-flash";
    if (modelName !== proFallback) {
      console.warn(`The Clerk Email fallback failed, attempting Primary Fallback: ${proFallback}...`);
      parsed = callGemini(parts, proFallback, "You are a helpful email clerk assistant.", schema, false, genOptions);
    }
  }
  
  if (parsed && !parsed.error) {
    let cats = [];
    if (parsed.categories && Array.isArray(parsed.categories)) cats = parsed.categories;
    else if (parsed.category && parsed.category !== "Skip") cats = [parsed.category];

    return { 
      categories: cats, 
      keepInInbox: parsed.keepInInbox ?? true, 
      markAsRead: parsed.markAsRead ?? false,
      deleteEmail: parsed.deleteEmail ?? false,
      summary: parsed.summary || "",
      actionItems: parsed.actionItems || []
    };
  } else {
    console.error(`LLM API Error: ${parsed ? parsed.error : "Unknown Error"}`);
    return null;
  }
}

/**
 * Executes a multi-item batch call to Gemini for up to 5 email threads in a single prompt.
 * @returns {Array|null} Array of parsed decision objects or null on failure.
 */
function callLLMBatchEmailThreads(itemsNeedingAI, docInstructions, taxonomyJson, isRetro, modelName, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt) {
  let finalPrompt = docInstructions || "";
  const systemTime = new Date().toISOString();
  finalPrompt = finalPrompt.replace('{{SYSTEM_TIME}}', systemTime);

  if (isRetro) {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "*** RETRO MODE ACTIVE: Do NOT generate 'actionItems'. Leave it as an empty array to save tokens. Focus ONLY on categorisation, deletion logic, and summary. ***");
  } else {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "");
  }

  const defaultBluf = `## BOTTOM LINE UP FRONT (BLUF) SUMMARY INSTRUCTIONS
For the summary field:
1. Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary for this email/thread.
2. Extract the core message, key decisions, and any critical deadlines or requirements.
3. Maintain a highly efficient, punchy tone. Remove all filler and corporate pleasantries.
4. CRITICAL: Do NOT output any URLs, web links, or markdown link formatting. Output pure plain text only.`;

  const activeBluf = blufPrompt ? blufPrompt.trim() : defaultBluf;

  finalPrompt += `\n\n${activeBluf}\n\n--- OPEN TASKS ---\n${openTasksStr}\n\n--- VALID TAXONOMY CATEGORIES (Use 'Concat' logic or textual names) ---\n${taxonomyJson}\n\n--- MASTER GOAL LISTS ---\n**PERSONAL GOALS:**\n${personalGoalsStr}\n\n**CE GOALS:**\n${workGoalsStr}\n\n--- BATCH INSTRUCTIONS ---\nYou are evaluating a batch of ${itemsNeedingAI.length} independent email threads.
Analyze each email thread carefully and return a single JSON ARRAY containing exactly ${itemsNeedingAI.length} decision objects in the exact same order as the inputs.\n`;

  const parts = [{ "text": finalPrompt }];

  itemsNeedingAI.forEach((item, idx) => {
    let emailBlock = `\n--- EMAIL THREAD [${idx}] ---\nFROM: ${item.sender} | SUBJECT: ${item.subject}\nCONTEXT: PRE-EXISTING LABELS: [ ${item.existingLabels.join(', ') || "None"} ] | SPREADSHEET RULES: [ ${item.ssLabels.join(', ') || "None"} ]\nSYSTEM DIRECTIVES: ${item.systemNotes || "None"}\nBODY:\n${item.body}\n`;
    parts.push({ "text": emailBlock });
    if (item.inlineImages && item.inlineImages.length > 0) {
      item.inlineImages.forEach(img => {
        parts.push({
          "inlineData": {
            "mimeType": img.mimeType,
            "data": img.data
          }
        });
      });
    }
  });

  const schema = {
    "type": "ARRAY",
    "items": {
      "type": "OBJECT",
      "properties": {
        "categories": { "type": "ARRAY", "items": { "type": "STRING" } },
        "keepInInbox": { "type": "BOOLEAN" },
        "markAsRead": { "type": "BOOLEAN" },
        "deleteEmail": { "type": "BOOLEAN" },
        "summary": { "type": "STRING", "description": "Concise, maximum 500-character Bottom Line Up Front (BLUF) plain-text summary. No URLs or links." },
        "actionItems": { 
          "type": "ARRAY", 
          "items": { 
            "type": "OBJECT",
            "properties": {
              "title": { "type": "STRING" },
              "goal_urn": { "type": "STRING" },
              "category_path": { "type": "STRING" },
              "deadline": { "type": "STRING", "description": "YYYY-MM-DD or None" },
              "mapped_task_id": { "type": "STRING", "description": "If this email is a confirmation or update for an existing OPEN TASK, output its EXACT ID here. Otherwise 'None'."},
              "mark_completed_reason": { "type": "STRING", "description": "If this email confirms the mapped task is complete, provide a detailed reason why. Otherwise 'None'."}
            },
            "required": ["title", "goal_urn", "category_path", "deadline"]
          } 
        }
      },
      "required": ["categories", "keepInInbox", "markAsRead", "deleteEmail", "summary", "actionItems"]
    }
  };

  const genOptions = { maxOutputTokens: 2500, thinkingBudget: 0 };
  let parsed = callGemini(parts, modelName, "You are a helpful email clerk assistant.", schema, false, genOptions);

  if (!parsed || parsed.error || !Array.isArray(parsed) || parsed.length !== itemsNeedingAI.length) {
    const primaryFallback = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
    if (modelName !== primaryFallback) {
      console.warn(`The Clerk Email batch on ${modelName} encountered an issue, retrying with Primary Model: ${primaryFallback}...`);
      parsed = callGemini(parts, primaryFallback, "You are a helpful email clerk assistant.", schema, false, genOptions);
    }
  }

  if (Array.isArray(parsed) && parsed.length === itemsNeedingAI.length) {
    return parsed;
  }
  
  console.warn("Batch API did not return valid array matching batch size. Triggering Split-and-Retry fallback.");
  return null;
}

/**
 * Extracts and prepares thread metadata, bodies, attachments, and deterministic matches.
 */
function _extractThreadContext(thread, index, totalThreads, deterministicRules, allowedAliases) {
  const threadId = thread.getId();
  const messages = thread.getMessages();
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];

  const subject = firstMsg.getSubject();
  const sender = firstMsg.getFrom().toLowerCase();

  let body = "";
  let systemNotes = "";
  if (messages.length === 1) {
    body = messages[0].getPlainBody().substring(0, 3000);
  } else {
    const recentMessages = messages.slice(-3);
    const bodies = recentMessages.map((m, i) => `--- MSG ${i+1} (FROM: ${m.getFrom()}) ---\n${m.getPlainBody().substring(0, 1500)}`);
    body = bodies.join('\n\n');
  }

  const attachmentData = _extractMultimodalAttachments(lastMsg);
  const inlineImages = attachmentData.inlineImages;
  systemNotes += attachmentData.systemNotes;
  const threadUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;

  const firstMsgDate = Utilities.formatDate(firstMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
  const lastMsgDate = Utilities.formatDate(lastMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");

  console.log(`[${index + 1}/${totalThreads}] Preparing context: ${subject}`);

  const targetAliases = getWhitelistedAliases(firstMsg, allowedAliases);
  const existingLabels = thread.getLabels()
    .map(l => l.getName())
    .filter(n => n !== PROCESSED_FLAG);

  const ssMatch = _evaluateDeterministicRules(sender, subject, body, deterministicRules);
  const ssLabels = ssMatch ? ssMatch.labels : [];

  return {
    thread,
    threadId,
    firstMsg,
    lastMsg,
    subject,
    sender,
    body,
    inlineImages,
    systemNotes,
    threadUrl,
    firstMsgDate,
    lastMsgDate,
    targetAliases,
    existingLabels,
    ssMatch,
    ssLabels
  };
}

/**
 * Formats cleanup actions and spreadsheet log row for a completed thread decision.
 */
function _formatProcessedThread(ctx, aiMatch, runTimestamp, labelToPathMap, activeTaskMap) {
  const finalConfig = mergeConfigs(ctx.ssMatch, aiMatch);

  ctx.targetAliases.forEach(alias => {
    if (!finalConfig.labels.includes(alias)) finalConfig.labels.push(alias);
  });

  const isManual = finalConfig.labels.length === 0 && !finalConfig.deleteEmail;
  if (isManual) {
    finalConfig.labels = [MANUAL_REVIEW_LABEL];
    finalConfig.keepInInbox = true;
    finalConfig.markAsRead = false;
  }

  if (finalConfig.deleteEmail) {
    if (!finalConfig.labels.includes(TEMP_DELETE_LABEL)) {
      finalConfig.labels.push(TEMP_DELETE_LABEL);
    }
    finalConfig.keepInInbox = false;
    console.log(` > Flagged for deletion: ${ctx.subject}`);
  }

  const summaryLog = aiMatch.summary || "";
  let actionItemsLog = "";
  let syncedTaskIds = [];

  let validActions = [];
  if (aiMatch.actionItems && Array.isArray(aiMatch.actionItems)) {
     validActions = aiMatch.actionItems.filter(a => {
        if (typeof a !== 'object') return false;
        const str = (a.title || "").toLowerCase().trim();
        return str !== "" && str !== "none" && str !== "n/a" && str !== "null";
     });
  }

  if (validActions.length > 0) {
    actionItemsLog = validActions.map(a => a.title).join('; ');
    const primaryCategoryLabel = (aiMatch.categories && aiMatch.categories.length > 0) ? aiMatch.categories[0] : "00 Manual Review";
    const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;

    syncedTaskIds.push(..._syncTasksForThread(validActions, primaryCategoryLabel, labelToPathMap, activeTaskMap, ctx.threadId, ctx.threadUrl, importerListId, ctx.subject));
  }

  return {
    cleanupItem: { thread: ctx.thread, config: finalConfig, existingLabels: ctx.existingLabels },
    logItem: {
      "Timestamp": runTimestamp,
      "Received First Message": ctx.firstMsgDate,
      "Received Last Message": ctx.lastMsgDate,
      "Subject": ctx.subject,
      "AI Categories": (aiMatch.categories || []).join(', '),
      "SS Labels": ctx.ssLabels.join(', '),
      "Alias Labels": ctx.targetAliases.join(', '),
      "Final Label Set": finalConfig.labels.join(', '),
      "Link": ctx.threadUrl,
      "Inbox Status": finalConfig.deleteEmail ? "TEMP_DELETE" : (finalConfig.keepInInbox ? "INBOX" : "ARCHIVED"),
      "Read State": finalConfig.markAsRead ? "READ" : "UNREAD",
      "Sender": ctx.sender,
      "AI Summary": summaryLog,
      "AI Action Items": actionItemsLog,
      "Task Synced": syncedTaskIds.join(', '),
      "Revised Labels (Override)": "",
      "Override Status": ""
    }
  };
}

function executeAtomicCleanup(thread, config, existingLabels) {
  try {
    const threadId = thread.getId();
    const addIds = [];
    const removeIds = [];

    config.labels.forEach(name => {
      const id = getLabelIdByName(name);
      if (id) addIds.push(id);
    });
    addIds.push(getLabelIdByName(PROCESSED_FLAG));

    if (existingLabels && Array.isArray(existingLabels)) {
      existingLabels.forEach(n => {
        if (!config.labels.includes(n) && n !== PROCESSED_FLAG) {
          const rid = getLabelIdByName(n);
          if (rid) removeIds.push(rid);
        }
      });
    } else {
       // Fallback just in case
       thread.getLabels().forEach(l => {
         const n = l.getName();
         if (!config.labels.includes(n) && n !== PROCESSED_FLAG) {
           const rid = getLabelIdByName(n);
           if (rid) removeIds.push(rid);
         }
       });
    }

    if (!config.keepInInbox) removeIds.push('INBOX');
    if (config.markAsRead) removeIds.push('UNREAD');

    Gmail.Users.Threads.modify({
      "addLabelIds": [...new Set(addIds)],
      "removeLabelIds": [...new Set(removeIds)]
    }, "me", threadId);
  } catch (e) { console.error(` > API Error: ${e.message}`); }
}

function getLabelIdByName(name) {
  if (!labelIdMap) {
    labelIdMap = {};
    const response = Gmail.Users.Labels.list("me");
    if (response.labels) response.labels.forEach(l => labelIdMap[l.name] = l.id);
  }
  if (!labelIdMap[name]) {
    try {
      GmailApp.createLabel(name);
      const response = Gmail.Users.Labels.list("me");
      if (response.labels) response.labels.forEach(l => labelIdMap[l.name] = l.id);
    } catch(e) { return null; }
  }
  return labelIdMap[name];
}

function getDeterministicRules() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === DETERMINISTIC_RULES_GID);
  if (!sheet) {
    console.error(`ERROR: Deterministic Rules tab with GID ${DETERMINISTIC_RULES_GID} not found!`);
    return [];
  }
  const data = sheet.getDataRange().getValues();
  const rules = [];
  if (data.length <= 1) return rules;
  
  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  
  // Find column indices dynamically
  const senderIdx = headers.findIndex(h => h.includes('sender'));
  const subjectIdx = headers.findIndex(h => h.includes('subject'));
  const emailContainsIdx = headers.findIndex(h => h.includes('email contains') || h.includes('body contains') || h.includes('body') || h.includes('contains'));
  const labelsIdx = headers.findIndex(h => h.includes('label'));
  const keepInInboxIdx = headers.findIndex(h => h.includes('keep in inbox') || h.includes('inbox'));
  const markAsReadIdx = headers.findIndex(h => h.includes('mark as read') || h.includes('read'));
  const skipAiIdx = headers.findIndex(h => h.includes('skip') && h.includes('ai'));
  
  data.forEach((row, i) => { 
    if (i > 0) {
      // Only add rule if at least one condition is defined
      const senderVal = (senderIdx !== -1 && row[senderIdx]) ? row[senderIdx].toString().trim().toLowerCase() : null;
      const subjectVal = (subjectIdx !== -1 && row[subjectIdx]) ? row[subjectIdx].toString().trim().toLowerCase() : null;
      const emailContainsVal = (emailContainsIdx !== -1 && row[emailContainsIdx]) ? row[emailContainsIdx].toString().trim().toLowerCase() : null;
      
      if (senderVal || subjectVal || emailContainsVal) {
        rules.push({
          sender: senderVal,
          subject: subjectVal,
          emailContains: emailContainsVal,
          labels: (labelsIdx !== -1 && row[labelsIdx]) ? row[labelsIdx].toString().split(',').map(s => s.trim()) : [], 
          keepInInbox: (keepInInboxIdx !== -1) ? (row[keepInInboxIdx] === true || row[keepInInboxIdx].toString().toUpperCase() === 'T' || row[keepInInboxIdx].toString().toUpperCase() === 'TRUE') : false,
          markAsRead: (markAsReadIdx !== -1) ? (row[markAsReadIdx] === true || row[markAsReadIdx].toString().toUpperCase() === 'T' || row[markAsReadIdx].toString().toUpperCase() === 'TRUE') : false,
          skipAI: (skipAiIdx !== -1) ? (row[skipAiIdx] === true || row[skipAiIdx].toString().toUpperCase() === 'T' || row[skipAiIdx].toString().toUpperCase() === 'TRUE') : false
        });
      }
    }
  });
  return rules;
}

function getAllowedAliases() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === ALIAS_GID);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return [];
  const data = sheet.getRange(1, 1, lastRow, 1).getValues();
  return data.map(row => row[0].toString().trim().toLowerCase()).filter(val => val !== "" && val !== "email");
}

function getWhitelistedAliases(message, allowedList) {
  const found = [];
  const headers = [message.getTo(), message.getCc(), getDeliveredTo(message)];
  headers.forEach(h => {
    if (!h) return;
    const emails = h.toLowerCase().match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g);
    if (emails) {
      emails.forEach(email => {
        const clean = email.trim();
        if (allowedList.includes(clean) && !found.includes(clean)) found.push(clean);
      });
    }
  });
  return found;
}

function getDeliveredTo(message) {
  try { return message.getRawContent().match(/^Delivered-To:\s*(.+)/im)[1].trim().toLowerCase(); } catch (e) { return null; }
}

// =============================================================================
// 2. LABEL MANAGEMENT TOOLSET
// =============================================================================

function exportGmailLabelsToSheet() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === AUDIT_GID);
  sheet.clear();
  sheet.appendRow(['Label Name (Old)', 'Thread Count', 'Unread Count', 'Keep', 'Label Name (New)']);
  const labels = GmailApp.getUserLabels();
  const data = labels.map(l => [l.getName(), 0, 0, true, l.getName()]);
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 5).setValues(data).sort({column: 1, ascending: true});
  }
}

// =============================================================================
// 4. MANUAL OVERRIDE ENGINE (BIDIRECTIONAL SHEET -> GMAIL SYNC)
// =============================================================================

/**
 * Bidirectional Sync: Scans '5 Import - Email Triage Log' for manual overrides in 'Revised Labels (Override)' (Column P).
 * Applies new labels and archive/delete states to Gmail threads, and marks 'Override Status' (Column Q) as 'APPLIED - timestamp'.
 * 
 * @param {number} scanLimit Maximum rows from bottom to inspect (default: 500)
 */
function processManualSheetOverrides(scanLimit = 500) {
  console.log("Checking for manual spreadsheet overrides in '5 Import - Email Triage Log'...");
  const ss = getMasterSpreadsheet();
  let sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID.toString());
  if (!sheet) {
    sheet = ss.getSheetByName("5 Import - Email Triage Log") || ss.getSheetByName("Execution Log");
  }
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  const linkCol = headers.findIndex(h => h === "link");
  const finalLblCol = headers.findIndex(h => h === "final label set");
  const inboxCol = headers.findIndex(h => h === "inbox status");
  const readCol = headers.findIndex(h => h === "read state");
  const overrideCol = headers.findIndex(h => h === "revised labels (override)");
  const statusCol = headers.findIndex(h => h === "override status");

  if (linkCol === -1 || overrideCol === -1 || statusCol === -1) return;

  const startIdx = Math.max(1, data.length - scanLimit);
  let appliedCount = 0;
  const nowStr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm");

  for (let i = startIdx; i < data.length; i++) {
    const row = data[i];
    const overrideVal = (row[overrideCol] || "").toString().trim();
    const statusVal = (row[statusCol] || "").toString().trim();
    const linkVal = (row[linkCol] || "").toString().trim();

    if (overrideVal !== "" && !statusVal.startsWith("APPLIED")) {
      const match = linkVal.match(/#(?:all|inbox|trash|label\/[^\/]+)\/([a-f0-9]+)/i);
      const threadId = match ? match[1].toLowerCase() : (linkVal.split('/').pop() || "").toLowerCase();

      if (!threadId || threadId.length < 10) continue;

      try {
        const thread = GmailApp.getThreadById(threadId);
        if (!thread) {
          sheet.getRange(i + 1, statusCol + 1).setValue("ERROR: Thread not found");
          continue;
        }

        const tokens = overrideVal.split(',').map(l => l.trim()).filter(l => l !== "");
        const categoryLabels = [];
        let actionInbox = null; // 'ARCHIVED', 'INBOX', 'TEMP_DELETE', 'TRASH'
        let actionRead = null;  // 'READ', 'UNREAD'

        tokens.forEach(tok => {
          const upper = tok.toUpperCase();
          if (upper === 'ARCHIVE' || upper === 'ARCHIVED') {
            actionInbox = 'ARCHIVED';
          } else if (upper === 'INBOX') {
            actionInbox = 'INBOX';
          } else if (upper === 'TEMP_DELETE' || upper === '99 TO BE DELETED' || upper === 'DELETE') {
            actionInbox = 'TEMP_DELETE';
            categoryLabels.push(TEMP_DELETE_LABEL);
          } else if (upper === 'TRASH') {
            actionInbox = 'TRASH';
          } else if (upper === 'READ') {
            actionRead = 'READ';
          } else if (upper === 'UNREAD') {
            actionRead = 'UNREAD';
          } else {
            categoryLabels.push(tok);
          }
        });

        const curLabels = thread.getLabels().map(l => l.getName());

        // 1. Remove old category labels not in new override set
        const systemFlags = [PROCESSED_FLAG, TEMP_DELETE_LABEL];
        curLabels.forEach(curName => {
          if (!categoryLabels.includes(curName) && !systemFlags.includes(curName)) {
            const lbl = GmailApp.getUserLabelByName(curName);
            if (lbl) thread.removeLabel(lbl);
          }
        });

        // 2. Apply new category labels
        categoryLabels.forEach(lblText => {
          getLabelIdByName(lblText); // Ensures label exists
          const lbl = GmailApp.getUserLabelByName(lblText);
          if (lbl) thread.addLabel(lbl);
        });

        // 3. Apply Read / Unread actions
        if (actionRead === 'READ') {
          thread.markRead();
        } else if (actionRead === 'UNREAD') {
          thread.markUnread();
        }

        // 4. Apply Archive / Inbox / Trash / Temp Delete actions
        if (actionInbox === 'ARCHIVED') {
          thread.moveToArchive();
        } else if (actionInbox === 'INBOX') {
          thread.moveToInbox();
        } else if (actionInbox === 'TEMP_DELETE') {
          const tdLabel = GmailApp.getUserLabelByName(TEMP_DELETE_LABEL);
          if (tdLabel) thread.addLabel(tdLabel);
          thread.moveToArchive();
        } else if (actionInbox === 'TRASH') {
          thread.moveToTrash();
        }

        // 5. Update spreadsheet row
        if (categoryLabels.length > 0 && finalLblCol !== -1) {
          sheet.getRange(i + 1, finalLblCol + 1).setValue(categoryLabels.join(', '));
        }
        if (actionInbox && inboxCol !== -1) {
          sheet.getRange(i + 1, inboxCol + 1).setValue(actionInbox);
        }
        if (actionRead && readCol !== -1) {
          sheet.getRange(i + 1, readCol + 1).setValue(actionRead);
        }

        sheet.getRange(i + 1, statusCol + 1).setValue(`APPLIED - ${nowStr}`);
        appliedCount++;
        console.log(`✓ Applied manual override for thread ${threadId}: Labels=[${categoryLabels.join(', ')}], Inbox=${actionInbox}, Read=${actionRead}`);

      } catch (e) {
        console.error(`Error applying override for thread ${threadId}: ${e.message}`);
        sheet.getRange(i + 1, statusCol + 1).setValue(`ERROR: ${e.message.substring(0, 50)}`);
      }
    }
  }

  if (appliedCount > 0) {
    console.log(`✓ Successfully applied ${appliedCount} manual overrides from Google Sheets to Gmail.`);
  } else {
    console.log("✓ No pending spreadsheet overrides found.");
  }
}

/**
 * Processes a single email thread to extract logic and generate configuration.
 * Extracted from executeTriageEngine for readability and testability.
 */
function _processSingleEmailThread(thread, index, totalThreads, runTimestamp, deterministicRules, allowedAliases, fullDocPrompt, safeTaxonomyJsonStr, labelToPathMap, activeTaskMap, isRetro, currentModel, personalGoalsStr, workGoalsStr, blufPrompt) {
  const threadId = thread.getId();

  const messages = thread.getMessages();
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];

  const subject = firstMsg.getSubject();
  const sender = firstMsg.getFrom().toLowerCase();

  let body = "";
  let systemNotes = "";
  if (messages.length === 1) {
    body = messages[0].getPlainBody().substring(0, 3000);
  } else {
    const recentMessages = messages.slice(-3);
    const bodies = recentMessages.map((m, i) => `--- MSG ${i+1} (FROM: ${m.getFrom()}) ---
${m.getPlainBody().substring(0, 1500)}`);
    body = bodies.join('\n\n');
  }

  const attachmentData = _extractMultimodalAttachments(lastMsg);
  let inlineImages = attachmentData.inlineImages;
  systemNotes += attachmentData.systemNotes;
  const threadUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;

  const firstMsgDate = Utilities.formatDate(firstMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
  const lastMsgDate = Utilities.formatDate(lastMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");

  console.log(`[${index + 1}/${totalThreads}] Analyzing: ${subject}`);

  const targetAliases = getWhitelistedAliases(firstMsg, allowedAliases);

  const existingLabels = thread.getLabels()
    .map(l => l.getName())
    .filter(n => n !== PROCESSED_FLAG);

  let ssMatch = _evaluateDeterministicRules(sender, subject, body, deterministicRules);
  const ssLabels = ssMatch ? ssMatch.labels : [];

  let aiMatch = null;
  if (ssMatch && ssMatch.skipAI) {
      console.log(` > Skipping AI Inference due to Spreadsheet Rule (Skip AI = TRUE)`);
      aiMatch = {
          categories: [],
          keepInInbox: ssMatch.keepInInbox,
          markAsRead: ssMatch.markAsRead,
          deleteEmail: ssMatch.labels.includes('99 To be deleted'),
          summary: "Auto-categorized via Spreadsheet Rule (AI Bypassed)",
          actionItems: []
      };
  } else {
      const openTasksStr = activeTaskMap.openTasksForAI.join('\n');
      aiMatch = callLLMWithSourceContext(subject, sender, body, fullDocPrompt, safeTaxonomyJsonStr, existingLabels, ssLabels, isRetro, currentModel, inlineImages, systemNotes, personalGoalsStr, workGoalsStr, openTasksStr, blufPrompt);
  }

  if (!aiMatch) {
     console.log(` > Skipping thread due to AI failure. Flagging for Manual Review to prevent queue blockage.`);
     const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
     const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");

     if (manualLabel) thread.addLabel(manualLabel);
     if (processedLabel) thread.addLabel(processedLabel);
     return { shouldSkip: true };
  }
  Utilities.sleep(1500);

  const finalConfig = mergeConfigs(ssMatch, aiMatch);

  targetAliases.forEach(alias => {
    if (!finalConfig.labels.includes(alias)) finalConfig.labels.push(alias);
  });

  const isManual = finalConfig.labels.length === 0 && !finalConfig.deleteEmail;
  if (isManual) {
    finalConfig.labels = [MANUAL_REVIEW_LABEL];
    finalConfig.keepInInbox = true;
    finalConfig.markAsRead = false;
  }

  if (finalConfig.deleteEmail) {
    if (!finalConfig.labels.includes(TEMP_DELETE_LABEL)) {
      finalConfig.labels.push(TEMP_DELETE_LABEL);
    }
    finalConfig.keepInInbox = false;
    console.log(` > Flagged for deletion: ${subject}`);
  }

  const summaryLog = aiMatch.summary || "";
  let actionItemsLog = "";
  let syncedTaskIds = [];

  let validActions = [];
  if (aiMatch.actionItems && Array.isArray(aiMatch.actionItems)) {
     validActions = aiMatch.actionItems.filter(a => {
        if (typeof a !== 'object') return false;
        const str = (a.title || "").toLowerCase().trim();
        return str !== "" && str !== "none" && str !== "n/a" && str !== "null";
     });
  }

  if (validActions.length > 0) {
    actionItemsLog = validActions.map(a => a.title).join('; ');
    const primaryCategoryLabel = (aiMatch.categories && aiMatch.categories.length > 0) ? aiMatch.categories[0] : "00 Manual Review";
    const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;

    syncedTaskIds.push(..._syncTasksForThread(validActions, primaryCategoryLabel, labelToPathMap, activeTaskMap, threadId, threadUrl, importerListId, subject));
  }

  return {
    cleanupItem: { thread: thread, config: finalConfig, existingLabels: existingLabels },
    logItem: {
      "Timestamp": runTimestamp,
      "Received First Message": firstMsgDate,
      "Received Last Message": lastMsgDate,
      "Subject": subject,
      "AI Categories": aiMatch.categories.join(', '),
      "SS Labels": ssLabels.join(', '),
      "Alias Labels": targetAliases.join(', '),
      "Final Label Set": finalConfig.labels.join(', '),
      "Link": threadUrl,
      "Inbox Status": finalConfig.deleteEmail ? "TEMP_DELETE" : (finalConfig.keepInInbox ? "INBOX" : "ARCHIVED"),
      "Read State": finalConfig.markAsRead ? "READ" : "UNREAD",
      "Sender": sender,
      "AI Summary": summaryLog,
      "AI Action Items": actionItemsLog,
      "Task Synced": syncedTaskIds.join(', '),
      "Revised Labels (Override)": "",
      "Override Status": ""
    }
  };
}

/**
 * Standalone Utility: Exports recent email metadata (Sender, Subject, Labels) 
 * for drafting deterministic email rules. Outputs formatted CSV string to the execution log
 * and creates a timestamped CSV export in the Google Drive Workspace folder.
 * 
 * @param {string} query Gmail search query (default: "in:all -in:trash -in:spam")
 * @param {number} maxThreads Maximum threads to fetch (default: 200)
 */
function EXPORT_EMAIL_METADATA_FOR_RULES(query = "in:all -in:trash -in:spam", maxThreads = 200) {
  console.log(`Searching Gmail for query "${query}" (max ${maxThreads} threads)...`);
  const threads = GmailApp.search(query, 0, maxThreads);
  console.log(`Found ${threads.length} threads. Extracting metadata...`);

  const rows = [];
  rows.push(["Sender", "Subject", "Labels", "Date", "Thread Link"]);

  threads.forEach((t, i) => {
    try {
      const msgs = t.getMessages();
      if (!msgs || msgs.length === 0) return;
      const firstMsg = msgs[0];
      const sender = firstMsg.getFrom();
      const subject = firstMsg.getSubject();
      const date = firstMsg.getDate().toISOString();
      const labels = t.getLabels().map(l => l.getName()).filter(n => !["UNREAD", "INBOX", "IMPORTANT", "SENT", "TRASH", "SPAM"].includes(n)).join(", ");
      const link = t.getPermalink ? t.getPermalink() : `https://mail.google.com/mail/u/0/#all/${t.getId()}`;

      rows.push([sender, subject, labels, date, link]);
    } catch(e) {
      console.warn(`Error on thread index ${i}: ${e.message}`);
    }
  });

  const csvContent = rows.map(r => r.map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  console.log(`\n=== EXPORTED ${rows.length - 1} EMAIL RECORDS (CSV FORMAT) ===\n`);
  console.log(csvContent);

  // Save to Workspace Folder in Drive
  const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  if (workspaceFolderId) {
    try {
      const folder = DriveApp.getFolderById(workspaceFolderId);
      const fileName = `Email_Metadata_Export_${new Date().toISOString().split('T')[0]}.csv`;
      const file = folder.createFile(fileName, csvContent, MimeType.CSV);
      console.log(`\n✓ Saved CSV export to Google Drive: "${fileName}" (ID: ${file.getId()})`);
      console.log(`  Download / View URL: ${file.getUrl()}`);
    } catch(e) {
      console.warn("Could not save CSV to workspace folder: " + e.message);
    }
  }
}

/**
 * Synchronizes the 'Inbox Status' (Column J) and 'Read State' (Column K) in '5 Import - Email Triage Log'
 * against live Gmail state (INBOX vs ARCHIVED vs TEMP_DELETE, READ vs UNREAD) using high-speed
 * set-based query reconciliation.
 * 
 * @param {number} lookbackDays Window in days for historical checked emails (default: 60). Note: all INBOX/UNREAD rows are checked regardless.
 */
function syncEmailTriageInboxStatus(lookbackDays = 60) {
  console.log(`Starting high-speed Email Inbox & Read Status reconciliation (lookback: ${lookbackDays}d)...`);
  const ss = getMasterSpreadsheet();
  let sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID.toString());
  if (!sheet) {
    sheet = ss.getSheetByName("5 Import - Email Triage Log") || ss.getSheetByName("Execution Log");
  }
  if (!sheet) {
    console.warn("syncEmailTriageInboxStatus: Email log sheet not found.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  const linkCol = headers.findIndex(h => h === "link");
  const statusCol = headers.findIndex(h => h === "inbox status");
  const readCol = headers.findIndex(h => h === "read state");
  const tsCol = headers.findIndex(h => h === "timestamp");

  if (linkCol === -1 || statusCol === -1) {
    console.warn("syncEmailTriageInboxStatus: Required headers (Link / Inbox Status) not found.");
    return;
  }

  // High-speed batch retrieval of active Inbox, Trash, and Unread threads
  const inboxThreadIds = new Set(GmailApp.search("in:inbox", 0, 500).map(t => t.getId().toLowerCase()));
  const trashThreadIds = new Set(GmailApp.search("in:trash newer_than:30d", 0, 500).map(t => t.getId().toLowerCase()));
  const unreadThreadIds = new Set(GmailApp.search("is:unread", 0, 500).map(t => t.getId().toLowerCase()));
  
  let tempDeleteThreadIds = new Set();
  try {
    tempDeleteThreadIds = new Set(GmailApp.search(`label:"${TEMP_DELETE_LABEL}"`, 0, 500).map(t => t.getId().toLowerCase()));
  } catch (e) {}

  console.log(`Active Gmail State: ${inboxThreadIds.size} threads in Inbox, ${trashThreadIds.size} in Trash, ${tempDeleteThreadIds.size} flagged for deletion, ${unreadThreadIds.size} unread.`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  let updateCount = 0;
  let hasChanges = false;
  const updatedStatusAndReadColumns = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const linkVal = (row[linkCol] || "").toString();
    const currStatus = (row[statusCol] || "").toString().trim();
    const currRead = (readCol !== -1 && row[readCol] !== undefined) ? row[readCol].toString().trim() : "";
    
    // Extract thread ID from permalink
    const match = linkVal.match(/#(?:all|inbox|trash|label\/[^\/]+)\/([a-f0-9]+)/i);
    const threadId = match ? match[1].toLowerCase() : (linkVal.split('/').pop() || "").toLowerCase();

    if (!threadId || threadId.length < 10) {
      if (readCol === statusCol + 1) {
        updatedStatusAndReadColumns.push([currStatus, currRead]);
      } else {
        updatedStatusAndReadColumns.push([currStatus]);
      }
      continue;
    }

    // Filter by lookback window unless currently marked INBOX or UNREAD
    if (currStatus !== "INBOX" && currRead !== "UNREAD" && tsCol !== -1) {
      const rowDate = row[tsCol] instanceof Date ? row[tsCol] : new Date(row[tsCol]);
      if (!isNaN(rowDate.getTime()) && rowDate < cutoffDate) {
        if (readCol === statusCol + 1) {
          updatedStatusAndReadColumns.push([currStatus, currRead]);
        } else {
          updatedStatusAndReadColumns.push([currStatus]);
        }
        continue;
      }
    }

    let realStatus = "ARCHIVED";
    if (inboxThreadIds.has(threadId)) {
      realStatus = "INBOX";
    } else if (trashThreadIds.has(threadId) || tempDeleteThreadIds.has(threadId)) {
      realStatus = "TEMP_DELETE";
    } else if (currStatus === "TEMP_DELETE") {
      realStatus = "TEMP_DELETE";
    } else {
      realStatus = "ARCHIVED";
    }

    const realRead = unreadThreadIds.has(threadId) ? "UNREAD" : "READ";

    const statusChanged = (realStatus !== currStatus);
    const readChanged = (readCol !== -1 && realRead !== currRead);

    if (statusChanged || readChanged) {
      updateCount++;
      hasChanges = true;
    }

    if (readCol === statusCol + 1) {
      updatedStatusAndReadColumns.push([realStatus, realRead]);
    } else {
      updatedStatusAndReadColumns.push([realStatus]);
    }
  }

  if (hasChanges && updateCount > 0) {
    if (readCol === statusCol + 1) {
      sheet.getRange(2, statusCol + 1, updatedStatusAndReadColumns.length, 2).setValues(updatedStatusAndReadColumns);
    } else {
      sheet.getRange(2, statusCol + 1, updatedStatusAndReadColumns.length, 1).setValues(updatedStatusAndReadColumns);
    }
    console.log(`✓ Synchronized ${updateCount} email rows (Inbox & Read State) in Google Sheets.`);
  } else {
    console.log("✓ Email log Inbox & Read Status are already fully in sync.");
  }
}
