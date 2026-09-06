/**
 * @file 03_TaskEngine.js
 * @description Task Master AI Optimization Engine, 1-Day Hourly Review, Time Slot Capacity Calculation & Task Harmonizer Audit RPCs.
 */

// ==========================================
// SECTION 1: TASK MASTER AI OPTIMIZATION & HOURLY REVIEW
// ==========================================

/**
 * ============================================================================
 * THE SYSTEM: TASK ENGINE (Unified Pipeline & AI Master) V6
 * ============================================================================
 * Handles autonomous priority scheduling, Eisenhower matrix task routing,
 * Google Calendar availability mapping, and daily priority review one-pager
 * markdown generation.
 */

// ============================================================================
// SECTION 1: SYSTEM PROMPTS & CACHING HELPERS
// ============================================================================

/**
 * Retrieves the global Task Master System Prompt from Google Drive.
 * Prioritizes the workspace folder by filename, falling back to direct ID.
 * 
 * @returns {string} Global system prompt instructions text.
 */
function getTaskMasterSystemPrompt() {
  try {
     let text = "";
     let sourceName = "";
     let resolvedId = "";
     
     // 1. Direct ID from config
     const docId = SYSTEM_CONFIG.DOCS.TASK_MASTER_PROMPT_ID || "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar";
     if (docId) {
       try {
         const f = DriveApp.getFileById(docId);
         const raw = f.getBlob().getDataAsString();
         if (raw && raw.trim().length > 50) {
           text = raw;
           sourceName = f.getName();
           resolvedId = docId;
         }
       } catch(e) {
         console.warn(`Direct ID lookup for TASK_MASTER_PROMPT_ID (${docId}) failed: ${e.message}`);
       }
     }
     
     // 2. Fallback: Search in Workspace Folder by filename
     if (!text || text.trim().length === 0) {
       const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
       if (workspaceFolderId) {
         try {
           const folder = DriveApp.getFolderById(workspaceFolderId);
           const candidates = [
             "Task_Master_Prompt.md",
             "202608 - Task Master Prompt.md",
             "202608 - Task Master Global Routing System Prompt.md"
           ];
           for (const name of candidates) {
             const it = folder.getFilesByName(name);
             if (it.hasNext()) {
               const f = it.next();
               const raw = f.getBlob().getDataAsString();
               if (raw && raw.trim().length > 50) {
                 text = raw;
                 sourceName = f.getName();
                 resolvedId = f.getId();
                 break;
               }
             }
           }
         } catch(e) {
           console.warn("Workspace folder prompt search failed: " + e.message);
         }
       }
     }
     
     if (!text || text.trim().length === 0) {
       console.error("Task Master Prompt document could not be found or is empty!");
       return "SYSTEM PROMPT MISSING";
     }
     
     const processed = processPromptText(text);
     console.log(`✓ Loaded Task Master System Prompt from "${sourceName}" (ID: ${resolvedId}, ${processed.length} chars)`);
     return processed;
  } catch(e) {
     console.error("Failed to fetch Prompt Doc: " + e.message);
     return "SYSTEM PROMPT MISSING";
  }
}

/**
 * Retrieves the daily Task Master Operations prompt from Google Drive, with script caching.
 * 
 * @returns {string} 1 Day operations prompt instructions text.
 */
function getTaskMasterDailyPrompt() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("TASK_MASTER_DAILY_PROMPT");
  if (cached) return cached;
  
  try {
     const docId = SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID;
     if (!docId) return "SYSTEM PROMPT MISSING";
     
     const file = DriveApp.getFileById(docId);
     const text = processPromptText(file.getBlob().getDataAsString());
     
     cache.put("TASK_MASTER_DAILY_PROMPT", text.substring(0, 100000), 21600); // 6 hours
     return text;
  } catch(e) {
     console.error("Failed to fetch 1 Day Prompt Doc: " + e.message);
     return "SYSTEM PROMPT MISSING";
  }
}


// ============================================================================
// SECTION 2: MAIN ENGINE PIPELINES
// ============================================================================

/**
 * Main routine: Executes the global sweep to route tasks from Importer to ToDo list.
 * Evaluates Eisenhower categories and aligns task parameters via Gemini AI.
 * 
 * @returns {string} Output log string.
 */
function runTaskMasterEngine(forceReviewAll = false) {
  if (!isPipelineAuthorized("TASK_MASTER")) return "Skipped (Scope Mismatch)";

  // Check Cross-Machine Heartbeat Lease from local Mac mini
  if (!forceReviewAll && isLocalEngineActive("TASK_MASTER", 30)) {
    console.log("[TaskMaster] Skipping cloud sweep: Local Mac mini heartbeat lease active.");
    return "Skipped (Local Mac mini engine lease active)";
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Could not acquire script lock. TaskMasterEngine is already running.");
    return "LOCKED";
  }
  try {
    console.log("Starting Task Master Engine (Global Sweep)...");
    const prompt = getTaskMasterSystemPrompt();
    const res = _executeTaskMasterPipeline(prompt, false, forceReviewAll);
    try { if (typeof purgeToBeDeletedTasks === "function") purgeToBeDeletedTasks(); } catch(e) { console.error(e); }
    try { if (typeof purgeQuarantineTasks === "function") purgeQuarantineTasks(); } catch(e) { console.error(e); }
    
    if (res === undefined || (typeof res === "string" && res.startsWith("PARTIAL_FAILURE"))) {
       logSystemHeartbeat("TaskMasterEngine", "FAILURE");
    } else {
       logSystemHeartbeat("TaskMasterEngine", "SUCCESS");
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Main routine: Executes the 1-day "Today" daily execution plan routine.
 * 
 * @returns {string} Output log string.
 */

/**
 * Standardizes a task's title, notes, due date, and status to compute its MD5-Base64 hash.
 * 
 * @param {string} title
 * @param {string} notes
 * @param {string} due
 * @param {string} status
 * @param {boolean} stripTitleTags
 * @returns {string} The computed MD5-Base64 hash.
 */
function getStandardizedTaskHash(title, notes, due, status, stripTitleTags) {
  let normTitle = title || "";
  let normNotes = notes || "";
  let normDue = due || "";
  let normStatus = status || "";

  const tagRegex = /(?:\[(?:DEADLINE|DURATION|GOAL):[^\]]*\]\s*\|?\s*)+/g;

  if (stripTitleTags) {
    normTitle = normTitle.replace(tagRegex, "");
  }
  normTitle = normTitle.replace(/\s+/g, " ").trim();

  const parsed = parseTaskNotes(normNotes);
  const baseNotes = parsed.baseNotes;
  const lines = baseNotes.split(/\r?\n/);
  const filteredLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.indexOf("SYS:") === 0) {
      continue;
    }

    const noTags = line.replace(tagRegex, "");
    const isEmptyOrPipes = /^[ \t|]*$/.test(noTags);
    if (isEmptyOrPipes) {
      continue;
    }

    filteredLines.push(noTags);
  }

  normNotes = filteredLines.join(" ").replace(/\s+/g, " ").trim();
  normDue = normDue.replace(/\s+/g, " ").trim();
  normStatus = normStatus.replace(/\s+/g, " ").trim();

  const taskContentForHash = normTitle + "|" + normNotes + "|" + normDue + "|" + normStatus;
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, taskContentForHash));
}

/**
 * Internal executor pipeline for the Task Master AI engine.
 * Pulls tasks needing review, formats the payload context, calls Gemini API,
 * and processes/applies the scheduled updates back to Google Tasks.
 * 
 * @param {string} systemPrompt The instruction set to feed to Gemini.
 * @param {boolean} isDailyPlan Whether this run is scoped to a 1-day daily plan.
 * @param {boolean} forceReviewAll Whether to force-review all tasks regardless of hash.
 * @returns {string} Finished status logs text.
 */
