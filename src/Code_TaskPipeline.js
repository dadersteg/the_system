/**
 * THE SYSTEM: TASK EXECUTION PIPELINE (Phase D.4)
 * Automates pushing extracted action items from The Clerk's execution logs directly into Google Tasks.
 * Upgraded to HARMONIZER ENGINE: Deduplicates against existing tasks and categorizes BEFORE insertion.
 */

const PIPELINE_CONFIG = {
  spreadsheetId: PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID"),
  emailLogGid: "2131515996",
  driveLogGid: "809034738",
  tasksDatabaseGid: "1580572397", // TM - Email and Tasks
  taxonomyDocId: "1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf"
};

/**
 * Sweeps both Email and Drive execution logs, extracts pending 'actionItems', 
 * passes them through Gemini for harmonization, and syncs them to Google Tasks.
 */
function runTaskExecutionPipeline() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.warn("syncActionsToTasks is already running. Skipping execution.");
    return;
  }
  
  try {
    const ss = SpreadsheetApp.openById(PIPELINE_CONFIG.spreadsheetId);
    
    // Fetch Task Lists and find the default destination
    let taskListsResponse;
    try {
      taskListsResponse = Tasks.Tasklists.list();
    } catch (e) {
      console.error("Critical API Failure (Tasklists.list): " + e.message);
      return;
    }
    
    const taskLists = taskListsResponse.items || [];
    if (taskLists.length === 0) {
      console.error("No Task Lists found for the user.");
      return;
    }
    
    // 1. Process Email Log
    const emailSheet = ss.getSheets().find(s => s.getSheetId().toString() === PIPELINE_CONFIG.emailLogGid);
    if (emailSheet) {
      processLogSheet(ss, emailSheet, taskLists, "EMAIL");
    } else {
      console.warn("Email Log sheet not found.");
    }

    // Process Drive Log (Optional in future)
    const driveSheet = ss.getSheets().find(s => s.getSheetId().toString() === PIPELINE_CONFIG.driveLogGid);
    if (driveSheet) {
      processLogSheet(ss, driveSheet, taskLists, "DRIVE");
    }

  } catch (e) {
    console.error("Pipeline Error: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Processes a specific execution log sheet to extract, harmonize, and sync action items.
 */
function processLogSheet(ss, sheet, taskLists, logType) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return; // Empty or headers only
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  let headerRowIdx = 0;
  if (data[0].findIndex(h => h.toString().trim().toLowerCase() === "link") === -1 && data.length > 1) {
    headerRowIdx = 1;
  }
  const headers = data[headerRowIdx];
  
  // Dynamically find necessary columns based on headers
  let actionItemsIdx = headers.findIndex(h => h.toString().toLowerCase().includes("action item"));
  let taskSyncedIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "task synced");
  let linkIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "link");
  let summaryIdx = headers.findIndex(h => h.toString().toLowerCase().includes("summary"));
  
  // Fail-safe if 'Task Synced' column is missing
  if (taskSyncedIdx === -1) {
    taskSyncedIdx = headers.length;
    sheet.getRange(headerRowIdx + 1, taskSyncedIdx + 1).setValue("Task Synced");
  }
  if (actionItemsIdx === -1 || linkIdx === -1) return; 

  const groupedData = {};
  
  let processedCount = 0;
  const PROCESS_LIMIT = 8; // Grouping means we can process a bit more safely

  // Phase 1: Group un-synced actions by Thread URL
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const isSynced = row[taskSyncedIdx];
    
    // Skip if already processed or explicitly ignored
    if (isSynced && isSynced.toString().trim() !== "") continue; 
    
    const rawActions = row[actionItemsIdx];
    // If no action items, mark as N/A so we don't process it again
    if (!rawActions || rawActions.toString().trim() === "" || rawActions.toString().trim().toLowerCase() === "n/a") {
      sheet.getRange(i + 1, taskSyncedIdx + 1).setValue("N/A");
      continue;
    }

    if (processedCount >= PROCESS_LIMIT) {
      console.log(`Hit processing limit of ${PROCESS_LIMIT} logs. Stopping early for safety.`);
      break;
    }

    const link = row[linkIdx] || "No URL provided";
    const summary = summaryIdx !== -1 ? (row[summaryIdx] || "") : "";
    
    if (!groupedData[link]) {
      groupedData[link] = {
        summary: summary,
        newActions: [],
        rows: []
      };
    }
    
    // Split and clean the raw actions
    let actions = rawActions.toString().split(';').map(a => a.trim()).filter(Boolean);
    actions.forEach(a => {
      // Basic string deduplication before AI
      if (!groupedData[link].newActions.includes(a)) {
        groupedData[link].newActions.push(a);
      }
    });
    
    groupedData[link].rows.push(i + 1);
    processedCount++;
  }

  const linksToProcess = Object.keys(groupedData);
  if (linksToProcess.length === 0) {
    console.log(`[${logType}] No new actions found to process.`);
    return;
  }
  
  console.log(`[${logType}] Phase 1 Complete: Grouped ${processedCount} rows into ${linksToProcess.length} unique threads.`);

  // Phase 2: Fetch Existing Tasks for Context (To prevent overlap/stacking)
  console.log(`[${logType}] Phase 2: Fetching existing tasks for these threads from Master Database...`);
  const existingTasksMap = getExistingTasksForLinks(ss, linksToProcess);
  Object.keys(groupedData).forEach(link => {
    groupedData[link].existingTasks = existingTasksMap[link] || [];
  });
  console.log(`[${logType}] Phase 2 Complete: Context fetched.`);

  // Phase 3: Call Gemini Harmonizer to deduplicate and categorize
  console.log(`[${logType}] Phase 3: Sending grouped data to Gemini Harmonizer for deduplication and categorization...`);
  const harmonizedResults = harmonizeTasksWithGemini(groupedData);
  if (!harmonizedResults) {
    console.error(`[${logType}] Harmonizer failed to return valid JSON data. Aborting.`);
    return;
  }
  console.log(`[${logType}] Phase 3 Complete: Gemini Harmonizer returned successfully.`);

  const nowStr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss");

  // Determine fallback list
  const fallbackList = taskLists.find(l => l.title === "ToDo" || l.title === "Importer" || l.title.toLowerCase().includes("inbox")) || taskLists[0];

  // Phase 4: Push to Tasks and Mark Synced
  console.log(`[${logType}] Phase 4: Pushing new tasks to Google Tasks and marking rows as Synced...`);
  Object.keys(groupedData).forEach(link => {
    const threadData = groupedData[link];
    const tasksToCreate = harmonizedResults[link] || [];
    
    let success = true;

    tasksToCreate.forEach(taskObj => {
      const deadline = taskObj.deadline || "N/A";
      const duration = taskObj.duration || "N/A";
      const category = taskObj.category || "N/A";
      const summaryText = taskObj.summary || threadData.summary;

      // Task D.13: Metadata Encoding in notes (Summary first for FE readability)
      const notes = `${summaryText}\n\n[DEADLINE: ${deadline}] | [DURATION: ${duration}] | [GOAL: TBD]\n\n${link}`.trim();
      
      const rawTitle = taskObj.title || "Untitled Task";
      const finalTitle = category !== "N/A" ? `${category} > ${rawTitle}` : rawTitle;
      
      // Determine correct Task List based on Category (matching Code_Tasks.js logic)
      let targetListId = fallbackList.id;
      if (category !== "N/A") {
        const candidateList = taskLists.find(l => 
          category.toLowerCase().includes(l.title.toLowerCase()) && 
          !["todo", "importer", "my tasks"].includes(l.title.toLowerCase())
        );
        if (candidateList) targetListId = candidateList.id;
      }

      try {
        Tasks.Tasks.insert({
          title: finalTitle.substring(0, 500), // Ensure we don't hit max-length limits
          notes: notes
        }, targetListId);
        Utilities.sleep(250); // Rate-limit protection for Tasks API
      } catch (e) {
        console.error(`Failed to insert task "${title}": ${e.message}`);
        success = false;
      }
    });

    // Mark as synced whether tasks were created or completely deduplicated (empty array)
    threadData.rows.forEach(rowNum => {
      sheet.getRange(rowNum, taskSyncedIdx + 1).setValue(success ? nowStr : "FAILED");
    });
  });
  
  console.log(`[${logType}] Pipeline execution complete.`);
}

