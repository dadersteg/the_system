/**
 * ============================================================================
 * THE SYSTEM: TASK ENGINE (Unified Pipeline & AI Master)
 * ============================================================================
 * This unified script handles:
 * 1. INGESTION: Sweeping email/drive logs for action items and moving them to Google Tasks.
 * 2. TASK MASTER: The AI Agent that routes tasks based on the Eisenhower Matrix.
 * 3. PROMPTS: The strict frameworks governing the Task Master AI.
 */

// ============================================================================
// SECTION 1: SYSTEM PROMPTS & CONFIGURATION
// ============================================================================

const PIPELINE_CONFIG = {
  spreadsheetId: SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID,
  emailLogGid: SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG,
  driveLogGid: SYSTEM_CONFIG.SHEET_GIDS.DRIVE_LOG,
  tasksDatabaseGid: SYSTEM_CONFIG.SHEET_GIDS.TASK_REVIEW, // TM - Email and Tasks
  taxonomyDocId: SYSTEM_CONFIG.DOCS.TAXONOMY_DOC_ID
};

const TM_MODEL_NAME = "gemini-1.5-flash";

function getTaskMasterSystemPrompt() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("TASK_MASTER_PROMPT_V2");
  if (cached) return cached;
  
  try {
     const docId = SYSTEM_CONFIG.DOCS.TASK_MASTER_PROMPT_ID;
     if (!docId) return "SYSTEM PROMPT MISSING";
     
     const file = DriveApp.getFileById(docId);
     const text = file.getBlob().getDataAsString();
     
     cache.put("TASK_MASTER_PROMPT_V2", text.substring(0, 100000), 21600); // 6 hours
     return text;
  } catch(e) {
     console.error("Failed to fetch Prompt Doc: " + e.message);
     return "SYSTEM PROMPT MISSING";
  }
}

// ============================================================================
// SECTION 2: PIPELINE INGESTION (Logs -> Tasks)
// ============================================================================

/**
 * Sweeps both Email and Drive execution logs, extracts pending 'actionItems', 
 * passes them through Gemini for harmonization, and syncs them to Google Tasks.
 */