function _executeTaskMasterPipeline(systemPrompt, isDailyPlan, forceReviewAll = false) {
  const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  
  const rawTasks = [];
  const taskIdMap = {};
  
  // 1. FAST-PATH: Fetch incoming tasks from Importer list first
  const importerTasks = [];
  let importerPageToken;
  do {
    try {
      const response = Tasks.Tasks.list(importerListId, {
        showCompleted: false,
        showHidden: false, showAssigned: true,
        maxResults: 100,
        pageToken: importerPageToken
      });
      const items = response.items || [];
      items.forEach(t => {
          let cleanNotes = t.notes || "";
          let metadataStr = "";
          let aiHashMatch = false;
          
          if (cleanNotes) {
              const parts = cleanNotes.split('---SYSTEM_METADATA---');
              cleanNotes = parts[0];
              if (parts.length > 1) {
                  metadataStr = parts[1].trim();
              }
          }
          
          const currentHash = getStandardizedTaskHash(t.title, t.notes, t.due, t.status, true);
          let userConstraint = "";
          
          const isAssignedTask = !!(t.assignmentInfo || (t.webViewLink && (t.webViewLink.includes("docs.google.com") || t.webViewLink.includes("chat.google.com"))));
          if (isAssignedTask) {
              if (PropertiesService.getScriptProperties().getProperty("ai_hash_" + t.id) === currentHash) {
                  aiHashMatch = true;
              }
          } else if (metadataStr) {
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
          
          const needsReview = forceReviewAll ? true : !aiHashMatch;
          
          const parsedTask = {
             id: t.id,
             listId: importerListId,
             title: t.title,
             notes: cleanNotes,
             status: t.status,
             due: t.due || null,
             needsReview: needsReview
          };
          rawTasks.push(parsedTask);
          importerTasks.push(parsedTask);
          taskIdMap[t.id] = importerListId;
      });
      importerPageToken = response.nextPageToken;
    } catch (e) {
      console.error(`Error reading Importer list ${importerListId}: ${e.message}`);
      importerPageToken = undefined;
    }
  } while (importerPageToken);

  const allTasksNeedingReview = importerTasks.filter(t => t.needsReview);
  console.log(`[TaskMasterEngine] Extracted ${importerTasks.length} tasks from Importer. ${allTasksNeedingReview.length} require AI review.`);
  
  // Fast-Path Zero-Task Check: If no tasks need review, exit immediately without paginating ToDo list or loading AI docs
  if (allTasksNeedingReview.length === 0) {
      console.log("[TaskMasterEngine] 0 tasks require review in Importer. Clean queue! Skipping ToDo pagination and AI.");
      return "SUCCESS: No tasks to route";
  }

  // 2. Fetch ToDo list to populate activeTasks context for semantic cross-check & deduplication
  let todoPageToken;
  do {
    try {
      const response = Tasks.Tasks.list(todoListId, {
        showCompleted: false,
        showHidden: false, showAssigned: true,
        maxResults: 100,
        pageToken: todoPageToken
      });
      const items = response.items || [];
      items.forEach(t => {
          rawTasks.push({
             id: t.id,
             listId: todoListId,
             title: t.title,
             notes: t.notes || "",
             status: t.status,
             due: t.due || null,
             needsReview: false
          });
          taskIdMap[t.id] = todoListId;
      });
      todoPageToken = response.nextPageToken;
    } catch (e) {
      console.error(`Error reading ToDo list ${todoListId}: ${e.message}`);
      todoPageToken = undefined;
    }
  } while (todoPageToken);

  const capacity = getCalendarCapacity();
  const goals = getSystemGoals();
  const taxonomy = getSystemTaxonomy();

  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[now.getDay()];

  const activeMilestones = rawTasks
    .filter(t => t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title)))
    .map(t => ({ id: t.id, title: t.title }));

  const BATCH_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < allTasksNeedingReview.length; i += BATCH_SIZE) {
    chunks.push(allTasksNeedingReview.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${allTasksNeedingReview.length} tasks across ${chunks.length} batch(es)...`);

  let totalUpdated = 0;
  for (let b = 0; b < chunks.length; b++) {
    const tasksToRoute = chunks[b];
    console.log(`\n--- Executing Batch ${b + 1}/${chunks.length} (${tasksToRoute.length} tasks) ---`);

    const payload = {
      currentTime: `${now.toISOString()} (${dayName})`,
      capacity: capacity,
      goals: goals,
      taxonomy: taxonomy,
      activeMilestones: activeMilestones,
      allTasksContext: rawTasks.map(t => ({id: t.id, title: t.title, due: t.due, status: t.status})),
      tasksToRoute: tasksToRoute.map(t => ({id: t.id, title: t.title, notes: t.notes, due: t.due, status: t.status}))
    };
    
    console.log(`Executing AI Routing via Gemini for batch ${b + 1} (${tasksToRoute.length} tasks)...`);
    const aiResult = executeTaskMasterGemini(payload, systemPrompt);
    if (!aiResult) {
       console.error(`AI Routing failed for batch ${b + 1}. Continuing to next batch.`);
       continue;
    }
    
    if (aiResult.taskUpdates && Array.isArray(aiResult.taskUpdates) && aiResult.taskUpdates.length > 0) {
        console.log(`Executing Semantic Cross-Check for ${aiResult.taskUpdates.length} proposed updates in batch ${b + 1}...`);

        // Extract IDs defensively
        const proposedIds = aiResult.taskUpdates
            .map(u => u ? u.taskId : null)
            .filter(id => id != null);

        const crossCheckPayload = {
            instruction: "Perform a Semantic Cross-Check. Compare the proposed 'taskUpdates' against the 'allTasksContext' to identify duplicate tasks or scheduling conflicts.\n\n" +
                         "--- DEDUPLICATION RULES ---\n" +
                         "1. A proposed task is a 'semantic duplicate' of an existing task ONLY if they represent the exact same work item with the exact same objective and details (including different phrasing or formatting representing the same item, e.g. a raw URL vs. a polished title).\n" +
                         "2. Tasks are NOT duplicates if they target different people, clients, projects, case references, ticket IDs, email addresses, or specific dates/subjects, even if the action verb (e.g., 'Draft email', 'Call', 'Review', 'Send') is identical.\n" +
                         "3. Do not mark a task as DELETE unless you are absolutely certain it is a 100% redundant duplicate of an existing active task in 'allTasksContext'. When in doubt, err on the side of safety and do NOT delete the task.\n" +
                         "4. If two tasks have generic titles (e.g., 'Draft email', 'Follow up') without specific context, and you cannot confirm they represent the same work item, you MUST treat them as distinct tasks and RETAIN them.\n" +
                         "5. If a proposed task already has a routingTarget of 'DELETE', 'QUARANTINE_DELETE', 'STAGE_COMPLETE', or 'COMPLETE' in 'proposedUpdates', you MUST NOT modify its routingTarget.\n" +
                         "6. CRITICAL: A task that represents a completed action, confirmation email, receipt, or is marked 'STAGE_COMPLETE' or 'COMPLETE' MUST NEVER be changed to 'DELETE'.\n\n" +
                         "--- OVER-SCHEDULING RULES ---\n" +
                         "7. If a day or category is over-scheduled, adjust the 'recommendedDeadline' to spread out the work. Adjust deadlines ONLY when a single day has an extreme density of tasks (> 5 tasks). Prefer pushing to future weekdays (for work tasks) or weekends (for personal tasks) with low density in 'allTasksContext'. Do not override user-specified deadlines.\n\n" +
                         "--- OUTPUT RULES ---\n" +
                         "8. Return the final corrected JSON object containing the 'taskUpdates' array. You MUST return the entire taskUpdates array, including ALL original tasks from proposedUpdates.\n" +
                         "9. For all fields other than 'routingTarget' (modified only for duplicates) and 'recommendedDeadline' (modified only for over-scheduling), you MUST preserve their original values from proposedUpdates exactly. Do not modify, nullify, or omit them.",
            proposedUpdates: aiResult.taskUpdates,
            allTasksContext: payload.allTasksContext.filter(t => !proposedIds.includes(t.id))
        };
        
        const crossCheckPrompt = "You are a strict QA AI. Return a JSON object with a single 'taskUpdates' array containing the finalized task objects. " +
                                 "Your primary responsibility is to ensure that tasks are not incorrectly deleted, and that existing routing targets (DELETE/QUARANTINE_DELETE/STAGE_COMPLETE/COMPLETE/SPLIT) and metadata fields (estimatedDuration, alignedGoal, newSubTasks, systemComment) are preserved unmodified. " +
                                 "Verify that similar-looking tasks are only marked as duplicates (routingTarget = 'DELETE' or 'QUARANTINE_DELETE') if they represent the exact same work item. " +
                                 "CRITICAL: Tasks targeting different people, clients, projects, case references, or generic titles (e.g. 'Draft email' vs 'Draft email' without context) are NOT duplicates. Tasks representing completed confirmations must retain 'STAGE_COMPLETE' or 'COMPLETE'. " +
                                 "You MUST return ALL original tasks from proposedUpdates, even if unmodified. Do not omit any tasks. Respond ONLY with valid JSON.";
        const crossCheckResult = executeTaskMasterGemini(crossCheckPayload, crossCheckPrompt);
        
        if (crossCheckResult && Array.isArray(crossCheckResult.taskUpdates)) {
            console.log("Semantic Cross-Check complete. Applying finalized updates.");
            const crossCheckMap = {};
            crossCheckResult.taskUpdates.forEach(u => {
                if (u && u.taskId) crossCheckMap[u.taskId] = u;
            });
            aiResult.taskUpdates = aiResult.taskUpdates.map(u => {
                if (u && u.taskId && crossCheckMap[u.taskId]) {
                    return { ...u, ...crossCheckMap[u.taskId] };
                }
                return u;
            });
        } else {
            console.warn("Semantic Cross-Check failed or returned empty. Using original routing results.");
        }
        
        aiResult.taskUpdates = aiResult.taskUpdates.filter(u => u && typeof u === 'object' && u.taskId);
        console.log(`Applying updates to ${aiResult.taskUpdates.length} tasks in batch ${b + 1}...`);
        const success = processTaskUpdates(aiResult.taskUpdates, taskIdMap, importerListId, todoListId);
        if (success) {
            totalUpdated += aiResult.taskUpdates.length;
            console.log(`Successfully finished applying task updates for batch ${b + 1}.`);
        } else {
            console.error(`Finished applying task updates with errors for batch ${b + 1}.`);
        }
    } else {
       console.warn(`No task updates returned from Gemini for batch ${b + 1}.`);
    }
  }
  
  console.log(`Task Master Engine Complete. Total tasks updated across all batches: ${totalUpdated}.`);
  return `Task Master Engine Complete. Processed ${totalUpdated} tasks.`;
}

// ============================================================================
// SECTION 3: DAILY OPERATIONS & HOURLY TRIGGER
// ============================================================================

/**
 * Calculates a strict array of 30-minute time slots available for scheduling today.
 * Enforces boundary rules (e.g., CE (Work) max 3 hrs on Sunday).
 * Removes any slots that overlap with existing calendar events.
 * 
 * @param {string} dayName Current day name (e.g., 'Sunday')
 * @param {boolean} isCEEnv True if in CE environment
 * @param {Array} todayEvents Array of events from getTodayCalendarEvents
 * @returns {string[]} Array of 30-min slot strings
 */
function calculateAvailableTimeSlots(dayName, isCEEnv, todayEvents) {
  let rawSlots = [];
  
  function generate(startH, startM, endH, endM) {
    let slots = [];
    let curH = startH, curM = startM;
    while (curH < endH || (curH === endH && curM < endM)) {
      let nextH = curH;
      let nextM = curM + 15;
      if (nextM >= 60) {
        nextH += 1;
        nextM -= 60;
      }
      
      // Strict hard cap so we don't bleed over the boundary
      if (nextH > endH || (nextH === endH && nextM > endM)) {
        nextH = endH;
        nextM = endM;
      }
      
      let sStr = Utilities.formatString("%02d:%02d", curH, curM);
      let eStr = Utilities.formatString("%02d:%02d", nextH, nextM);
      slots.push({start: sStr, end: eStr});
      curH = nextH;
      curM = nextM;
    }
    return slots;
  }

  if (isCEEnv) {
    if (dayName === "Saturday") {
      return []; // No CE (Work)
    } else if (dayName === "Sunday") {
      // Max 3 hours (six 30-min slots)
      rawSlots = generate(10, 0, 13, 0);
    } else {
      // Weekday CE (Work): 09:00 - 20:00
      rawSlots = generate(9, 0, 20, 0);
    }
  } else {
    // Private
    if (dayName === "Saturday" || dayName === "Sunday") {
      // 10:00 - 18:00
      rawSlots = generate(10, 0, 18, 0);
      // Cap at 4 hours (8 slots) to ensure free time
      rawSlots = rawSlots.slice(0, 8); 
    } else {
      // Weekday Private: 07:15-09:00 and 20:00-21:45
      rawSlots = generate(7, 15, 9, 0).concat(generate(20, 0, 21, 45));
    }
  }

  // Deduct overlaps
  let validSlots = [];
  rawSlots.forEach(slot => {
     let overlap = false;
     for (let i = 0; i < todayEvents.length; i++) {
        let ev = todayEvents[i];
        if (ev.isAllDay) { continue; }
        if (slot.start < ev.end && slot.end > ev.start) {
           overlap = true;
           break;
        }
     }
     if (!overlap) {
        validSlots.push(slot.start + " - " + slot.end);
     }
  });
  
  return validSlots;
}


/**
 * Runs the hourly execution review. Scans active task structures, pulls calendar events,
 * and calls Gemini Pro to generate an active markdown execution report ("One-Pager").
 */
function runHourlyReview(targetDate) {
  const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const recurringListId = SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID;
  
  const rawTasks = [];
  [importerListId, todoListId, recurringListId].forEach(listId => {
    let pageToken;
    do {
      try {
        const response = Tasks.Tasks.list(listId, { showCompleted: false, showHidden: false, showAssigned: true, maxResults: 100, pageToken: pageToken });
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

  const now = targetDate || new Date();
  const localTimeStr = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd'T'HH:mm:ss");
  const localDayName = Utilities.formatDate(now, "Europe/London", "EEEE");

  const todayEvents = getTodayCalendarEvents(now);
  const activeMilestones = rawTasks
    .filter(t => t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title)))
    .map(t => ({ id: t.id, title: t.title }));

  const payload = {
    currentTime: `${localTimeStr} (${localDayName})`,
    capacity: getCalendarCapacity(now),
    todayEvents: todayEvents,
    availableTimeSlots: calculateAvailableTimeSlots(localDayName, IS_CE_ENV, todayEvents),
    goals: getSystemGoals(),
    activeMilestones: activeMilestones,
    allTasksContext: rawTasks.map(t => {
       const parsed = parseTaskNotes(t.notes);
       let metadata = parsed.metadata || {};
       let cleanNotes = parsed.baseNotes.replace(/\[DEADLINE:[^\]]*\]\s*\|\s*\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
       cleanNotes = cleanNotes.replace(/\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]/g, "");
       return { 
         id: t.id,
         title: t.title, 
         due: t.due, 
         notes: cleanNotes.trim(),
         category_path: metadata.category_path || "N/A",
         goal: metadata.goal || "N/A",
         duration: metadata.duration || "N/A",
         milestone: metadata.milestone || (t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title)) ? "Milestone" : "[Milestone] General Admin & Operational Hygiene")
       };
    })
  };

  let systemPrompt = "";
  const promptId = SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID;
  if (promptId) {
     try {
       systemPrompt = DriveApp.getFileById(promptId).getBlob().getDataAsString();
     } catch (e) {
       console.warn("Could not load prompt from Drive ID: " + promptId, e.message);
     }
  } else {
     console.warn("TASK_MASTER_DAILY_PROMPT_ID is not set in SYSTEM_CONFIG.");
  }
  systemPrompt = processPromptText(systemPrompt);
  
  let configOverrides = { "temperature": 0.2 };
  const configMatch = systemPrompt.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```/i);
  
  if (configMatch) {
    // Strip the JSON block from the systemInstruction string regardless of parsing success
    systemPrompt = systemPrompt.substring(configMatch[0].length).trim();
    try {
      const parsedConfig = JSON.parse(configMatch[1].trim());
      if (parsedConfig !== null && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
        configOverrides = Object.assign(configOverrides, parsedConfig);
      } else {
        console.warn("Parsed generationConfig is not a valid object, ignoring.");
      }
    } catch (e) {
      console.warn("Failed to parse generationConfig JSON from system prompt, falling back to default.", e);
    }
  }
  
  if (IS_CE_ENV) {
     let envOverride = "You MUST entirely omit the '**🏠 Personal:**' sections from your output format and ONLY output CE tasks.";
     if (localDayName === "Saturday" || localDayName === "Sunday") {
         envOverride += " CRITICAL: Today is the weekend. You MUST NOT schedule any CE tasks today. Output a summary stating that CE tasks are not permitted on weekends.";
     }
     systemPrompt += "\n\nCRITICAL OVERRIDE: You are currently running in the CE Environment. " + envOverride;
  } else {
     let privOverride = "You MUST entirely omit the '**🎯 CE (Work):**' sections from your output format and ONLY output Private/Personal tasks.";
     if (localDayName === "Saturday" || localDayName === "Sunday") {
         privOverride += " CRITICAL: It is the weekend. You MUST schedule Private tasks strictly between 10:00 and 18:00 (capped at 4 hours total).";
     } else {
         privOverride += " CRITICAL: It is a weekday. DAYTIME WORK HOURS BLACKOUT: You MUST NOT schedule any Private tasks during work hours (09:00 - 20:00). All Private tasks MUST strictly be scheduled in the Morning Window (07:15 - 09:00) or Evening Window (20:00 - 21:45).";
     }
     systemPrompt += "\n\nCRITICAL OVERRIDE: You are currently running in the Private Environment. " + privOverride;
  }
  
  const payloadStr = JSON.stringify(payload);
  // Use the smartest model available for full-context reasoning, with fallback to 2M context if needed
  const MODEL_NAME = selectModelForPayload(payloadStr, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO);
  
  let result = null;
  let finalModelUsed = MODEL_NAME;
  const modelsToTry = [
    MODEL_NAME, 
    SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FALLBACK_PRO || "gemini-pro-latest", 
    SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE
  ];
  
  for (const currentModel of modelsToTry) {
    if (!currentModel) continue;
    finalModelUsed = currentModel;
    console.log(`Executing Hourly Review via ${currentModel}...`);
    
    result = callGemini(payloadStr, currentModel, systemPrompt, null, true);
    if (!result.error) {
      break;
    }
    console.warn(`Hourly Review failed with ${currentModel}:`, result.error);
  }

  if (!result || result.error) {
      console.error("Hourly Review completely failed after all attempts.");
      return;
  }
  
  let markdownReport = result.text;
  markdownReport += `\n\n---\n*Report dynamically generated by ${finalModelUsed}*`;
  
  writeOnePager(markdownReport, true);
  console.log("Hourly Review Complete. Report generated.");
  
  try {
     executeTimeboxing(targetDate, markdownReport);
  } catch (e) {
     console.error("Timeboxing execution failed:", e.message);
  }
}

