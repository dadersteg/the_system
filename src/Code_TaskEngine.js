/**
 * ============================================================================
 * THE SYSTEM: TASK ENGINE (Unified Pipeline & AI Master) V6
 * ============================================================================
 * This unified script handles:
 * 1. TASK MASTER: The AI Agent that routes tasks based on the Eisenhower Matrix,
 *    managing dates and backlog natively without list moving (except Importer -> ToDo).
 * 2. PROMPTS: The strict frameworks governing the Task Master AI.
 */

// ============================================================================
// SECTION 1: SYSTEM PROMPTS & CONFIGURATION
// ============================================================================

const TM_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO; // Best model for massive global context

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

function getTaskMasterDailyPrompt() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("TASK_MASTER_DAILY_PROMPT");
  if (cached) return cached;
  
  try {
     const docId = SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID;
     if (!docId) return "SYSTEM PROMPT MISSING";
     
     const file = DriveApp.getFileById(docId);
     const text = file.getBlob().getDataAsString();
     
     cache.put("TASK_MASTER_DAILY_PROMPT", text.substring(0, 100000), 21600); // 6 hours
     return text;
  } catch(e) {
     console.error("Failed to fetch Daily Prompt Doc: " + e.message);
     return "SYSTEM PROMPT MISSING";
  }
}

// ============================================================================
// SECTION 2: AI TASK MASTER (Routing & Priority One-Pager) V6
// ============================================================================

function runTaskMasterEngine() {
  console.log("Starting Task Master Engine (Global Sweep)...");
  const prompt = getTaskMasterSystemPrompt();
  return _executeTaskMasterPipeline(prompt, false);
}

function runTaskMasterDailyPlan() {
  console.log("Starting Task Master Engine (Daily 'Today' Operations)...");
  const prompt = getTaskMasterDailyPrompt();
  return _executeTaskMasterPipeline(prompt, true);
}