function runTaskExecutionPipeline() {
  return; // EMERGENCY DISABLE
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
  const unsyncedRows = [];

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const rawActionData = row[actionItemsIdx];
    const taskSyncedVal = row[taskSyncedIdx];
    
    if (rawActionData && rawActionData.toString().trim() !== "" && (!taskSyncedVal || taskSyncedVal.toString().trim() === "")) {
      unsyncedRows.push({ rowIndex: i + 1, rowData: row });
    }
  }

  if (unsyncedRows.length === 0) {
    console.log(`[${logType}] No new actions found to process.`);
    return;
  }

  // Group by category string (from the system log format: e.g. "02 01 01 Quantum 21")
  // Or fall back to a default if unavailable
  let defaultCategory = "01 06 00 Importer > Inbox";
  
  // We assume the 'Category' column or similar exists, but we'll try to find it dynamically:
  let categoryIdx = headers.findIndex(h => h.toString().toLowerCase().includes("categor") || h.toString().toLowerCase() === "folder");

  unsyncedRows.forEach(item => {
    let rawActions = item.rowData[actionItemsIdx].toString();
    const link = item.rowData[linkIdx];
    const summary = summaryIdx !== -1 ? item.rowData[summaryIdx] : "";
    let parsedActions = [];

    // Extract the raw actions out of the system format string
    const match = rawActions.match(/\[(.*?)\]/);
    if (match) {
      const inside = match[1];
      if (inside.toLowerCase() !== "none") {
        parsedActions = inside.split('||').map(s => s.trim()).filter(s => s);
      }
    } else {
      if (rawActions.toLowerCase() !== "none") {
        parsedActions = rawActions.split('||').map(s => s.trim()).filter(s => s);
      }
    }

    if (parsedActions.length === 0) {
      sheet.getRange(item.rowIndex, taskSyncedIdx + 1).setValue("No Action");
      return;
    }

    let categoryHint = categoryIdx !== -1 ? item.rowData[categoryIdx] : defaultCategory;
    if (!categoryHint || categoryHint.toString().trim() === "") {
        categoryHint = defaultCategory;
    }

    const payload = {
      sourceContext: `Category: ${categoryHint}\nSummary: ${summary}`,
      actions: parsedActions,
      link: link,
      rowIndex: item.rowIndex
    };
    
    if (!groupedData[categoryHint]) {
      groupedData[categoryHint] = [];
    }
    groupedData[categoryHint].push(payload);
  });

  // Pull active tasks for deduplication
  const existingTasks = getAllTasksMinimal(taskLists);
  const taxonomyStr = getTaxonomyStructure();
  
  for (const category in groupedData) {
    const items = groupedData[category];
    
    const batchPrompt = `
      You are an elite Assistant integrating new tasks into a master task list. 
      Analyze the following requested tasks against the EXISTING TASKS to prevent duplicates.
      Also, classify the tasks using EXACT MATCHES from the provided TAXONOMY.
      
      TAXONOMY:
      ${taxonomyStr}
      
      EXISTING TASKS:
      ${JSON.stringify(existingTasks)}
      
      NEW TASKS TO PROCESS:
      ${JSON.stringify(items.map(i => ({ id: i.rowIndex, actions: i.actions, context: i.sourceContext })))}
      
      Return ONLY a strict JSON payload:
      {
         "results": [
           {
              "id": "rowIndex here",
              "tasks": [
                 {
                    "title": "Clear, standalone task title without filler",
                    "listTitle": "EXACT target Taxonomy list name",
                    "duplicateOf": "Existing Task ID if it is a duplicate, else null"
                 }
              ]
           }
         ]
      }
    `;

    const resultStr = callGemini(batchPrompt, "gemini-2.5-flash", "You are a JSON-only Task API.");
    if (!resultStr || resultStr.error) {
       console.error("Harmonizer Failed for category: " + category);
       continue;
    }

    let harmonizedData;
    try {
       const cleaned = resultStr.replace(/^^```json|```$/gm, "").trim();
       harmonizedData = JSON.parse(cleaned);
    } catch(e) {
       console.error("Harmonizer JSON parse error: " + e.message);
       continue;
    }

    // Apply the harmonized output
    if (harmonizedData && harmonizedData.results) {
      harmonizedData.results.forEach(res => {
         const rowIndex = res.id;
         const originalItem = items.find(i => i.rowIndex === rowIndex);
         if (!originalItem) return;

         let syncStatus = [];
         
         res.tasks.forEach(taskDef => {
            if (taskDef.duplicateOf) {
               syncStatus.push(`Duplicate of ${taskDef.duplicateOf}`);
            } else {
               const targetListId = findTargetListId(taskLists, taskDef.listTitle);
               if (targetListId) {
                  try {
                     const created = Tasks.Tasks.insert({
                        title: taskDef.title,
                        notes: originalItem.link
                     }, targetListId);
                     syncStatus.push(`Created: ${created.id}`);
                  } catch(e) {
                     syncStatus.push(`Error: ${e.message}`);
                  }
               } else {
                  syncStatus.push(`List Not Found: ${taskDef.listTitle}`);
               }
            }
         });
         
         sheet.getRange(rowIndex, taskSyncedIdx + 1).setValue(syncStatus.join(', '));
      });
    }
  }
}

/**
 * Returns a fast minimal list of existing tasks for deduplication.
 */
function getAllTasksMinimal(taskLists) {
  const allTasks = [];
  taskLists.forEach(list => {
    let pageToken;
    do {
      try {
        const resp = Tasks.Tasks.list(list.id, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
        const tasks = resp.items || [];
        tasks.forEach(t => allTasks.push({ id: t.id, title: t.title }));
        pageToken = resp.nextPageToken;
      } catch(e) {
        pageToken = null;
      }
    } while(pageToken);
  });
  return allTasks;
}

/**
 * Grabs the full taxonomy string from the cache or document.
 */
function getTaxonomyStructure() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("TAXONOMY_STRUCTURE");
  if (cached) return cached;
  
  try {
     const doc = DocumentApp.openById(PIPELINE_CONFIG.taxonomyDocId);
     const text = doc.getBody().getText();
     cache.put("TAXONOMY_STRUCTURE", text.substring(0, 100000), 21600); // 6 hours
     return text;
  } catch(e) {
     return "01 06 00 Importer > Inbox"; // Safe fallback
  }
}