/**
 * Hourly-scheduled trigger wrapper function. Restricts hourly reviews to execute
 * strictly at 6:00, 8:00, 12:00, 16:00, and 20:00.
 */
function hourlyReviewTriggerWrapper() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Could not acquire script lock. Hourly review is likely running.");
    return;
  }
  try {
    const currentHourStr = Utilities.formatDate(new Date(), "Europe/London", "H");
    const currentHour = parseInt(currentHourStr, 10); 
    
    // Only execute during these specific hours
    if ([6, 8, 12, 16, 20].includes(currentHour)) {
      console.log(`Current hour is ${currentHour}. Executing scheduled review.`);
      runHourlyReview();
    } else {
      console.log(`Current hour is ${currentHour}. Skipping review (only runs at 6, 8, 12, 16, 20).`);
    }
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 4: AI DECISION BRIDGE
// ============================================================================

/**
 * Executes a Content Generation call to Gemini API for task prioritization logic.
 * Parses input using structured JSON schema.
 * 
 * @param {Object} payloadObj Object parameters to prioritize.
 * @param {string} systemInstruction Instructs Gemini's operations behavior.
 * @returns {Object|null} Structured prioritization updates JSON, or null on error.
 */
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
            "taskId": { "type": "STRING", "description": "The exact ID of the task being updated." },
            "routingTarget": { "type": "STRING", "description": "The single best routing target. Must be one of: RETAIN_IMPORTER, TO_DO, BACKLOG, SPLIT, STAGE_COMPLETE, DELETE, QUICK_DELETE, COMPLETE." },
            "estimatedDuration": { "type": "STRING", "description": "Time required. Example: '5m', '30m', '1h', '2h'." },
            "alignedGoal": { "type": "STRING", "description": "The URN of the System Goal this task serves. Example: 'urn:goal:system:2'" },
            "category_path": { "type": "STRING", "description": "The exact valid System Taxonomy category path." },
            "recommendedTitle": { "type": "STRING", "description": "Polished, actionable task title." },
            "recommendedMilestone": { "type": "STRING", "description": "The exact title of an existing milestone from 'activeMilestones', a new milestone epic title starting with '[Milestone] ...' to group related tasks under a project, or 'None' if standalone." },
            "recommendedDeadline": { "type": "STRING", "description": "Format YYYY-MM-DD. Use only for hard external deadlines." },
            "systemComment": { "type": "STRING", "description": "AI questions or feedback to the user. CRITICAL: If routingTarget is 'DELETE', 'QUARANTINE_DELETE', 'STAGE_COMPLETE', or 'COMPLETE', you MUST provide a detailed rationale here explaining why (e.g. why it was staged as completed, quarantined, or deleted)." },
            "clearUserComment": { "type": "BOOLEAN", "description": "Set to true if you have processed the user's DA: instruction." },
            "newSubTasks": {
              "type": "ARRAY",
              "description": "REQUIRED if routingTarget is SPLIT. The sub-tasks to create. Maximum duration per sub-task is 2h.",
              "items": {
                "type": "OBJECT",
                "properties": {
                  "title": { "type": "STRING", "description": "Sub-task title (e.g. 'Draft report pt.1')" },
                  "estimatedDuration": { "type": "STRING", "description": "Max 2h" }
                },
                "required": ["title", "estimatedDuration"]
              }
            }
          },
          "required": ["taskId", "routingTarget", "estimatedDuration", "alignedGoal", "category_path", "recommendedTitle"]
        }
      }
    },
    "required": ["taskUpdates"]
  };

  const payloadStr = JSON.stringify(payloadObj);
  const TM_MODEL_NAME = selectModelForPayload(payloadStr, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE);
  const result = callGemini(payloadStr, TM_MODEL_NAME, systemInstruction, schema);
  if (!result || result.error) {
     console.error("AI Routing failed with error:", result ? result.error : "Unknown/Undefined");
     return null;
  }
  return result;
}

/**
 * Loops through routed task changes recommended by Gemini and applies updates back
 * to Google Tasks API parameters (e.g. titles, metadata, notes, and list positions).
 * 
 * @param {Object[]} updates Prioritization instructions returned by Gemini.
 * @param {Object} taskIdMap Current mappings between task IDs and parent list IDs.
 * @param {string} importerListId Task Importer list ID key.
 * @param {string} todoListId Destination ToDo list ID key.
 */