/**
 * Looks up existing tasks for given email links to provide context to the Harmonizer.
 */
function getExistingTasksForLinks(ss, links) {
  const map = {};
  links.forEach(l => map[l] = []);
  
  // 1. Read Active Tasks from TM - Email and Tasks
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === PIPELINE_CONFIG.tasksDatabaseGid);
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    if (data.length > 2) {
      const headers = data[0]; 
      const linkIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "email link");
      const titleIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "task title");
      const statusIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "status");
      const catIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "los code (revised)");
      
      if (linkIdx !== -1) {
        for (let i = 2; i < data.length; i++) {
          const row = data[i];
          const rowLink = row[linkIdx];
          if (rowLink && map[rowLink] !== undefined) {
            const status = row[statusIdx].toString().toLowerCase();
            if (status !== 'completed' && status !== 'done' && status !== 'x') {
              map[rowLink].push({
                title: row[titleIdx],
                category: row[catIdx]
              });
            }
          }
        }
      }
    }
  }

  // 2. Read Completed Tasks from "Completed Tasks" log
  const COMPLETED_LOG_GID = "1559346038";
  const completedSheet = ss.getSheets().find(s => s.getSheetId().toString() === COMPLETED_LOG_GID);
  if (completedSheet) {
    const data = completedSheet.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const linkIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "email link");
      const titleIdx = headers.findIndex(h => h.toString().trim().toLowerCase() === "task title");
      
      if (linkIdx !== -1) {
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const rowLink = row[linkIdx];
          if (rowLink && map[rowLink] !== undefined) {
            // Include it so the Harmonizer knows it's already done
            map[rowLink].push({
              title: "[ALREADY COMPLETED] " + row[titleIdx],
              category: "N/A"
            });
          }
        }
      }
    }
  }

  return map;
}