function findTargetListId(taskLists, listNameStr) {
   const exactMatch = taskLists.find(l => l.title.toLowerCase().trim() === listNameStr.toLowerCase().trim());
   if (exactMatch) return exactMatch.id;
   
   // fuzzy match fallback
   const searchStr = listNameStr.toLowerCase().replace(/[^a-z0-9]/g, '');
   const fuzzyMatch = taskLists.find(l => l.title.toLowerCase().replace(/[^a-z0-9]/g, '').includes(searchStr));
   if (fuzzyMatch) return fuzzyMatch.id;
   
   return taskLists.find(l => l.title.includes("Importer"))?.id; // Absolute fallback
}

// ============================================================================
// SECTION 3: AI TASK MASTER (Routing & Priority One-Pager)
// ============================================================================

function runTaskMasterEngine() {
  console.log("Starting Task Master Engine V2...");
  console.log("Fetching task lists...");
  const taskLists = fetchTaskLists();
  if (!taskLists) {
    console.error("Failed to fetch task lists.");
    return;
  }
  console.log(`Found ${taskLists.length} task lists.`);

  const rawTasks = [];
  const taskIdMap = {};
  taskLists.forEach(list => {
    let pageToken;
    do {
      try {
        const response = Tasks.Tasks.list(list.id, {
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
          pageToken: pageToken
        });
        const items = response.items || [];
        items.forEach(t => {
          rawTasks.push({
            id: t.id,
            listId: list.id,
            title: t.title,
            notes: t.notes || "",
            status: t.status,
            due: t.due || null
          });
          taskIdMap[t.id] = list.id;
        });
        pageToken = response.nextPageToken;
      } catch (e) {
        console.error(`Error reading list ${list.title}: ${e.message}`);
        pageToken = undefined;
      }
    } while (pageToken);
  });
  
  console.log(`Extracted ${rawTasks.length} active tasks across all lists.`);
  
  // --------------------------------------------------------
  // BATCH PROCESSING ARCHITECTURE
  // --------------------------------------------------------
  const BATCH_SIZE = 15;
  const props = PropertiesService.getScriptProperties();
  let currentIndex = parseInt(SYSTEM_CONFIG.TASKS.TASK_MASTER_INDEX, 10);
  
  if (currentIndex >= rawTasks.length) {
     console.log(`Finished processing all tasks. Resetting index to 0 and generating final Priority One-Pager.`);
     currentIndex = 0;
     props.setProperty("TASK_MASTER_INDEX", "0");
     SYSTEM_CONFIG.TASKS.TASK_MASTER_INDEX = "0";
     
     // Only generate One Pager at the END of a full sweep
     const onePagerPayload = {
       currentTime: new Date().toISOString(),
       capacity: getCalendarCapacity(),
       goals: getSystemGoals(),
       allTasksContext: rawTasks,
       tasksToRoute: rawTasks // During One-Pager generation, we allow it to see everything.
     };
     const summaryResult = executeTaskMasterGemini(onePagerPayload, true);
     if (summaryResult && summaryResult.onePagerMarkdown) {
        console.log("Writing Priority One-Pager to Google Drive...");
        writeOnePager(summaryResult.onePagerMarkdown);
        console.log("One-Pager successfully generated and saved.");
     }
     return;
  }
  
  const batchTasks = rawTasks.slice(currentIndex, currentIndex + BATCH_SIZE);
  console.log(`Processing Batch: Tasks ${currentIndex} to ${currentIndex + batchTasks.length - 1}...`);

  console.log("Fetching calendar capacity and system goals...");
  const capacity = getCalendarCapacity();
  const goals = getSystemGoals();

  const payload = {
    currentTime: new Date().toISOString(),
    capacity: capacity,
    goals: goals,
    allTasksContext: rawTasks,
    tasksToRoute: batchTasks
  };
  
  console.log(`Payload built. Starting Gemini Pro AI processing...`);
  console.log(`=== OUTGOING PAYLOAD TO GEMINI ===`);
  console.log(JSON.stringify(payload, null, 2));
  console.log(`==================================`);

  const aiResult = executeTaskMasterGemini(payload, false);
  if (!aiResult) {
     console.error("AI Routing failed. Gemini returned null or threw an error.");
     return;
  }
  
  console.log("Gemini processing complete. Proceeding to update tasks in Google Tasks API.");
  
  if (aiResult.taskUpdates && aiResult.taskUpdates.length > 0) {
     console.log(`Applying updates to ${aiResult.taskUpdates.length} tasks...`);
     processTaskUpdates(aiResult.taskUpdates, taskLists, taskIdMap);
     console.log(`Successfully finished applying task updates.`);
  } else {
     console.warn("No task updates returned from Gemini.");
  }
  
  // Update index for the next trigger execution
  const nextIndex = currentIndex + batchTasks.length;
  props.setProperty("TASK_MASTER_INDEX", nextIndex.toString());
  console.log(`Batch complete. Next execution will start at index ${nextIndex}.`);
  console.log("Task Master Engine Complete.");
}