function processTaskUpdates(updates, taskIdMap, importerListId, todoListId) {
  if (!updates || updates.length === 0) return true;
  
  console.log("=== AI ROUTING DECISIONS ===");
  console.log(JSON.stringify(updates, null, 2));
  console.log("============================");
  
  let hasErrors = false;
  let cachedTodoTasks = null;
  updates.forEach(u => {
    if (!u || typeof u !== 'object') {
       console.warn("Invalid task update object: ", JSON.stringify(u));
       hasErrors = true;
       return;
    }
    try {
      if (typeof u.taskId !== 'string' || typeof u.routingTarget !== 'string') {
          console.warn("Skipping update with invalid types:", JSON.stringify(u));
          return;
      }
      
      // Reject non-string fields
      ['estimatedDuration', 'alignedGoal', 'category_path', 'recommendedTitle', 'recommendedMilestone', 'recommendedDeadline', 'systemComment'].forEach(key => {
        if (!u[key] || u[key] === "null") u[key] = "";
        if (key !== 'recommendedMilestone' && u[key] === "None") u[key] = "";
        
        if (u[key] !== undefined && u[key] !== null && typeof u[key] !== 'string') {
            u[key] = undefined;
        }
      });
      
      const listId = taskIdMap[u.taskId];
      if (!listId) return;
      
      const task = Tasks.Tasks.get(listId, u.taskId);
      if (!task) return;
      
      const isAssignedTask = !!(task.assignmentInfo || (task.webViewLink && (task.webViewLink.includes("docs.google.com") || task.webViewLink.includes("chat.google.com"))));

      // Resolve due date (finalDue) early
      const originalDate = task.due;
      const rawNotes = task.notes || "";
      const parsedNotes = parseTaskNotes(rawNotes);
      const daCommentText = parsedNotes.daComment || "";

      let isFutureDate = false;
      if (originalDate && !originalDate.includes("2099-12-31")) {
        const todayStr = Utilities.formatDate(new Date(), "Europe/London", "yyyy-MM-dd");
        const taskDateStr = Utilities.formatDate(new Date(originalDate), "Europe/London", "yyyy-MM-dd");
        if (taskDateStr >= todayStr) {
          isFutureDate = true;
        }
      }

      if (isFutureDate && u.routingTarget === "BACKLOG") {
        console.log(`Task ${u.taskId} has future date ${originalDate}. Overriding BACKLOG -> SCHEDULE.`);
        u.routingTarget = "SCHEDULE";
        if (!u.recommendedDeadline) u.recommendedDeadline = originalDate;
      }

      let finalDue = originalDate;
      const daDateMatch = daCommentText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const daLockMatch = daCommentText.toLowerCase().includes("keep date") || daCommentText.toLowerCase().includes("lock date") || daCommentText.toLowerCase().includes("do not change date") || daCommentText.toLowerCase().includes("do not reschedule");

      if (daLockMatch && originalDate) {
        finalDue = originalDate;
        console.log(`DA comment lock date found. Keeping original date ${originalDate} for task ${u.taskId}`);
      } else if (daDateMatch) {
        try {
          finalDue = new Date(daDateMatch[1] + "T00:00:00.000Z").toISOString();
          console.log(`DA comment date override found: ${daDateMatch[1]} for task ${u.taskId}`);
        } catch (e) {
          console.warn(`Failed to parse DA override date: ${daDateMatch[1]}`);
        }
      } else if (u.routingTarget === "BACKLOG") {
        finalDue = new Date("2099-12-31T00:00:00Z").toISOString();
      } else if (u.recommendedDeadline !== undefined) {
        if (u.recommendedDeadline === "None") {
          finalDue = null;
        } else if (u.recommendedDeadline === "") {
          if (originalDate) {
            finalDue = originalDate;
          }
        } else {
          try {
            finalDue = new Date(u.recommendedDeadline).toISOString();
          } catch (e) {
            console.warn(`Invalid deadline format for task ${u.taskId}: ${u.recommendedDeadline}`);
          }
        }
      }

      if (!finalDue && u.routingTarget === "TODAY") {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        finalDue = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`).toISOString();
      } else if (!finalDue && u.routingTarget === "TOMORROW") {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        finalDue = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`).toISOString();
      }

      if (u.routingTarget === "SPLIT" && u.newSubTasks && u.newSubTasks.length > 0) {
         console.log(`Executing automated task split for task ${u.taskId}`);
         let allInsertsSucceeded = true;
         
         let actualParentId = u.taskId;
         let actualParentListId = listId;
         let milestoneTitle = u.recommendedTitle || task.title || "";
         if (!milestoneTitle.startsWith("[Milestone]")) {
             milestoneTitle = "[Milestone] " + milestoneTitle;
         }
         
         if (listId !== todoListId) {
             console.log(`Moving parent task ${u.taskId} to ToDo list to become Milestone.`);
             try {
                 const newParentResource = {
                     title: milestoneTitle,
                     notes: task.notes,
                     due: finalDue,
                     status: task.status
                 };
                 const movedParent = Tasks.Tasks.insert(newParentResource, todoListId);
                 if (movedParent && movedParent.id) {
                     actualParentId = movedParent.id;
                     actualParentListId = todoListId;
                     
                     if (isAssignedTask) {
                         Tasks.Tasks.patch({ status: "completed" }, listId, u.taskId);
                     } else {
                         Tasks.Tasks.remove(listId, u.taskId);
                     }
                 } else {
                     throw new Error("Failed to insert parent task");
                 }
             } catch (e) {
                 console.error(`Failed to move parent task: ${e.message}`);
                 return;
             }
         } else {
             console.log(`Renaming parent task ${u.taskId} to Milestone.`);
             try {
                 Tasks.Tasks.patch({ title: milestoneTitle }, listId, u.taskId);
             } catch (e) {
                 console.error(`Failed to rename parent task: ${e.message}`);
             }
         }
         
         const baseMetadata = {
           goal: u.alignedGoal || "TBD",
           category_path: u.category_path || "N/A",
           created_at: new Date().toISOString()
         };
         
         const newTasksCreated = [];
         
         for (const sub of u.newSubTasks) {
             try {
                const subMeta = Object.assign({}, baseMetadata);
                subMeta.duration = sub.estimatedDuration || "N/A";
                
                let cleanOriginalNotes = parseTaskNotes(task.notes).cleanNotes;
                
                if (task.links && Array.isArray(task.links)) {
                   const emailLinkObj = task.links.find(l => l.type === "email");
                   if (emailLinkObj && emailLinkObj.link && !cleanOriginalNotes.includes(emailLinkObj.link)) {
                       cleanOriginalNotes += `\n\n[Original Source Link]: ${emailLinkObj.link}`;
                   }
                } else if (task.webViewLink && !cleanOriginalNotes.includes(task.webViewLink)) {
                   cleanOriginalNotes += `\n\n[Original Source Link]: ${task.webViewLink}`;
                }
                
                const baseSubNotes = "--- ORIGINAL TASK DATA ---\n" + cleanOriginalNotes + "\n\n";
                const subHash = getStandardizedTaskHash(sub.title, baseSubNotes, finalDue || "", "needsAction", true);
                subMeta.ai_hash = subHash;
                const subNotes = baseSubNotes + "---SYSTEM_METADATA---\n" + JSON.stringify(subMeta);
                
                const subTaskResource = {
                  title: sub.title,
                  notes: subNotes,
                  due: finalDue, 
                  status: "needsAction"
                };
                
                const created = Tasks.Tasks.insert(subTaskResource, actualParentListId, { parent: actualParentId });
                newTasksCreated.push(created);
             } catch (e) {
                console.error(`Failed to insert sub-task ${sub.title}: ${e.message}`);
                allInsertsSucceeded = false;
             }
         }
         
         if (allInsertsSucceeded && newTasksCreated.length > 0) {
             console.log(`Successfully split ${u.taskId} into Milestone with native sub-tasks.`);
         } else {
             console.log(`Split inserts partially failed for ${u.taskId}.`);
         }
         return; 
      }
      
      // Let's determine final title (clean metadata and taxonomy paths from title)
      let finalTitle = u.recommendedTitle || task.title || "";
      finalTitle = finalTitle.trim();
      
      // Defensive sanitization: If this is NOT a milestone container, strip any prepended taxonomy path, LOS code, or ' > ' separator
      if (!/^\[milestone\]/i.test(finalTitle) && !/^milestone:/i.test(finalTitle)) {
        if (finalTitle.includes(" > ")) {
          const parts = finalTitle.split(" > ");
          finalTitle = parts[parts.length - 1].trim();
        }
        // Strip any leading LOS code pattern (e.g. "01 05 02 ") or "01 Private/..."
        finalTitle = finalTitle.replace(/^\d{2}(?:\s+\d{2}){1,2}\s+/, "").trim();
        finalTitle = finalTitle.replace(/^0[12]\s+(?:Private|Work|Admin)[^>]*>\s*/i, "").trim();
        // Strip single-word bracketed verbs like [Review], [Integrate], [Align]
        finalTitle = finalTitle.replace(/^\[[A-Za-z]+\]\s*/, "").trim();
      }
      
      let targetListId = listId;
      // CRITICAL FIX: Hard-protect tasks in ToDo from being evicted or deleted by automated background sweeps
      if (listId === todoListId && (u.routingTarget === "DELETE" || u.routingTarget === "QUARANTINE_DELETE" || u.routingTarget === "STAGE_COMPLETE")) {
          console.warn(`Protected task ${u.taskId} in ToDo list from automated move/delete to ${u.routingTarget}. Retaining in ToDo.`);
          targetListId = todoListId;
      } else if (u.routingTarget === "DELETE" || u.routingTarget === "QUARANTINE_DELETE") {
          targetListId = getOrCreateTriageQuarantineListId();
      } else if (u.routingTarget === "QUICK_DELETE") {
          targetListId = (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.TASKS && SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID) ? SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID : targetListId;
      } else if (u.routingTarget === "STAGE_COMPLETE") {
          targetListId = (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.TASKS && SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID) ? SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID : getOrCreateAIReviewListId();
      } else if (listId === importerListId && u.routingTarget !== "RETAIN_IMPORTER") {
          targetListId = todoListId;
      }
      
      if (isAssignedTask && listId !== importerListId) {
          targetListId = listId;
      }
      
      let sysComment = "SYS:";
      let daComment = "DA:";
      let milestoneLine = "";
      let sourceLine = "";
      const otherNotes = [];
      
      const parsedNoteData = parseTaskNotes(rawNotes);
      const textBlock = parsedNoteData.baseNotes;
      let existingMetadata = parsedNoteData.metadata || {};
      
      const isValidWebView = task.webViewLink && !task.webViewLink.toLowerCase().includes("tasks.google.com") && !task.webViewLink.toLowerCase().includes("/tasks") && !task.webViewLink.toLowerCase().includes("googleapis.com/tasks");
      let topLink = (isValidWebView ? task.webViewLink : "") || (task.links && task.links.length > 0 && task.links.find(l => {
         const url = (l.link || "").toLowerCase();
         return url && !url.includes("tasks.google.com") && !url.includes("/tasks") && !url.includes("googleapis.com/tasks");
      })?.link) || "";

      if (!topLink && rawNotes) {
         const linkMatches = rawNotes.match(/https?:\/\/[^\s]+/g);
         if (linkMatches) {
            for (let url of linkMatches) {
               while (/[.,;:!]$/.test(url) || 
                      (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) || 
                      (url.endsWith(']') && (url.match(/\[/g) || []).length < (url.match(/\]/g) || []).length)) {
                  url = url.slice(0, -1);
               }
               const urlLower = url.toLowerCase();
               if (!urlLower.includes("tasks.google.com") && !urlLower.includes("/tasks") && !urlLower.includes("googleapis.com/tasks")) {
                  topLink = url;
                  break;
               }
            }
         }
      }
      
      const lines = textBlock.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("[DEADLINE:") && trimmed.includes("[DURATION:")) return;
        if (trimmed === topLink) return;
        if (trimmed.startsWith("Original Link:") || trimmed.startsWith("Link:")) return;
        if (trimmed.startsWith("--- Attached Links ---")) return;
        
        if (trimmed.startsWith("DA:")) {
          if (u.clearUserComment && trimmed !== "DA:") {
            existingMetadata.user_constraint = trimmed.substring(3).trim();
            daComment = "DA:";
          } else {
            daComment = trimmed;
          }
        } else if (trimmed.startsWith("SYS:")) {
          if (trimmed.includes("Migrated to V6 structure.") || trimmed.includes("Pending initial review")) {
             sysComment = "SYS:";
          } else {
             sysComment = trimmed;
          }
        } else if (trimmed.startsWith("Milestone:")) {
          milestoneLine = trimmed;
        } else if (trimmed.startsWith("Context:")) {
          return;
        } else if (/^(?:Subject|File|Note|\[Source):\s*(.*)/i.test(trimmed)) {
          if (!sourceLine) {
            sourceLine = trimmed;
          }
        } else {
          otherNotes.push(line);
        }
      });
      
      // Dynamic link source resolver for native Google Tasks
      if (topLink && !sourceLine) {
        if (topLink.includes("mail.google.com")) {
          const idMatch = topLink.match(/\/([a-zA-Z0-9]{10,})(?:[/?&#].*)?$/);
          if (idMatch) {
            try {
              const gId = idMatch[1];
              let thread = null;
              try { thread = GmailApp.getThreadById(gId); } catch(e) {}
              if (!thread) {
                try {
                  const msg = GmailApp.getMessageById(gId);
                  if (msg) thread = msg.getThread();
                } catch(e) {}
              }
              if (thread) {
                const s = thread.getFirstMessageSubject() || "(No Subject)";
                sourceLine = `Subject: ${s.replace(/[\r\n\t]+/g, ' ').trim()}`;
              }
            } catch(e) {}
          }
        } else if (topLink.includes("drive.google.com") || topLink.includes("docs.google.com")) {
          const idMatch = topLink.match(/[-\w]{25,}/);
          if (idMatch) {
            try {
              const fileObj = DriveApp.getFileById(idMatch[0]);
              if (fileObj) {
                sourceLine = `File: ${fileObj.getName().replace(/[\r\n\t]+/g, ' ').trim()}`;
              }
            } catch(e) {}
          }
        }
      }

      // Append any other links as standalone links if not topLink
      if (task.links && task.links.length > 0) {
         task.links.forEach(l => {
            const url = l.link || "";
            if (url && url !== topLink) {
               const urlLower = url.toLowerCase();
               if (!urlLower.includes("tasks.google.com") && !urlLower.includes("/tasks") && !urlLower.includes("googleapis.com/tasks") && rawNotes.indexOf(url) === -1) {
                  otherNotes.push(url);
               }
            }
         });
      }
      if (u.systemComment) sysComment = `SYS: ${u.systemComment}`;
      
      if (u.recommendedMilestone && u.recommendedMilestone !== "None") {
         milestoneLine = `Milestone: ${u.recommendedMilestone}`;
         existingMetadata.milestone = u.recommendedMilestone;
      } else if (u.recommendedMilestone === "None") {
         milestoneLine = "";
         delete existingMetadata.milestone;
      }
      
      // finalDue was already resolved at the start of loop
      
      existingMetadata.duration = u.estimatedDuration || existingMetadata.duration || "N/A";
      existingMetadata.goal = u.alignedGoal || existingMetadata.goal || "TBD";
      if (!existingMetadata.created_at) {
        existingMetadata.created_at = new Date().toISOString();
      }
      if (finalDue) {
        existingMetadata.deadline = finalDue.substring(0, 10);
      } else {
        existingMetadata.deadline = "None";
      }
      
      if (u.category_path && u.category_path !== "N/A" && u.category_path !== "") {
        existingMetadata.category_path = u.category_path;
      }
      
      const finalNotes = [];
      if (topLink) {
         finalNotes.push(topLink);
         if (sourceLine) {
            finalNotes.push(sourceLine);
         }
         finalNotes.push("");
      } else if (sourceLine) {
         finalNotes.push(sourceLine);
         finalNotes.push("");
      }
      
      if (existingMetadata.category_path) {
         finalNotes.push(`Context: ${existingMetadata.category_path}`);
         finalNotes.push("");
      }
      
      const cleanedOtherNotes = otherNotes.join('\n').trim();
      if (cleanedOtherNotes) {
         finalNotes.push(cleanedOtherNotes);
      }
      
      const visibleDeadline = existingMetadata.deadline || "None";
      const visibleDuration = existingMetadata.duration || "N/A";
      const visibleGoal = existingMetadata.goal || "TBD";
      
      finalNotes.push("");
      finalNotes.push(`[DEADLINE: ${visibleDeadline}] | [DURATION: ${visibleDuration}] | [GOAL: ${visibleGoal}]`);
      finalNotes.push("");
      finalNotes.push(sysComment || "SYS:");
      if (milestoneLine) {
         finalNotes.push(milestoneLine);
      }
      finalNotes.push(daComment || "DA:");
      
      finalNotes.push("");
      finalNotes.push("---SYSTEM_METADATA---");
      
      const rawNotesStr = finalNotes.join('\n');
      const currentHash = getStandardizedTaskHash(finalTitle, rawNotesStr, finalDue, u.routingTarget === "COMPLETE" ? "completed" : "needsAction", true);
      existingMetadata.ai_hash = currentHash;
      
      finalNotes.push(JSON.stringify(existingMetadata));
      const newNotesStr = finalNotes.join('\n');
      
      let finalStatus = task.status;
      if (u.routingTarget === "COMPLETE") {
        finalStatus = "completed";
        finalTitle = finalTitle.replace(/^99\s+Done\s*-\s*/i, "").replace(/^99\s+Done\s*/i, "").replace(/^99\s+To\s+be\s+deleted\s*/i, "").trim();
      } else if (u.routingTarget === "STAGE_COMPLETE") {
        finalStatus = "needsAction";
        if (!finalTitle.startsWith("99 Done - ") && !finalTitle.startsWith("99 Done ")) {
           finalTitle = "99 Done - " + finalTitle.replace(/^99\s+To\s+be\s+deleted\s*/i, "").trim();
        }
      } else if (u.routingTarget === "DELETE" || u.routingTarget === "QUARANTINE_DELETE" || u.routingTarget === "QUICK_DELETE") {
        if (!finalTitle.startsWith("99 To be deleted ")) {
           finalTitle = "99 To be deleted " + finalTitle.replace(/^99\s+Done\s*-\s*/i, "").replace(/^99\s+Done\s*/i, "").trim();
        }
        if (isAssignedTask) {
           finalStatus = "completed"; // Mark completed so it doesn't show up in active tasks
        }
      }
      
      let activeTaskId = u.taskId;
      if (targetListId !== listId) {
          console.log(`Moving task "${finalTitle}" from Importer to ToDo`);
          
          const newTask = {
            title: finalTitle,
            notes: newNotesStr,
            due: finalDue,
            status: u.routingTarget === "COMPLETE" ? "completed" : "needsAction"
          };
          
          const createdTask = Tasks.Tasks.insert(newTask, targetListId);
          if (createdTask && createdTask.id) {
              activeTaskId = createdTask.id;
              
              if (isAssignedTask) {
                 console.log(`Assigned task identified. Marking original task ${u.taskId} as completed.`);
                 Tasks.Tasks.patch({ status: "completed" }, listId, u.taskId);
                 PropertiesService.getScriptProperties().deleteProperty("ai_hash_" + u.taskId);
                 PropertiesService.getScriptProperties().setProperty("ai_hash_" + createdTask.id, currentHash);
              } else {
                 console.log(`Standard task identified. Removing original task ${u.taskId}.`);
                 try {
                    Tasks.Tasks.remove(listId, u.taskId);
                 } catch (e) {
                    console.warn(`Failed to remove task ${u.taskId}, marking completed: ${e.message}`);
                    Tasks.Tasks.patch({ status: "completed" }, listId, u.taskId);
                 }
              }
          } else {
              throw new Error("Failed to insert standard task");
          }
      } else {
          if (isAssignedTask) {
             const patchObj = { status: finalStatus };
             console.log(`Patching assigned task in place: ${JSON.stringify(patchObj)}`);
             Tasks.Tasks.patch(patchObj, listId, u.taskId);
             
             if (finalStatus === "completed") {
                PropertiesService.getScriptProperties().deleteProperty("ai_hash_" + u.taskId);
             } else {
                const assignedHash = getStandardizedTaskHash(task.title, task.notes, task.due, finalStatus, true);
                PropertiesService.getScriptProperties().setProperty("ai_hash_" + u.taskId, assignedHash);
             }
          } else {
             const patchObj = {
               notes: newNotesStr,
               due: finalDue,
               title: finalTitle,
               status: finalStatus
             };
             Tasks.Tasks.patch(patchObj, listId, u.taskId);
          }
      }
      
      const isSelfMilestone = finalTitle && (/^\[milestone\]/i.test(finalTitle) || /^milestone:/i.test(finalTitle));
      if (!isSelfMilestone && u.recommendedMilestone && u.recommendedMilestone !== "None" && targetListId === todoListId) {
          try {
             if (!cachedTodoTasks) {
                cachedTodoTasks = [];
                let pageToken;
                do {
                   const response = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
                   if (response.items) {
                      cachedTodoTasks.push(...response.items);
                   }
                   pageToken = response.nextPageToken;
                } while (pageToken);
             }
             const todoTasks = cachedTodoTasks;
             
             const normalizeMilestoneTitle = (title) => {
                 if (!title) return "";
                 return title.replace(/^\[Milestone\]\s*/i, "").replace(/^Milestone:\s*/i, "").trim().toLowerCase();
             };
             const normRecommended = normalizeMilestoneTitle(u.recommendedMilestone);
             let matchedMilestone = todoTasks.find(t => normalizeMilestoneTitle(t.title) === normRecommended);
             
             if (!matchedMilestone) {
                 console.log(`Milestone '${u.recommendedMilestone}' not found. Creating it dynamically...`);
                 const newMilestone = {
                     title: u.recommendedMilestone.startsWith("[Milestone]") ? u.recommendedMilestone : `[Milestone] ${u.recommendedMilestone}`,
                     status: "needsAction"
                 };
                 matchedMilestone = Tasks.Tasks.insert(newMilestone, todoListId);
                 if (matchedMilestone && matchedMilestone.id) {
                     cachedTodoTasks.push(matchedMilestone);
                 }
             }
             
             if (matchedMilestone && matchedMilestone.id && activeTaskId !== matchedMilestone.id) {
                  Utilities.sleep(500); // Wait for API propagation of newly created tasks
                  executeWithRetry(() => Tasks.Tasks.move(targetListId, activeTaskId, { parent: matchedMilestone.id }));
                  console.log(`Natively parented task ${activeTaskId} to milestone "${matchedMilestone.title}" (${matchedMilestone.id})`);
              }
           } catch(e) {
              console.error(`Failed to natively parent task: ${e.message}`);
           }
      }
      
      Utilities.sleep(100);
    } catch (e) {
      console.error("Failed to update task: " + u.taskId, e.message);
      hasErrors = true;
    }
  });
  return !hasErrors;
}