/**
 * Calls Gemini to deduplicate raw actions against existing tasks and properly categorize them.
 */
function harmonizeTasksWithGemini(groupedData) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("GEMINI_API_KEY") || props.getProperty("gemini_api_key");
  const modelId = props.getProperty("GEMINI_MODEL") || props.getProperty("gemini_model") || "gemini-3.1-flash-lite-preview";
  
  if (!apiKey) return null;

  let taxonomy = "";
  try {
    taxonomy = DriveApp.getFileById(PIPELINE_CONFIG.taxonomyDocId).getBlob().getDataAsString();
  } catch (e) {
    try {
      taxonomy = DocumentApp.openById(PIPELINE_CONFIG.taxonomyDocId).getBody().getText();
    } catch(e2) {
      console.warn("Could not load taxonomy document.");
    }
  }

  let basePrompt = "";
  const promptDocId = props.getProperty("PROMPT_TASKMASTER_DOC_ID") || "1_qa0MsqPL6KLea8UJkwBzw2KzWO9WNNe";
  try {
    basePrompt = DocumentApp.openById(promptDocId).getBody().getText();
  } catch (e) {
    try {
      basePrompt = DriveApp.getFileById(promptDocId).getBlob().getDataAsString();
    } catch(e2) {
      console.warn("Could not load Task Master prompt.");
      basePrompt = "You are the Task Harmonizer for a Life Organisation System (LOS).";
    }
  }

  const prompt = `${basePrompt}

==================================================
*** SUB-ROUTINE OVERRIDE: THE HARMONIZER ENGINE ***
You are currently operating in the HARMONIZER pre-processing phase. 
You are receiving raw actions extracted from email threads.

YOUR MODIFIED OBJECTIVES:
1. DEDUPLICATE RUTHLESSLY: Compare "newActions" against "existingTasks". If a new action is covered by an existing task, or is extremely similar in intent, DISCARD IT. Do not create duplicates.
2. CONSOLIDATE & MERGE: If multiple new actions relate to the exact same core event or underlying objective (e.g., "Review Revolut update" and "Process Revolut Ledgy update"), you MUST consolidate them into ONE single concrete action. DO NOT generate multiple tasks for the same logical unit of work.
3. DISCARD NOISE & NON-ACTIONS (The "No Junk" Rule): You are strictly forbidden from creating tasks for:
   - Automated invoices or receipts that are paid via direct debit/automatically charged.
   - "Archive [Invoice]" or "Filing [Receipt]". Automated notifications are already filed by the system. 
   - Casual link sharing WITHOUT explicit action requests. A YouTube or article link shared with just "check this out" is NOT a task. ONLY keep it if there is a clear, explicit request (e.g., "Review this for the Q3 project").
   If an action falls into these categories, drop it entirely by returning an empty array.
4. CATEGORIZE: For each valid new task, assign the most specific category. If a relevant category exists, you MUST use an exact string match from the "Concat (Path)" property found in the FULL LOS TAXONOMY below. If no category fits, output "N/A".
5. FORMAT: Titles MUST be structured as "[Action Verb] [Object]". Example: "Pay electricity bill". If the action is passive (waiting on someone/something), prefix it with "Track:" or "Follow up:".
6. METADATA: Estimate a "deadline" (Format: YYYY-MM-DD). If a deadline must exist but cannot be determined, output "TBC". If no deadline is set, output "None". If it is truly a task where a deadline is inapplicable, output "N/A". Estimate a "duration" (Format: e.g. "15m", "1h", or "N/A").

=== LOS TAXONOMY ===
${taxonomy}
====================

INPUT DATA:
${JSON.stringify(groupedData, null, 2)}

Respond STRICTLY in valid JSON matching this schema:
{
  "https://mail.google.com/mail/u/0/#all/12345": [
    {
      "title": "Book flights for Liverpool FC match",
      "category": "01 05 01 Projects > 20260509 LFC-CFC",
      "summary": "Consolidated summary of what this task entails.",
      "deadline": "2026-06-01",
      "duration": "15m"
    }
  ]
}

If all "newActions" for a specific link are duplicates of the "existingTasks" or irrelevant (like 'Thanks!'), return an empty array [] for that link.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  };
  
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`> Calling Gemini API (Attempt ${i + 1}/3)...`);
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      const code = response.getResponseCode();
      if (code === 200) {
        console.log(`> Gemini API call successful (200 OK). Parsing response...`);
        const rawText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } else if (code === 429 || code >= 500) {
        console.warn(`> Gemini API returned ${code}. Retrying...`);
        Utilities.sleep(2000 * (i + 1));
      } else {
        console.error(`> Gemini API Error ${code}: ${response.getContentText()}`);
        return null;
      }
    } catch (e) {
      console.warn(`> Gemini API Request Exception: ${e.message}. Retrying...`);
      Utilities.sleep(2000 * (i + 1));
    }
  }
  return null;
}