function _executeTaskMasterPipeline(systemPrompt, isDailyPlan) {
  
  const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  
  const rawTasks = [];
  const taskIdMap = {};
  
  const listsToFetch = [importerListId, todoListId];
  
  listsToFetch.forEach(listId => {
    let pageToken;
    do {
      try {
        const response = Tasks.Tasks.list(listId, {
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
          pageToken: pageToken
        });
        const items = response.items || [];
        items.forEach(t => {
          rawTasks.push({
            id: t.id,
            listId: listId,
            title: t.title,
            notes: t.notes || "",
            status: t.status,
            due: t.due || null
          });
          taskIdMap[t.id] = listId;
        });
        pageToken = response.nextPageToken;
      } catch (e) {
        console.error(`Error reading list ${listId}: ${e.message}`);
        pageToken = undefined;
      }
    } while (pageToken);
  });
  
  console.log(`Extracted ${rawTasks.length} active tasks across Importer and ToDo.`);
  if (rawTasks.length === 0) return;

  const capacity = getCalendarCapacity();
  const goals = getSystemGoals();

  const payload = {
    currentTime: new Date().toISOString(),
    capacity: capacity,
    goals: goals,
    tasksToRoute: rawTasks
  };
  
  console.log(`Executing Global AI Routing via Gemini Pro for ${rawTasks.length} tasks...`);

  const aiResult = executeTaskMasterGemini(payload, systemPrompt, false);
  if (!aiResult) {
     console.error("AI Routing failed. Gemini returned null or threw an error.");
     return;
  }
  
  if (aiResult.taskUpdates && aiResult.taskUpdates.length > 0) {
     console.log(`Applying updates to ${aiResult.taskUpdates.length} tasks...`);
     processTaskUpdates(aiResult.taskUpdates, taskIdMap, importerListId, todoListId);
     console.log(`Successfully finished applying task updates.`);
  } else {
     console.warn("No task updates returned from Gemini.");
  }
  
  console.log("Generating final Priority One-Pager...");
  const summaryResult = executeTaskMasterGemini(payload, systemPrompt, true);
  if (summaryResult && summaryResult.onePagerMarkdown) {
     console.log("Writing Priority One-Pager to Google Drive...");
     const fileUrl = writeOnePager(summaryResult.onePagerMarkdown, isDailyPlan);
     if (fileUrl) {
       console.log(`One-Pager successfully generated and saved. Link: ${fileUrl}`);
       return fileUrl;
     } else {
       console.log("One-Pager generated, but failed to retrieve link.");
       return "One-Pager generated, but failed to retrieve link.";
     }
  }
  
  console.log("Task Master Engine Complete.");
  return "Task Master Engine Complete (No new updates).";
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

function executeTaskMasterGemini(payloadObj, systemInstruction, isSummaryOnly = false) {
  
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
            "routingTarget": { "type": "STRING", "description": "SCHEDULE, BACKLOG, DELETE, COMPLETE, RETAIN_IMPORTER" },
            "recommendedDeadline": { "type": "STRING", "description": "YYYY-MM-DD format. Required if SCHEDULE." },
            "estimatedDuration": { "type": "STRING", "description": "e.g. 15m, 1h, 2h" },
            "alignedGoal": { "type": "STRING", "description": "The specific Goal this advances, or Maintenance" },
            "systemComment": { "type": "STRING", "description": "AI questions or feedback to the user." },
            "clearUserComment": { "type": "BOOLEAN", "description": "Set to true if you have processed the user's DA: instruction." }
          },
          "required": ["taskId", "routingTarget", "estimatedDuration", "alignedGoal"]
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

function processTaskUpdates(updates, taskIdMap, importerListId, todoListId) {
  if (!updates || updates.length === 0) return;
  
  console.log("=== AI ROUTING DECISIONS ===");
  console.log(JSON.stringify(updates, null, 2));
  console.log("============================");
  
  updates.forEach(u => {
    try {
      const listId = taskIdMap[u.taskId];
      if (!listId) return;
      
      const task = Tasks.Tasks.get(listId, u.taskId);
      if (!task) return;
      
      let targetListId = listId;
      
      // Move from Importer to ToDo if verified and not explicitly retaining/deleting
      if (listId === importerListId && u.routingTarget !== "RETAIN_IMPORTER" && u.routingTarget !== "DELETE") {
          targetListId = todoListId;
      }
      
      let daComment = "DA:";
      let sysComment = "SYS:";
      let otherNotes = [];
      let urlLine = "";
      
      const rawNotes = task.notes || "";
      const parts = rawNotes.split('---SYSTEM_METADATA---');
      const textBlock = parts[0];
      
      let existingMetadata = {};
      if (parts.length > 1) {
         try {
           existingMetadata = JSON.parse(parts[1].trim());
         } catch(e) {}
      }
      
      const lines = textBlock.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("http")) {
          urlLine = trimmed;
        } else if (trimmed.startsWith("Context:")) {
          otherNotes.push(trimmed);
        } else if (trimmed.startsWith("DA:")) {
          daComment = u.clearUserComment ? "DA:" : trimmed;
        } else if (trimmed.startsWith("SYS:")) {
          sysComment = trimmed;
        } else if (trimmed !== "") {
          otherNotes.push(trimmed);
        }
      });
      
      if (u.systemComment) sysComment = `SYS: ${u.systemComment}`;
      
      if (u.routingTarget === "SCHEDULE" && u.recommendedDeadline) {
        try {
          task.due = new Date(u.recommendedDeadline).toISOString();
        } catch (e) {
          console.warn(`Invalid deadline format for task ${u.taskId}: ${u.recommendedDeadline}`);
        }
      } else if (u.routingTarget === "BACKLOG") {
        task.due = new Date("2099-12-31T00:00:00Z").toISOString();
      } else {
        task.due = null;
      }
      
      existingMetadata.duration = u.estimatedDuration || existingMetadata.duration || "N/A";
      existingMetadata.goal = u.alignedGoal || existingMetadata.goal || "TBD";
      
      const finalNotes = [];
      if (urlLine) finalNotes.push(urlLine);
      if (otherNotes.length > 0) finalNotes.push(otherNotes.join('\n'));
      if (sysComment !== "SYS:" || daComment !== "DA:") {
        finalNotes.push("");
        finalNotes.push(sysComment);
        finalNotes.push(daComment);
      }
      
      finalNotes.push("");
      finalNotes.push("---SYSTEM_METADATA---");
      finalNotes.push(JSON.stringify(existingMetadata));
      
      task.notes = finalNotes.join('\n');
      
      if (u.routingTarget === "COMPLETE") {
        task.status = "completed";
      } else if (u.routingTarget === "DELETE") {
        if (!task.title.startsWith("99 To be deleted ")) {
           task.title = "99 To be deleted " + task.title;
        }
      }
      
      if (targetListId !== listId) {
         console.log(`Moving task ${task.title} from Importer to ToDo`);
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

function writeOnePager(markdownStr, isDailyPlan) {
  try {
     const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
     const folder = DriveApp.getFolderById(folderId);
     
     const fileName = isDailyPlan ? "TS - Task Master > Daily Execution Plan.md" : "TS - Task Master > Global Priority Review.md";
     const files = folder.getFilesByName(fileName);
     let file;
     if (files.hasNext()) {
        file = files.next();
        file.setContent(markdownStr);
     } else {
        file = folder.createFile(fileName, markdownStr, MimeType.PLAIN_TEXT);
     }
     return file.getUrl();
  } catch(e) {
     console.error("Failed to write One-Pager:", e.message);
     return null;
  }
}