// ============================================================================
// SECTION 5: SYSTEM CONTEXT FETCHERS
// ============================================================================

/**
 * Aggregates calendar event hours for the next 30 days to compute remaining schedule capacity.
 * 
 * @param {Date} [targetDate] Base date to start capacity check from. Defaults to now.
 * @returns {Object} Capacity hours mapped by date string key (YYYY-MM-DD).
 */
function getCalendarCapacity(targetDate) {
  const now = targetDate || new Date();
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

/**
 * Retrieves list of active calendar events scheduled for the current day.
 * 
 * @param {Date} [targetDate] Date to fetch events for. Defaults to now.
 * @returns {Object[]} Calendar event objects matching schema (title, start, end, isAllDay).
 */
function getTodayCalendarEvents(targetDate) {
  const now = targetDate || new Date();
  const yyyy = Utilities.formatDate(now, "Europe/London", "yyyy");
  const MM = Utilities.formatDate(now, "Europe/London", "MM");
  const dd = Utilities.formatDate(now, "Europe/London", "dd");

  const approxStart = new Date(`${yyyy}-${MM}-${dd}T00:00:00Z`);
  const approxEnd = new Date(`${yyyy}-${MM}-${dd}T23:59:59Z`);

  const startOffset = Utilities.formatDate(approxStart, "Europe/London", "XXX");
  const endOffset = Utilities.formatDate(approxEnd, "Europe/London", "XXX");

  const startStr = `${yyyy}-${MM}-${dd}T00:00:00${startOffset}`;
  const endStr = `${yyyy}-${MM}-${dd}T23:59:59${endOffset}`;

  const startOfDay = new Date(startStr);
  const endOfDay = new Date(endStr);
  
  let allEvents = [];
  const calendars = [CalendarApp.getDefaultCalendar()];
  
  if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.CALENDARS) {
    if (SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID) {
      try {
        const tbCal = CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID);
        if (tbCal) calendars.push(tbCal);
      } catch(e) { console.warn("Failed to load timeboxing calendar in TaskEngine"); }
    }
    if (SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID) {
      try {
        const ceCal = CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID);
        // Avoid duplicate if same as default
        if (ceCal && ceCal.getId() !== calendars[0].getId()) calendars.push(ceCal);
      } catch(e) { console.warn("Failed to load cross env calendar in TaskEngine"); }
    }
  }

  calendars.forEach(cal => {
    try {
      const events = cal.getEvents(startOfDay, endOfDay);
      events.forEach(e => {
        const title = e.getTitle();
        // Ignore AI generated timeboxes so they don't artificially reduce capacity during recalculation
        if (title.startsWith("[TS] ")) return;
        
        allEvents.push({
           title: title,
           start: Utilities.formatDate(e.getStartTime(), "Europe/London", "HH:mm"),
           end: Utilities.formatDate(e.getEndTime(), "Europe/London", "HH:mm"),
           isAllDay: e.isAllDayEvent()
        });
      });
    } catch(e) {
      console.warn("Failed to fetch events for a calendar in TaskEngine", e);
    }
  });
  
  return allEvents;
}

/**
 * Downloads personal and CE strategic goal tables from Google Drive, with script caching.
 * 
 * @returns {string} Goals data text block.
 */