function getCalendarCapacity() {
  const now = new Date();
  const endDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  try {
    const events = CalendarApp.getDefaultCalendar().getEvents(now, endDate);
    const capacityMap = {};
    events.forEach(e => {
       const d = Utilities.formatDate(e.getStartTime(), "GMT", "yyyy-MM-dd");
       if (!capacityMap[d]) capacityMap[d] = 0;
       capacityMap[d] += (e.getEndTime().getTime() - e.getStartTime().getTime()) / 3600000;
    });
    return capacityMap;
  } catch(e) {
    return { error: "Could not fetch calendar" };
  }
}

function getSystemGoals() {
  const cache = CacheService.getScriptCache();
  const cachedGoals = cache.get("SYSTEM_GOALS_V1");
  if (cachedGoals) return cachedGoals;

  try {
    const personalId = SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID;
    const workId = SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID;
    
    let goalsText = "=== PERSONAL GOALS ===\n";
    goalsText += DriveApp.getFileById(personalId).getBlob().getDataAsString();
    goalsText += "\n\n=== WORK GOALS ===\n";
    goalsText += DriveApp.getFileById(workId).getBlob().getDataAsString();
    
    cache.put("SYSTEM_GOALS_V1", goalsText.substring(0, 100000), 21600); // Cache for 6 hours
    return goalsText;
  } catch (e) {
    console.error("Failed to fetch System Goals: " + e.message);
    return "1. Financial Independence 2. Health Optimization 3. System Development";
  }
}

function executeTaskMasterGemini(payloadObj, isSummaryOnly = false) {
  const systemInstruction = getTaskMasterSystemPrompt();
  
  const schema = isSummaryOnly ? {
    "type": "OBJECT",
    "properties": {
      "onePagerMarkdown": {
        "type": "STRING",
        "description": "The full Markdown string for the Day/Week/Month priority document."
      }
    },
    "required": ["onePagerMarkdown"]
  } : {
    "type": "OBJECT",
    "properties": {
      "taskUpdates": {
        "type": "ARRAY",
        "description": "The routing and update instructions for every active task.",
        "items": {
          "type": "OBJECT",
          "properties": {
            "taskId": { "type": "STRING" },
            "routingTarget": { "type": "STRING", "description": "THIS_HOUR, TODAY, TOMORROW, THIS_WEEK, THIS_MONTH, SCHEDULED_LATER, BACKLOG, DELETE, COMPLETE" },
            "recommendedDeadline": { "type": "STRING", "description": "YYYY-MM-DD format." },
            "estimatedDuration": { "type": "STRING", "description": "e.g. 15m, 1h, 2h" },
            "alignedGoal": { "type": "STRING", "description": "The specific Goal this advances, or Maintenance" },
            "systemComment": { "type": "STRING", "description": "AI questions or feedback to the user." },
            "clearUserComment": { "type": "BOOLEAN", "description": "Set to true if you have processed the user's DA: instruction." },
            "reasoning": { "type": "STRING" }
          },
          "required": ["taskId", "routingTarget", "recommendedDeadline", "estimatedDuration", "alignedGoal"]
        }
      }
    },
    "required": ["taskUpdates"]
  };

  const result = callGemini(JSON.stringify(payloadObj), TM_MODEL_NAME, systemInstruction, schema);
  if (!result || result.error) {
     console.error("AI Routing failed with error:", result ? result.error : "Unknown/Undefined");
     return null;
  }
  return result;
}

