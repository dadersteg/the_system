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

// (Removed TM_MODEL_NAME from top-level to prevent load order issues)

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
     console.error("Failed to fetch 1 Day Prompt Doc: " + e.message);
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
  console.log("Starting Task Master Engine (1 Day 'Today' Operations)...");
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
            let cleanNotes = t.notes || "";
            let metadataStr = "";
            let aiHashMatch = false;
            
            if (cleanNotes) {
              const metaSplit = cleanNotes.split('---SYSTEM_METADATA---');
              cleanNotes = metaSplit[0];
              if (metaSplit.length > 1) metadataStr = metaSplit[1].trim();
              
              cleanNotes = cleanNotes.replace(/\[DEADLINE:[^\]]*\]\s*\|\s*\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
              cleanNotes = cleanNotes.replace(/\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
              cleanNotes = cleanNotes.trim();
            }
            
            const taskContentForHash = (t.title || "") + "|" + cleanNotes + "|" + (t.due || "") + "|" + (t.status || "");
            const currentHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, taskContentForHash));
            
            let userConstraint = "";
            if (metadataStr) {
               try {
                 const existingMetadata = JSON.parse(metadataStr);
                 if (existingMetadata.user_constraint) {
                    userConstraint = existingMetadata.user_constraint;
                 }
                 if (existingMetadata.ai_hash === currentHash) {
                    aiHashMatch = true;
                 }
               } catch(e) {}
            }
            
            if (userConstraint) {
               cleanNotes += `\n[SYSTEM DIRECTIVE - STRICT USER CONSTRAINT: ${userConstraint}]`;
            }
            
            const needsReview = !aiHashMatch;
            
            rawTasks.push({
              id: t.id,
              listId: listId,
              title: t.title,
              notes: cleanNotes,
              status: t.status,
              due: t.due || null,
              needsReview: needsReview
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
  
  const tasksToRoute = rawTasks.filter(t => t.needsReview).slice(0, 50);
  
  console.log(`Extracted ${rawTasks.length} total tasks. ${tasksToRoute.length} require AI review.`);
  if (tasksToRoute.length === 0) {
      console.log("No tasks require AI review. Micro-batch exiting.");
      return;
  }

  const capacity = getCalendarCapacity();
  const goals = getSystemGoals();
  const taxonomy = getSystemTaxonomy();

  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[now.getDay()];

  const payload = {
    currentTime: `${now.toISOString()} (${dayName})`,
    capacity: capacity,
    goals: goals,
    taxonomy: taxonomy,
    allTasksContext: rawTasks.map(t => ({id: t.id, title: t.title, due: t.due, status: t.status})),
    tasksToRoute: tasksToRoute.map(t => ({id: t.id, title: t.title, notes: t.notes, due: t.due, status: t.status}))
  };
  
  console.log(`Executing Micro-Batch AI Routing via Gemini for ${tasksToRoute.length} tasks...`);

  const aiResult = executeTaskMasterGemini(payload, systemPrompt);
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
  
  console.log("Task Master Engine Complete.");
  return "Task Master Engine Complete (One-Pager skipped as requested).";
}

function getCalendarCapacity() {
  const now = new Date();
  const endDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  try {
    const events = CalendarApp.getDefaultCalendar().getEvents(now, endDate);
    const capacityMap = {};
    events.forEach(e => {
       const d = Utilities.formatDate(e.getStartTime(), "Europe/London", "yyyy-MM-dd");
       if (!capacityMap[d]) capacityMap[d] = 0;
       capacityMap[d] += (e.getEndTime().getTime() - e.getStartTime().getTime()) / 3600000;
    });
    return capacityMap;
  } catch(e) {
    return { error: "Could not fetch calendar" };
  }
}

function getTodayCalendarEvents() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  try {
    const events = CalendarApp.getDefaultCalendar().getEvents(startOfDay, endOfDay);
    return events.map(e => ({
       title: e.getTitle(),
       start: Utilities.formatDate(e.getStartTime(), "Europe/London", "HH:mm"),
       end: Utilities.formatDate(e.getEndTime(), "Europe/London", "HH:mm"),
       isAllDay: e.isAllDayEvent()
    }));
  } catch(e) {
    return [];
  }
}

function getSystemGoals() {
  const cache = CacheService.getScriptCache();
  const cachedGoals = cache.get("SYSTEM_GOALS_V2");
  if (cachedGoals) return cachedGoals;

  try {
    const personalId = SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID;
    const workId = SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID;
    
    let goalsText = "=== PERSONAL GOALS ===\n";
    goalsText += DriveApp.getFileById(personalId).getBlob().getDataAsString();
    goalsText += "\n\n=== WORK GOALS ===\n";
    goalsText += DriveApp.getFileById(workId).getBlob().getDataAsString();
    
    cache.put("SYSTEM_GOALS_V2", goalsText.substring(0, 100000), 21600); // Cache for 6 hours
    return goalsText;
  } catch (e) {
    console.error("Failed to fetch System Goals: " + e.message);
    return "1. Financial Independence 2. Health Optimization 3. System Development";
  }
}