function getSystemGoals() {
  const cache = CacheService.getScriptCache();
  const cachedGoals = cache.get("SYSTEM_GOALS_V2");
  if (cachedGoals) return cachedGoals;

  try {
    let goalsText = "";
    if (IS_CE_ENV) {
      const workId = SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID;
      goalsText += "=== CE GOALS ===\n";
      goalsText += DriveApp.getFileById(workId).getBlob().getDataAsString();
    } else {
      const personalId = SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID;
      goalsText += "=== PERSONAL GOALS ===\n";
      goalsText += DriveApp.getFileById(personalId).getBlob().getDataAsString();
      
      // Optionally attach CE goals to Private if available
      const workId = SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID;
      if (workId) {
        try {
          const workGoals = DriveApp.getFileById(workId).getBlob().getDataAsString();
          goalsText += "\n\n=== CE GOALS ===\n" + workGoals;
        } catch(e) {
          console.warn("Could not fetch CE goals from private context:", e.message);
        }
      }
    }
    
    cache.put("SYSTEM_GOALS_V2", goalsText.substring(0, 100000), 21600); // Cache for 6 hours
    return goalsText;
  } catch (e) {
    console.error("Failed to fetch System Goals: " + e.message);
    return "1. Financial Independence 2. Health Optimization 3. System Development";
  }
}

/**
 * Pulls Taxonomy catalog JSON content block from Google Drive, with script caching.
 * 
 * @returns {string} Taxonomy JSON text catalog.
 */
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


// ============================================================================
// SECTION 6: ONE-PAGER DOCUMENT GENERATION
// ============================================================================

/**
 * Writes or updates the priority planning report to a markdown document saved
 * in your workspace folder on Google Drive.
 * 
 * @param {string} markdownStr Markdown text compilation to write.
 * @param {boolean} isDailyPlan Scopes report title for daily execution plans vs global ones.
 * @returns {string|null} Document URL string, or null on execution error.
 */
function writeOnePager(markdownStr, isDailyPlan) {
  try {
     const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
     const folder = DriveApp.getFolderById(folderId);
     
     const suffix = IS_CE_ENV ? " (CE)" : " (Private)";
     const baseName = isDailyPlan ? "TS - Task Master > 1 Day Execution Plan" : "TS - Task Master > Global Priority Review";
     const fileName = baseName + suffix + ".md";
      let file;
      if (isDailyPlan) {
         const fileId = getExecutionPlanId();
         if (fileId) {
            try {
               file = DriveApp.getFileById(fileId);
               file.setContent(markdownStr);
            } catch (e) {
               console.warn(`Could not access 1 Day Execution Plan via ID (${fileId}): ${e.message}. Searching by name...`);
               const files = folder.getFilesByName(fileName);
               if (files.hasNext()) {
                  file = files.next();
                  file.setContent(markdownStr);
               } else {
                  file = folder.createFile(fileName, markdownStr, MimeType.PLAIN_TEXT);
               }
            }
         } else {
            console.warn("No 1 Day Execution Plan ID configured. Searching by name...");
            const files = folder.getFilesByName(fileName);
            if (files.hasNext()) {
               file = files.next();
               file.setContent(markdownStr);
            } else {
               file = folder.createFile(fileName, markdownStr, MimeType.PLAIN_TEXT);
            }
         }
      } else {
         const files = folder.getFilesByName(fileName);
         if (files.hasNext()) {
            file = files.next();
            file.setContent(markdownStr);
         } else {
            file = folder.createFile(fileName, markdownStr, MimeType.PLAIN_TEXT);
         }
      }
      return file ? file.getUrl() : null;
  } catch(e) {
     console.error("Failed to write One-Pager:", e.message);
     return null;
  }
}

/**
 * Searches for a task list named 'Triage Quarantine'. If it exists, returns its ID;
 * otherwise, creates a new task list named 'Triage Quarantine' and returns its ID.
 * 
 * @returns {string} The ID of the 'Triage Quarantine' task list.
 */
function getOrCreateTriageQuarantineListId() {
  let pageToken;
  do {
    try {
      const response = Tasks.Tasklists.list({
        maxResults: 100,
        pageToken: pageToken
      });
      const items = response.items || [];
      const match = items.find(list => list.title === "Triage Quarantine");
      if (match) {
        return match.id;
      }
      pageToken = response.nextPageToken;
    } catch (e) {
      console.error("Error listing task lists: " + e.message);
      pageToken = undefined;
    }
  } while (pageToken);

  // If not found, create it
  try {
    const newList = Tasks.Tasklists.insert({
      title: "Triage Quarantine"
    });
    console.log("Created task list 'Triage Quarantine' with ID: " + newList.id);
    return newList.id;
  } catch (e) {
    console.error("Failed to create 'Triage Quarantine' task list: " + e.message);
    throw e;
  }
}

/**
 * Searches for a task list named 'AI Review' (or '06 AI Review'). If it exists, returns its ID;
 * otherwise, creates a new task list named 'AI Review' and returns its ID.
 * 
 * @returns {string} The ID of the 'AI Review' task list.
 */
function getOrCreateAIReviewListId() {
  let pageToken;
  do {
    try {
      const response = Tasks.Tasklists.list({
        maxResults: 100,
        pageToken: pageToken
      });
      const items = response.items || [];
      const match = items.find(list => list.title === "AI Review" || list.title === "06 AI Review");
      if (match) {
        return match.id;
      }
      pageToken = response.nextPageToken;
    } catch (e) {
      console.error("Error listing task lists: " + e.message);
      pageToken = undefined;
    }
  } while (pageToken);

  // If not found, create it
  try {
    const newList = Tasks.Tasklists.insert({
      title: "AI Review"
    });
    console.log("Created task list 'AI Review' with ID: " + newList.id);
    return newList.id;
  } catch (e) {
    console.error("Failed to create 'AI Review' task list: " + e.message);
    throw e;
  }
}

// Trigger clasp deployment timezone fix

/**
 * Test function to generate and schedule the Task Master plan for tomorrow.
 * Run this manually from the Apps Script IDE to test scheduling boundaries for the next day.
 */
function testTaskEngineTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
  console.log("Generating Task Master plan for tomorrow...");
  runHourlyReview(tomorrow);
  console.log("Syncing timeboxing blocks to calendar for tomorrow...");
  if (typeof executeTimeboxing === 'function') {
    executeTimeboxing(tomorrow);
  } else {
    console.error("executeTimeboxing not found. Ensure Code_Timeboxing.js is loaded.");
  }
  console.log("Done testing tomorrow generation.");
}

/**
 * Master Daily Pipeline: Triages active tasks and generates the 1-Day Execution Plan.
 */
function runDailyReviewPipeline() {
  console.log("=======================================================");
  console.log("🚀 EXECUTING TASK MASTER DAILY REVIEW PIPELINE");
  console.log("=======================================================\n");

  console.log("1. Running Task Master Sweep & Classification...");
  runTaskMasterEngine();

  console.log("\n2. Generating 1-Day Execution Plan & Timeboxing...");
  runHourlyReview();

  console.log("\n=======================================================");
  console.log("✅ DAILY REVIEW PIPELINE COMPLETED SUCCESSFULLY!");
  console.log("=======================================================");
}


// ==========================================
// SECTION 2: TASK HARMONIZER AUDIT & BATCH ACTIONS
// ==========================================

/**
 * @file src/Code_TaskHarmonizer.js
 * @description Backend AI-powered Task Grooming, Pruning, and Harmonization Engine.
 * Replicates the /task_prune_and_harmonize Lead Operations Auditor protocol inside Google Apps Script.
 * 
 * Features:
 * - Scans active and 2099 backlog Google Tasks across task lists.
 * - Enforces strict 3-tier hierarchy: [Milestone] > Task > Sub-Task.
 * - Protects child tasks from false-duplicate flagging under shared milestones.
 * - Preserves ---SYSTEM_METADATA--- blocks in task notes untouched.
 * - Gemini 3.7 Flash structured output for Batches A, B, C, D.
 * - Safe quarantine execution (prefix '99 To be deleted ' + move out of active list).
 * 
 * @version 1.0.0
 * @last_modified 2026-08-19
 */

/**
 * Main RPC endpoint called from WebApp_Dashboard.html to run the task audit.
 * 
 * @param {Object} options - Scope options: { scope: 'active'|'backlog'|'full', targetListId: string|null, engine: 'rule_based'|'gemini' }
 * @returns {Object} { success: boolean, summary: Object, batches: Object, error?: string }
 */