function processTaskUpdates(updates, allLists, taskIdMap) {
  if (!updates || updates.length === 0) return;
  const backlogListId = SYSTEM_CONFIG.TASKS.BACKLOG_LIST_ID;
  const deleteListId = SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID;
  
  console.log("=== AI ROUTING DECISIONS ===");
  console.log(JSON.stringify(updates, null, 2));
  console.log("============================");
  
  updates.forEach(u => {
    try {
      const listId = taskIdMap[u.taskId];
      if (!listId) {
         console.error(`Missing listId mapping for task: ${u.taskId}`);
         return;
      }
      
      const task = Tasks.Tasks.get(listId, u.taskId);
      if (!task) return;
      
      let targetListId = listId;
      
      const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
      const backlogListId = SYSTEM_CONFIG.TASKS.BACKLOG_LIST_ID;
      const deleteListId = SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID;

      if (u.routingTarget === "BACKLOG" && backlogListId) {
          targetListId = backlogListId;
      } else if ((u.routingTarget === "DELETE" || u.routingTarget === "PROPOSE_DELETE") && deleteListId) {
          targetListId = deleteListId;
      } else if (["THIS_HOUR", "TODAY", "TOMORROW", "THIS_WEEK", "THIS_MONTH", "SCHEDULED_LATER"].includes(u.routingTarget) && todoListId) {
          targetListId = todoListId;
      }
      
      let daComment = "DA:";
      let sysComment = "SYS:";
      let otherNotes = [];
      let urlLine = "";
      
      const lines = (task.notes || "").split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("http")) {
          urlLine = trimmed;
        } else if (trimmed.startsWith("DA:")) {
          daComment = u.clearUserComment ? "DA:" : trimmed;
        } else if (trimmed.startsWith("SYS:")) {
          sysComment = trimmed;
        } else if (trimmed.startsWith("[DEADLINE:")) {
          // ignore old
        } else if (trimmed !== "") {
          otherNotes.push(trimmed);
        }
      });
      
      if (u.systemComment) sysComment = `SYS: ${u.systemComment}`;
      
      const deadline = u.recommendedDeadline || "None";
      const duration = u.estimatedDuration || "N/A";
      const goal = u.alignedGoal || "TBD";
      otherNotes.push(`[DEADLINE: ${deadline}] | [DURATION: ${duration}] | [GOAL: ${goal}]`);
      
      if (deadline !== "None") {
        try {
          task.due = new Date(deadline).toISOString();
        } catch (e) {
          console.warn(`Invalid deadline format for task ${u.taskId}: ${deadline}`);
        }
      } else {
        task.due = null;
      }
      
      const finalNotes = [];
      if (urlLine) finalNotes.push(urlLine);
      if (otherNotes.length > 0) finalNotes.push(otherNotes.join('\n'));
      if (sysComment !== "SYS:" || daComment !== "DA:") {
        finalNotes.push("");
        finalNotes.push(sysComment);
        finalNotes.push(daComment);
      }
      
      task.notes = finalNotes.join('\n');
      if (u.routingTarget === "COMPLETE") {
        task.status = "completed";
      }
      
      if (targetListId !== listId) {
         console.log(`Moving task ${task.title} from list ${listId} to ${targetListId}`);
         Tasks.Tasks.insert(task, targetListId);
         Tasks.Tasks.remove(listId, u.taskId);
      } else {
         Tasks.Tasks.update(task, listId, u.taskId);
      }
      Utilities.sleep(100);
    } catch (e) {
      console.error("Failed to update task: " + u.taskId, e.message);
    }
  });
}

function writeOnePager(markdownStr) {
  try {
     const files = DriveApp.getFilesByName("One-Pager Priority");
     let file;
     if (files.hasNext()) {
        file = files.next();
        file.setContent(markdownStr);
     } else {
        file = DriveApp.createFile("One-Pager Priority.md", markdownStr, MimeType.PLAIN_TEXT);
     }
  } catch(e) {
     console.error("Failed to write One-Pager:", e.message);
  }
}