function getSystemTaxonomy() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("SYSTEM_TAXONOMY_V2");
  if (cached) return cached;
  
  try {
     const docId = SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID;
     if (!docId) return "[]";
     
     const text = DriveApp.getFileById(docId).getBlob().getDataAsString();
     cache.put("SYSTEM_TAXONOMY_V2", text.substring(0, 100000), 21600);
     return text;
  } catch(e) {
     console.error("Failed to fetch System Taxonomy: " + e.message);
     return "[]";
  }
}

function executeTaskMasterGemini(payloadObj, systemInstruction) {
  
  const schema = {
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
            "alignedGoal": { "type": "STRING", "description": "The URN (e.g. 2026-MD-NEW-045) of the System Goal this task serves. You must find this URN in the provided goals tables. If the task is a mandatory administrative chore that does not advance a specific strategic goal, output 'Maintenance'." },
            "category_path": { "type": "STRING", "description": "The EXACT value from the 'Concat (Path)' field of the provided Taxonomy JSON. You MUST use the full path format (e.g. '01 05 01 Projects > AI'). Do NOT use the Label format or hallucinate paths." },
            "recommendedTitle": { "type": "STRING", "description": "The polished title for the task, following the guidelines in the prompt." },
            "systemComment": { "type": "STRING", "description": "AI questions or feedback to the user." },
            "clearUserComment": { "type": "BOOLEAN", "description": "Set to true if you have processed the user's DA: instruction." }
          },
          "required": ["taskId", "routingTarget", "estimatedDuration", "alignedGoal", "category_path", "recommendedTitle"]
        }
      }
    },
    "required": ["taskUpdates"]
  };

  const payloadStr = JSON.stringify(payloadObj);
  const TM_MODEL_NAME = selectModelForPayload(payloadStr, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH);
  const result = callGemini(payloadStr, TM_MODEL_NAME, systemInstruction, schema);
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
  
  // Patch Task 12
  (function manualPatchTask() {
    const listId = "RWNzLU50Qmp1QUZpalhqSg"; // ToDo
    const taskId = "dVVSYlhnMDNjVzFtMFJrbA";
    try {
      let t = Tasks.Tasks.get(listId, taskId);
      let meta = {
        duration: "30m",
        goal: "Maintenance",
        category_path: "01 04 00 Finances > Insurance",
        deadline: "2026-05-31" 
      };
      t.due = new Date("2026-05-31T00:00:00Z").toISOString();
      t.notes = "---SYSTEM_METADATA---\n" + JSON.stringify(meta);
      Tasks.Tasks.update(t, listId, taskId);
    } catch(e) {}
  })();
  
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
      
      const deadlineMatch = textBlock.match(/\[DEADLINE:\s*([^\]]+)\]/);
      if (deadlineMatch && deadlineMatch[1] !== "None" && !existingMetadata.deadline) {
         existingMetadata.deadline = deadlineMatch[1].trim();
      }
      
      const lines = textBlock.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        // Skip the old summary block if it somehow remained, to avoid duplicates
        if (trimmed.startsWith("[DEADLINE:") && trimmed.includes("[DURATION:")) return;
        
        if (trimmed.startsWith("DA:")) {
          if (u.clearUserComment && trimmed !== "DA:") {
            existingMetadata.user_constraint = trimmed.substring(3).trim();
            daComment = "DA:";
          } else {
            daComment = trimmed;
          }
        } else if (trimmed.startsWith("SYS:")) {
          if (trimmed.includes("Pending initial review")) {
             sysComment = "SYS: Migrated to V6 structure.";
          } else {
             sysComment = trimmed;
          }
        } else if (trimmed !== "") {
          otherNotes.push(line);
        }
      });
      
      if (task.links && task.links.length > 0) {
        let newLinksAdded = false;
        task.links.forEach(l => {
           let desc = l.description || "Link";
           let url = l.link || "";
           if (url) {
              let linkStr = `${desc}: ${url}`;
              if (rawNotes.indexOf(url) === -1) {
                 if (!newLinksAdded) {
                    otherNotes.push("");
                    otherNotes.push("--- Attached Links ---");
                    newLinksAdded = true;
                 }
                 otherNotes.push(linkStr);
              }
           }
        });
      }
      
      if (u.systemComment) sysComment = `SYS: ${u.systemComment}`;
      
      const originalDate = task.due;
      let isFutureDate = false;
      if (originalDate && !originalDate.includes("2099-12-31")) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const taskDate = new Date(originalDate);
        if (taskDate >= today) {
          isFutureDate = true;
        }
      }

      if (isFutureDate && u.routingTarget === "BACKLOG") {
        console.log(`Task ${u.taskId} has future date ${originalDate}. Overriding BACKLOG -> SCHEDULE.`);
        u.routingTarget = "SCHEDULE";
        if (!u.recommendedDeadline) u.recommendedDeadline = originalDate;
      }

      if (u.routingTarget === "BACKLOG") {
        task.due = new Date("2099-12-31T00:00:00Z").toISOString();
      } else if (u.recommendedDeadline !== undefined) {
        if (u.recommendedDeadline === "None") {
          task.due = null;
        } else if (u.recommendedDeadline === "") {
          if (originalDate) {
            task.due = originalDate;
          }
        } else {
          try {
            task.due = new Date(u.recommendedDeadline).toISOString();
          } catch (e) {
            console.warn(`Invalid deadline format for task ${u.taskId}: ${u.recommendedDeadline}`);
          }
        }
      } else if (originalDate) {
        // Do not wipe the existing date if AI didn't provide one!
        task.due = originalDate;
      }
      
      existingMetadata.duration = u.estimatedDuration || existingMetadata.duration || "N/A";
      existingMetadata.goal = u.alignedGoal || existingMetadata.goal || "TBD";
      if (!existingMetadata.created_at) {
        existingMetadata.created_at = new Date().toISOString();
      }
      if (task.due) {
        existingMetadata.deadline = task.due.substring(0, 10);
      } else {
        existingMetadata.deadline = "None";
      }
      
      if (u.category_path && u.category_path !== "N/A" && u.category_path !== "") {
        existingMetadata.category_path = u.category_path;
        task.title = u.recommendedTitle || task.title;
      } else if (u.recommendedTitle) {
        task.title = u.recommendedTitle;
      }
      
      const finalNotes = [];
      if (otherNotes.length > 0) finalNotes.push(otherNotes.join('\n'));
      
      const visibleDeadline = existingMetadata.deadline || "None";
      const visibleDuration = existingMetadata.duration || "N/A";
      const visibleGoal = existingMetadata.goal || "TBD";
      
      finalNotes.push("");
      finalNotes.push(`[DEADLINE: ${visibleDeadline}] | [DURATION: ${visibleDuration}] | [GOAL: ${visibleGoal}]`);
      finalNotes.push("");
      finalNotes.push(sysComment || "SYS:");
      finalNotes.push(daComment || "DA:");
      
      finalNotes.push("");
      finalNotes.push("---SYSTEM_METADATA---");
      
      const savedTaskTitle = task.title || "";
      const savedTaskDue = task.due || "";
      const savedTaskStatus = task.status || "";
      
      // Guaranteed Hash Sync: Simulate the exact parse transformation the reader uses
      const rawNotesStr = finalNotes.join('\n');
      const metaSplitForHash = rawNotesStr.split('---SYSTEM_METADATA---');
      let baseNotesForHash = metaSplitForHash[0];
      baseNotesForHash = baseNotesForHash.replace(/\[DEADLINE:[^\]]*\]\s*\|\s*\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
      baseNotesForHash = baseNotesForHash.replace(/\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
      baseNotesForHash = baseNotesForHash.trim();
      
      const finalContentForHash = savedTaskTitle + "|" + baseNotesForHash + "|" + savedTaskDue + "|" + savedTaskStatus;
      existingMetadata.ai_hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, finalContentForHash));
      
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
         delete task.links;
         delete task.id;
         delete task.etag;
         delete task.position;
         delete task.updated;
         delete task.selfLink;
         Tasks.Tasks.insert(task, targetListId);
         Tasks.Tasks.remove(listId, u.taskId);
      } else {
         const patchObj = {
           notes: task.notes,
           due: task.due,
           title: task.title,
           status: task.status
         };
         Tasks.Tasks.patch(patchObj, listId, u.taskId);
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
     
     const fileName = isDailyPlan ? "TS - Task Master > 1 Day Execution Plan.md" : "TS - Task Master > Global Priority Review.md";
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

function runHourlyReview() {
  const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const recurringListId = SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID;
  
  const rawTasks = [];
  [importerListId, todoListId, recurringListId].forEach(listId => {
    let pageToken;
    do {
      try {
        const response = Tasks.Tasks.list(listId, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
        const items = response.items || [];
        items.forEach(t => rawTasks.push({ id: t.id, title: t.title, due: t.due, notes: t.notes || "", status: t.status }));
        pageToken = response.nextPageToken;
      } catch (e) {
        console.error(`runHourlyReview Error reading list ${listId}: ${e.message}`);
        pageToken = undefined;
      }
    } while (pageToken);
  });

  if (rawTasks.length === 0) {
     console.error("runHourlyReview: No tasks found. Aborting to prevent generating an empty plan.");
     return;
  }

  const now = new Date();
  const localTimeStr = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd'T'HH:mm:ss");
  const localDayName = Utilities.formatDate(now, "Europe/London", "EEEE");

  const payload = {
    currentTime: `${localTimeStr} (${localDayName})`,
    capacity: getCalendarCapacity(),
    todayEvents: getTodayCalendarEvents(),
    goals: getSystemGoals(),
    allTasksContext: rawTasks.map(t => {
       let cleanNotes = t.notes;
       let metadata = {};
       const metaSplit = cleanNotes.split('---SYSTEM_METADATA---');
       if (metaSplit.length > 1) {
          try {
             metadata = JSON.parse(metaSplit[1].trim());
          } catch(e) {}
       }
       cleanNotes = metaSplit[0].replace(/\[DEADLINE:[^\]]*\]\s*\|\s*\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
       cleanNotes = cleanNotes.replace(/\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
       return { 
         id: t.id,
         title: t.title, 
         due: t.due, 
         notes: cleanNotes.trim(),
         category_path: metadata.category_path || "N/A",
         goal: metadata.goal || "N/A",
         duration: metadata.duration || "N/A"
       };
    })
  };

  let systemPrompt = "";
  const promptFiles = DriveApp.getFolderById(SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID).getFilesByName("TS - Task Master > 1 Day Operations Prompt.md");
  if (promptFiles.hasNext()) {
     systemPrompt = promptFiles.next().getBlob().getDataAsString();
  } else {
     const promptId = SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID;
     systemPrompt = DriveApp.getFileById(promptId).getBlob().getDataAsString();
  }
  
  const payloadStr = JSON.stringify(payload);
  // Use the smartest model available for full-context reasoning, with fallback to 2M context if needed
  const MODEL_NAME = selectModelForPayload(payloadStr, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO);
  
  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  const requestPayload = {
    "systemInstruction": { "parts": [{ "text": systemPrompt }] },
    "contents": [{ "role": "user", "parts": [{ "text": payloadStr }] }],
    "generationConfig": { "temperature": 0.2 }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(requestPayload),
    "muteHttpExceptions": true
  };

  let responseText = null;
  let success = false;
  let finalModelUsed = MODEL_NAME;
  const maxRetries = 2; // Try each model up to 2 times
  const modelsToTry = [MODEL_NAME, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH];
  
  for (const currentModel of modelsToTry) {
    if (success) break;
    if (!currentModel) continue;
    
    finalModelUsed = currentModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Executing Hourly Review via ${currentModel} (Attempt ${attempt}/${maxRetries})...`);
      
      const response = UrlFetchApp.fetch(url, options);
      responseText = response.getContentText();
      
      if (response.getResponseCode() === 200) {
        success = true;
        break; // Break the inner retry loop
      } else {
        console.warn(`Hourly Review failed with ${currentModel} on attempt ${attempt}:`, responseText);
        if (responseText.includes("503") || responseText.includes("429")) {
          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt) * 5000;
            console.log(`Waiting ${backoff/1000} seconds before retrying...`);
            Utilities.sleep(backoff);
          }
        } else {
          break; // Do not retry on 400 Bad Request, fall to next model
        }
      }
    }
  }

  if (!success) {
      console.error("Hourly Review completely failed after all attempts.");
      return;
  }
  
  const json = JSON.parse(responseText);
  if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      let markdownReport = json.candidates[0].content.parts[0].text;
      markdownReport += `\n\n---\n*Report dynamically generated by ${finalModelUsed}*`;
      
      writeOnePager(markdownReport, true);
      console.log("Hourly Review Complete. Report generated.");
      
      try {
         executeTimeboxing();
      } catch (e) {
         console.error("Timeboxing execution failed:", e.message);
      }
  } else {
      console.error("Hourly Review failed to parse AI response:", responseText);
  }
}

/**
 * Time-gated wrapper for runHourlyReview. 
 * Attach this to an Hourly time-driven trigger. It will only execute at 8, 12, 16, and 20.
 */
function hourlyReviewTriggerWrapper() {
  // Use GMT/UTC or adjust for timezone if needed
  const currentHour = new Date().getHours(); 
  
  // Only execute during these specific hours
  if ([6, 8, 12, 16, 20].includes(currentHour)) {
    console.log(`Current hour is ${currentHour}. Cleaning tasks and then executing scheduled review.`);
    
    // Ensure tasks are cleaned/categorized before generating the report
    try {
      runTaskMasterEngine(); 
    } catch (e) {
      console.warn("TaskMasterEngine failed during hourly pre-clean:", e.message);
    }
    
    runHourlyReview();
  } else {
    console.log(`Current hour is ${currentHour}. Skipping review (only runs at 8, 12, 16, 20).`);
  }
}