function runTaskHarmonizeAudit(options) {
  try {
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (e) {}
    }
    options = options || {};
    const scope = options.scope || 'full'; // 'active', 'backlog', 'full'
    const targetListId = options.targetListId || null;
    const engine = options.engine || 'rule_based'; // 'rule_based' (instant/No AI) or 'gemini'

    console.log(`[TaskHarmonizer] Starting Task Audit. Scope: ${scope}, Engine: ${engine}, TargetList: ${targetListId || 'ALL'}`);

    // 1. Fetch Task Lists and Tasks (in rule_based mode, include quarantine/deleted lists to surface 99s and quarantined items)
    const includeQuarantine = (engine === 'rule_based');
    const taskData = fetchTasksForAudit(scope, targetListId, includeQuarantine);
    if (!taskData.tasks || taskData.tasks.length === 0) {
      return {
        success: true,
        summary: {
          totalTasksAnalyzed: 0,
          batchACount: 0,
          batchBCount: 0,
          batchCCount: 0,
          batchDCount: 0,
          executiveSummary: "No tasks found matching the selected scope."
        },
        batches: {
          batchA_Duplicates: [],
          batchB_Zombies: [],
          batchC_Taxonomy: [],
          batchD_Metadata: []
        }
      };
    }

    console.log(`[TaskHarmonizer] Ingested ${taskData.tasks.length} tasks for analysis (${engine}).`);

    // 2. Perform Audit: Deterministic (No AI) or Gemini 3.7 Flash
    let auditResult;
    if (engine === 'gemini') {
      auditResult = performGeminiTaskAudit(taskData.tasks);
    } else {
      auditResult = performDeterministicTaskScan(taskData.tasks);
    }

    if (auditResult.error) {
      console.error(`[TaskHarmonizer] Audit failed: ${auditResult.error}`);
      return { success: false, error: auditResult.error };
    }

    return {
      success: true,
      summary: auditResult.summary || {},
      batches: {
        batchA_Duplicates: auditResult.batchA_Duplicates || [],
        batchB_Zombies: auditResult.batchB_Zombies || [],
        batchC_Taxonomy: auditResult.batchC_Taxonomy || [],
        batchD_Metadata: auditResult.batchD_Metadata || []
      }
    };
  } catch (err) {
    console.error(`[TaskHarmonizer] Critical error in runTaskHarmonizeAudit: ${err.message}`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches tasks from Google Tasks API filtered by scope.
 * 
 * @param {string} scope - 'active', 'backlog', 'full'
 * @param {string|null} targetListId - Optional specific list ID
 * @param {boolean} includeQuarantine - If true, scans quarantine and deletion lists
 * @returns {Object} { taskLists: Array, tasks: Array }
 */
function fetchTasksForAudit(scope, targetListId, includeQuarantine) {
  const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
  const rawLists = listsResponse.items || [];

  const taskLists = [];
  const allTasks = [];
  const now = new Date();
  const twentyEightDaysAhead = new Date(now.getTime() + (28 * 24 * 60 * 60 * 1000));

  for (const lst of rawLists) {
    const listTitleLower = (lst.title || '').toLowerCase();
    // Skip archive lists appropriately
    if (!includeQuarantine) {
      if (listTitleLower.includes('quarantine') || listTitleLower.includes('deleted') || listTitleLower.includes('completed')) {
        continue;
      }
    } else {
      // In includeQuarantine mode, skip completed archive to avoid thousands of archived entries
      if (listTitleLower.includes('completed')) {
        continue;
      }
    }
    if (targetListId && lst.id !== targetListId) {
      continue;
    }

    taskLists.push({ id: lst.id, title: lst.title });

    let pageToken = null;
    do {
      const response = executeWithRetry(() => Tasks.Tasks.list(lst.id, {
        showCompleted: false,
        showHidden: false,
        showAssigned: true,
        maxResults: 100,
        pageToken: pageToken
      }));

      const items = response.items || [];
      for (const item of items) {
        if (!item.title || item.title.trim() === '') continue;

        let isBacklog = false;
        let isOverdue = false;
        let dueMillis = null;

        if (item.due) {
          const dueDate = new Date(item.due);
          dueMillis = dueDate.getTime();
          if (dueDate.getFullYear() >= 2090) {
            isBacklog = true;
          } else if (dueDate.getTime() < now.getTime() - (24 * 60 * 60 * 1000)) {
            isOverdue = true;
          }
        }

        // Scope filtering logic:
        // 'active': Not a 2099 backlog task, and either due within 28d or no due date / overdue
        // 'backlog': 2099 backlog tasks or overdue > 30 days
        // 'full': all open tasks
        let include = true;
        if (scope === 'active') {
          if (isBacklog) include = false;
          else if (dueMillis && dueMillis > twentyEightDaysAhead.getTime()) include = false;
        } else if (scope === 'backlog') {
          if (!isBacklog && (!isOverdue || (now.getTime() - dueMillis) < (30 * 24 * 60 * 60 * 1000))) {
            include = false;
          }
        }

        if (include) {
          allTasks.push({
            id: item.id,
            listId: lst.id,
            listTitle: lst.title,
            title: item.title,
            notes: item.notes || '',
            due: item.due || null,
            status: item.status || 'needsAction',
            updated: item.updated || null,
            parent: item.parent || null
          });
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  return { taskLists: taskLists, tasks: allTasks };
}

/**
 * Deterministic Rule-Based Task Scan (No AI / Zero Latency).
 * Identifies:
 * 1. Staged completions ('99 Done - ') -> MARK_COMPLETED
 * 2. Flagged deletions ('99 To be deleted ') -> MOVE_TO_QUARANTINE
 * 3. Parked Quarantine & Deletion list items -> MOVE_TO_QUARANTINE
 * 4. Exact duplicate active titles -> MOVE_TO_QUARANTINE (Batch A)
 * 5. Extreme overdue >60d zombies -> MOVE_TO_QUARANTINE (Batch B)
 * 6. Milestone prefix issues -> UPDATE_TASK (Batch C)
 * 7. Corrupted note headers -> UPDATE_TASK (Batch D)
 * 
 * @param {Array} tasks - Ingested tasks
 * @returns {Object} { summary, batchA_Duplicates, batchB_Zombies, batchC_Taxonomy, batchD_Metadata }
 */
function performDeterministicTaskScan(tasks) {
  const batchA_Duplicates = [];
  const batchB_Zombies = [];
  const batchC_Taxonomy = [];
  const batchD_Metadata = [];

  const now = new Date();
  const nowMillis = now.getTime();
  const seenTitles = new Map(); // normalized title -> { id, title, listTitle }

  for (const t of tasks) {
    const rawTitle = t.title || '';
    const cleanTitle = rawTitle.trim();
    const listTitleLower = (t.listTitle || '').toLowerCase();
    const isQuarantineOrDeletedList = listTitleLower.includes('quarantine') || listTitleLower.includes('deleted');

    let processedForB = false;

    // 1. Check for '99 Done' / '99 Done - ' (Staged Completion)
    if (/^99\s+Done\s*-?\s*/i.test(cleanTitle) || (listTitleLower.includes('ai review') && cleanTitle.toLowerCase().startsWith('99 done'))) {
      const proposedTitle = cleanTitle.replace(/^99\s+Done\s*-?\s*/i, '').trim();
      batchB_Zombies.push({
        taskId: t.id,
        listId: t.listId,
        listTitle: t.listTitle,
        originalTitle: rawTitle,
        action: 'MARK_COMPLETED',
        proposedTitle: proposedTitle,
        reasoning: `Staged completion ('99 Done - '). Approving will strip the prefix and mark task completed to log into Completed Tasks Log for Vantage reflection.`
      });
      processedForB = true;
    }
    // 2. Check for '99 To be deleted' (Flagged Deletion)
    else if (/^99\s+To\s+be\s+deleted\s*/i.test(cleanTitle)) {
      const proposedTitle = cleanTitle.replace(/^99\s+To\s+be\s+deleted\s*/i, '').trim();
      batchB_Zombies.push({
        taskId: t.id,
        listId: t.listId,
        listTitle: t.listTitle,
        originalTitle: rawTitle,
        action: 'DELETE_TASK',
        proposedTitle: proposedTitle,
        reasoning: `Flagged for deletion ('99 To be deleted'). Approving will permanently delete and purge this task.`
      });
      processedForB = true;
    }
    // 3. Check if residing in Quarantine or To be Deleted lists
    else if (isQuarantineOrDeletedList) {
      batchB_Zombies.push({
        taskId: t.id,
        listId: t.listId,
        listTitle: t.listTitle,
        originalTitle: rawTitle,
        action: 'DELETE_TASK',
        proposedTitle: cleanTitle,
        reasoning: `Currently parked in '${t.listTitle}'. Approving will permanently purge this task.`
      });
      processedForB = true;
    }
    // 4. Extreme overdue >60d zombies (in active lists)
    else if (t.due) {
      const dueDate = new Date(t.due);
      if (dueDate.getFullYear() < 2090) {
        const daysOverdue = Math.floor((nowMillis - dueDate.getTime()) / (24 * 60 * 60 * 1000));
        if (daysOverdue > 60) {
          batchB_Zombies.push({
            taskId: t.id,
            listId: t.listId,
            listTitle: t.listTitle,
            originalTitle: rawTitle,
            daysOverdue: daysOverdue,
            action: 'MOVE_TO_QUARANTINE',
            proposedTitle: cleanTitle,
            reasoning: `Task is ${daysOverdue} days overdue with no completion activity. Candidate for pruning.`
          });
          processedForB = true;
        }
      }
    }

    // 5. Duplicate Detection (Batch A) - only for active non-quarantine tasks
    if (!isQuarantineOrDeletedList && !processedForB) {
      const normTitle = cleanTitle.toLowerCase();
      // Skip milestones and common short titles from duplicate matching
      if (!normTitle.startsWith('[milestone]') && normTitle.length > 5) {
        if (seenTitles.has(normTitle)) {
          const survivor = seenTitles.get(normTitle);
          batchA_Duplicates.push({
            taskId: t.id,
            listId: t.listId,
            listTitle: t.listTitle,
            originalTitle: rawTitle,
            survivorTaskId: survivor.id,
            survivorTitle: survivor.title,
            action: 'MOVE_TO_QUARANTINE',
            reasoning: `Exact duplicate title match with '${survivor.title}' in '${survivor.listTitle}'.`
          });
        } else {
          seenTitles.set(normTitle, { id: t.id, title: rawTitle, listTitle: t.listTitle });
        }
      }
    }

    // 6. Taxonomy / Milestone Standardization (Batch C)
    if (!processedForB) {
      if (/^milestone\s*:\s*/i.test(cleanTitle) && !cleanTitle.startsWith('[Milestone]')) {
        const fixedTitle = '[Milestone] ' + cleanTitle.replace(/^milestone\s*:\s*/i, '').trim();
        batchC_Taxonomy.push({
          taskId: t.id,
          listId: t.listId,
          listTitle: t.listTitle,
          originalTitle: rawTitle,
          action: 'UPDATE_TASK',
          proposedTitle: fixedTitle,
          reasoning: `Standardized epic container prefix to '[Milestone]'.`
        });
      }
    }

    // 7. Metadata / Note Standardization (Batch D)
    if (!processedForB && !isQuarantineOrDeletedList) {
      const notes = t.notes || '';
      // Check if notes lack standard Task Master structure
      const hasDeadlineHeader = notes.includes('[DEADLINE:') || notes.includes('[DURATION:');
      if (notes.trim().length > 0 && !hasDeadlineHeader && !notes.includes('---SYSTEM_METADATA---')) {
        const formattedDeadline = t.due ? Utilities.formatDate(new Date(t.due), "Europe/London", "yyyy-MM-dd") : "None";
        const canonicalNotes = `${notes.trim()}\n\n[DEADLINE: ${formattedDeadline}] | [DURATION: 15m] | [GOAL: BAU]\n\nSYS: Standardized canonical note structure via instant hygiene scan.\nMilestone: [Milestone] General Admin & Operational Hygiene\nDA:`;
        batchD_Metadata.push({
          taskId: t.id,
          listId: t.listId,
          listTitle: t.listTitle,
          originalTitle: rawTitle,
          action: 'UPDATE_TASK',
          proposedNotes: canonicalNotes,
          reasoning: `Reconstructed canonical Task Master note header and metadata block.`
        });
      }

      // 8. Undated Active Task Flagging (Batch D)
      if (!t.due && !listTitleLower.includes('recurring') && !listTitleLower.includes('ai review')) {
        batchD_Metadata.push({
          taskId: t.id,
          listId: t.listId,
          listTitle: t.listTitle,
          originalTitle: rawTitle,
          action: 'FLAG_UNDATED',
          proposedDue: Utilities.formatDate(new Date(), "Europe/London", "yyyy-MM-dd"),
          reasoning: `Active task in '${t.listTitle}' has no scheduled due date. Requires scheduling or assignment to 2099 Backlog.`
        });
      }
    }
  }

  const executiveSummary = `### ⚡ Instant Rule-Based Scan Summary (No AI)

* **Ingested Tasks:** Analyzed **${tasks.length} tasks** across active & quarantine task lists in $<1$ second.
* **Flagged / Quarantined Items (Batch B):** **${batchB_Zombies.length} items** detected (including staged completions \`99 Done\`, deletion flags \`99 To be deleted\`, parked quarantine tasks, and $>60$d overdue zombies).
* **Duplicate Active Tasks (Batch A):** **${batchA_Duplicates.length} duplicates** detected.
* **Taxonomy & Metadata Items (Batches C & D):** **${batchC_Taxonomy.length} taxonomy** and **${batchD_Metadata.length} note format** standardizations identified.`;

  return {
    summary: {
      totalTasksAnalyzed: tasks.length,
      batchACount: batchA_Duplicates.length,
      batchBCount: batchB_Zombies.length,
      batchCCount: batchC_Taxonomy.length,
      batchDCount: batchD_Metadata.length,
      executiveSummary: executiveSummary
    },
    batchA_Duplicates: batchA_Duplicates,
    batchB_Zombies: batchB_Zombies,
    batchC_Taxonomy: batchC_Taxonomy,
    batchD_Metadata: batchD_Metadata
  };
}

/**
 * Invokes Gemini 3.7 Flash with the Lead Operations Auditor prompt & structured schema.
 * 
 * @param {Array} tasks - Array of sanitized task objects
 * @returns {Object} Parsed JSON audit findings
 */
function performGeminiTaskAudit(tasks) {
  const modelName = (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.SECRETS && SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL)
    ? SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL
    : "gemini-3.7-flash";

  const systemInstruction = `You are the Lead Task Systems Architect & Operations Auditor for "The System" personal & professional executive framework.
Your mission is to perform a rigorous multi-dimensional audit of Google Tasks and synthesize four precise operational batches:
1. Batch A: Semantic Deduplication & Merging (Identical tasks, duplicate recurring schedules, redundant checklist items across lists).
2. Batch B: Zombie & Stale Task Pruning (Tasks overdue >30d, dead 2099 backlog tasks with completed milestones, unexecuted Q4 tasks >60d).
3. Batch C: Taxonomy & Hierarchy Realignment (Missing '[Milestone]' prefixes on epic containers, missing L3 taxonomy codes, orphaned sub-tasks floating as root tasks).
4. Batch D: Metadata & Note Format Standardization (Fixing corrupted SYS/Milestone/DA tags, due date mismatches, standardizing canonical note structure).

=== HIERARCHY & MILESTONE INDEPENDENCE RULES (CRITICAL) ===
- Strict 3-tier hierarchy: [Milestone] (Epic Container) > Task (Native child Google Task) > Sub-Task (Markdown checklist item '- [ ]' in notes).
- NEVER treat child tasks under a Milestone as duplicates of the Milestone itself!
- NEVER treat separate child tasks within a milestone as duplicates of each other simply because they share project scope, goal ID, or timeline (e.g., 'Plan 2027 Wedding Logistics' vs 'Review Makeup Artist Agreement' vs 'Book Venue' are distinct deliverables, NOT duplicates).
- True Duplicates Only in Batch A: Flag a task as duplicate ONLY if it has identical deliverables, redundant copy-pasted action items, or duplicate active recurring schedules.

=== METADATA & NOTE PRESERVATION RULES ===
- Tasks may contain a hidden system block: '---SYSTEM_METADATA---'. You MUST preserve this block and all text below it untouched in all proposed notes.
- Canonical Note Structure:
  <Original Description>

  [DEADLINE: YYYY-MM-DD] | [DURATION: X] | [GOAL: X]

  SYS: <System reasoning>
  Milestone: [Milestone] <Parent Milestone or [Milestone] General Admin & Operational Hygiene (NEVER output 'None')>
  DA: <Explicit user instruction>

=== ACTION TYPES ===
- 'MOVE_TO_QUARANTINE': For redundant duplicates (Batch A) or zombie tasks to be pruned (Batch B). The executor will prefix with '99 To be deleted ' and move them to 'Triage Quarantine'.
- 'UPDATE_TASK': For updating title (e.g. adding '[Milestone]'), correcting notes, or re-aligning due dates.
- 'MARK_COMPLETED': For tasks already confirmed as fulfilled or dead completed milestones.

Analyze the provided tasks thoroughly and return the structured JSON output adhering strictly to the response schema.`;

  // Format task payload concisely for prompt efficiency
  const taskPayload = tasks.map((t, idx) => {
    return {
      index: idx + 1,
      id: t.id,
      listId: t.listId,
      listTitle: t.listTitle,
      title: t.title,
      notes: t.notes ? t.notes.substring(0, 1000) : "",
      due: t.due,
      updated: t.updated
    };
  });

  const promptText = `Perform a full task ecosystem grooming audit on the following ${taskPayload.length} Google Tasks:\n\n` + JSON.stringify(taskPayload, null, 2);

  const schema = {
    type: "OBJECT",
    properties: {
      summary: {
        type: "OBJECT",
        properties: {
          totalTasksAnalyzed: { type: "INTEGER" },
          batchACount: { type: "INTEGER" },
          batchBCount: { type: "INTEGER" },
          batchCCount: { type: "INTEGER" },
          batchDCount: { type: "INTEGER" },
          executiveSummary: { type: "STRING" }
        },
        required: ["totalTasksAnalyzed", "batchACount", "batchBCount", "batchCCount", "batchDCount", "executiveSummary"]
      },
      batchA_Duplicates: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            survivorTaskId: { type: "STRING" },
            survivorTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["MOVE_TO_QUARANTINE", "UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "reasoning"]
        }
      },
      batchB_Zombies: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            daysOverdue: { type: "INTEGER" },
            action: { type: "STRING", enum: ["MOVE_TO_QUARANTINE", "MARK_COMPLETED", "UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "reasoning"]
        }
      },
      batchC_Taxonomy: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedMilestone: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "proposedTitle", "reasoning"]
        }
      },
      batchD_Metadata: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "proposedNotes", "reasoning"]
        }
      }
    },
    required: ["summary", "batchA_Duplicates", "batchB_Zombies", "batchC_Taxonomy", "batchD_Metadata"]
  };

  const aiResult = callGemini(promptText, modelName, systemInstruction, schema, false);
  return aiResult;
}

/**
 * RPC endpoint to execute a chunk of approved task actions.
 * 
 * @param {Array} actionsChunk - Array of action items approved by user
 * @returns {Object} { success: boolean, processedCount: number, errors: Array }
 */
function executeTaskHarmonizeBatch(actionsChunk) {
  if (!Array.isArray(actionsChunk) || actionsChunk.length === 0) {
    return { success: true, processedCount: 0, errors: [] };
  }

  console.log(`[TaskHarmonizer] Executing batch of ${actionsChunk.length} approved actions...`);

  let quarantineListId = null;
  const errors = [];
  const logs = [];
  let processedCount = 0;

  for (const actionItem of actionsChunk) {
    try {
      const taskId = actionItem.taskId;
      const listId = actionItem.listId;
      const action = actionItem.action || 'UPDATE_TASK';

      if (!taskId || !listId) {
        errors.push({ taskId: taskId || 'unknown', error: "Missing taskId or listId" });
        continue;
      }

      // Mandatory pacing to avoid Google Tasks API burst rate limits (5 req/sec)
      Utilities.sleep(200);

      if (action === 'DELETE_TASK') {
        // Direct remove without redundant GET to preserve quota
        executeWithRetry(() => Tasks.Tasks.remove(listId, taskId));
        processedCount++;
        logs.push({ type: 'delete', title: actionItem.originalTitle || taskId, list: actionItem.listTitle });
        console.log(`[TaskHarmonizer] Permanently deleted task '${actionItem.originalTitle}' from list '${actionItem.listTitle}'.`);
        continue;
      }

      // For non-delete actions, fetch current task
      let currentTask = null;
      try {
        currentTask = executeWithRetry(() => Tasks.Tasks.get(listId, taskId));
      } catch (getErr) {
        errors.push({ taskId: taskId, title: actionItem.originalTitle, error: `Task not found: ${getErr.message}` });
        continue;
      }

      if (action === 'MOVE_TO_QUARANTINE') {
        if (!quarantineListId) {
          quarantineListId = getOrCreateQuarantineListId();
        }

        const rawTitle = actionItem.proposedTitle || currentTask.title || 'Untitled Task';
        const cleanTitle = rawTitle.replace(/^99\s+To\s+be\s+deleted\s+/i, '').trim();
        const quarantineTitle = `99 To be deleted ${cleanTitle}`;

        if (listId === quarantineListId) {
          // If already in quarantine list, purge it
          executeWithRetry(() => Tasks.Tasks.remove(listId, taskId));
          logs.push({ type: 'delete', title: cleanTitle, list: 'Quarantine' });
          console.log(`[TaskHarmonizer] Purged task '${cleanTitle}' from Quarantine list.`);
        } else {
          const newTaskBody = {
            title: quarantineTitle,
            notes: currentTask.notes || '',
            due: currentTask.due || null
          };

          executeWithRetry(() => Tasks.Tasks.insert(newTaskBody, quarantineListId));
          Utilities.sleep(150);
          executeWithRetry(() => Tasks.Tasks.remove(listId, taskId));
          logs.push({ type: 'quarantine', title: cleanTitle, list: actionItem.listTitle });
          console.log(`[TaskHarmonizer] Moved task '${cleanTitle}' to Quarantine.`);
        }

        processedCount++;

      } else if (action === 'MARK_COMPLETED') {
        const titleToSet = (actionItem.proposedTitle && actionItem.proposedTitle.trim() !== '') 
          ? actionItem.proposedTitle.trim() 
          : currentTask.title;

        const completePayload = {
          id: taskId,
          title: titleToSet,
          status: 'completed',
          notes: currentTask.notes || ''
        };

        try {
          executeWithRetry(() => Tasks.Tasks.update(completePayload, listId, taskId));
        } catch (updateErr) {
          executeWithRetry(() => Tasks.Tasks.patch({ status: 'completed', title: titleToSet }, listId, taskId));
        }

        processedCount++;
        logs.push({ type: 'complete', title: titleToSet, list: actionItem.listTitle });
        console.log(`[TaskHarmonizer] Marked task '${titleToSet}' as Completed.`);

      } else if (action === 'UPDATE_TASK') {
        let hasChanges = false;
        let newTitle = currentTask.title;
        let newNotes = currentTask.notes || '';
        let newDue = currentTask.due;

        if (actionItem.proposedTitle && actionItem.proposedTitle.trim() !== '') {
          newTitle = actionItem.proposedTitle.trim();
          hasChanges = true;
        }

        if (actionItem.proposedDue !== undefined) {
          newDue = actionItem.proposedDue;
          hasChanges = true;
        }

        if (actionItem.proposedNotes !== undefined && actionItem.proposedNotes !== null) {
          let updatedNotes = actionItem.proposedNotes;
          if (newNotes.includes('---SYSTEM_METADATA---')) {
            const metaParts = newNotes.split('---SYSTEM_METADATA---');
            const metaBlock = `\n\n---SYSTEM_METADATA---${metaParts[1]}`;
            if (!updatedNotes.includes('---SYSTEM_METADATA---')) {
              updatedNotes = updatedNotes.trim() + metaBlock;
            }
          }
          newNotes = updatedNotes;
          hasChanges = true;
        }

        if (hasChanges) {
          const updatePayload = {
            id: taskId,
            title: newTitle,
            notes: newNotes,
            status: currentTask.status || 'needsAction'
          };
          if (newDue) updatePayload.due = newDue;

          try {
            executeWithRetry(() => Tasks.Tasks.update(updatePayload, listId, taskId));
          } catch (updateErr) {
            executeWithRetry(() => Tasks.Tasks.patch({ title: newTitle, notes: newNotes }, listId, taskId));
          }

          processedCount++;
          logs.push({ type: 'update', title: newTitle, list: actionItem.listTitle });
          console.log(`[TaskHarmonizer] Updated task '${newTitle}'.`);
        }
      }
    } catch (taskErr) {
      console.error(`[TaskHarmonizer] Error processing action for task ${actionItem.taskId}: ${taskErr.message}`);
      errors.push({ taskId: actionItem.taskId, title: actionItem.originalTitle, error: taskErr.message });
    }
  }

  return {
    success: errors.length === 0,
    processedCount: processedCount,
    errors: errors,
    logs: logs
  };
}

/**
 * Finds or creates the 'Triage Quarantine' list.
 * 
 * @returns {string} Tasklist ID
 */
function getOrCreateQuarantineListId() {
  const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
  const lists = listsResponse.items || [];

  for (const lst of lists) {
    const t = (lst.title || '').toLowerCase();
    if (t === 'triage quarantine' || t === 'to be deleted') {
      return lst.id;
    }
  }

  // Create new list if not found
  console.log("[TaskHarmonizer] Creating new 'Triage Quarantine' list...");
  const newList = executeWithRetry(() => Tasks.Tasklists.insert({ title: 'Triage Quarantine' }));
  return newList.id;
}

/**
 * Helper to fetch all available task list names and IDs for UI selector.
 * 
 * @returns {Array} List of { id, title }
 */
function getHarmonizeTaskLists() {
  try {
    const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
    const lists = listsResponse.items || [];
    return lists.map(l => ({ id: l.id, title: l.title }));
  } catch (e) {
    console.error(`[TaskHarmonizer] Failed to list tasklists: ${e.message}`);
    return [];
  }
}

