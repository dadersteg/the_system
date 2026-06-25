/**
 * @file src/Code_Timeboxing.js
 * @description Automatically syncs the Top 3 and Frog tasks from the 1-Day Execution Plan to Google Calendar.
 *
 * @version 1.0.1
 * @last_modified 2026-06-25
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added JSDoc docstrings, type checking, and null/undefined resilience.
 * - 1.0.0: Initial implementation.
 */

/**
 * Triggers the timeboxing synchronization process. Reads the 1-Day Execution Plan,
 * parses the top tasks, verifies their active status, and schedules them in Google Calendar.
 *
 * @returns {void}
 */
function executeTimeboxing() {
  console.log("Starting Timeboxing sync...");
  const fileId = getExecutionPlanId();
  if (!fileId) {
    console.error("1 Day Execution Plan File ID not found.");
    return;
  }
  
  const file = DriveApp.getFileById(fileId);
  const markdown = file.getBlob().getDataAsString();
  const tasksToSchedule = parseTasksForTimeboxing(markdown);
  
  if (tasksToSchedule.length === 0) {
    console.log("No tasks found to timebox.");
    return;
  }
  
  const verifiedTasks = verifyTasksAreStillActive(tasksToSchedule);
  
  console.log(`Found ${verifiedTasks.length} valid tasks to schedule after verification.`);
  if (verifiedTasks.length > 0) {
    scheduleTasksToCalendar(verifiedTasks);
  }
}

/**
 * Verifies that the parsed tasks are still active and not completed or moved out of today's scope.
 *
 * @param {Array<Object>} parsedTasks - Array of task objects parsed from the execution plan.
 * @returns {Array<Object>} An array containing only the verified active tasks.
 */
function verifyTasksAreStillActive(parsedTasks) {
  if (!parsedTasks || !Array.isArray(parsedTasks)) {
    console.error("verifyTasksAreStillActive: parsedTasks is null or not an array.");
    return [];
  }

  const activeTasksForToday = new Map();
  const listsToFetch = [
    SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID, 
    SYSTEM_CONFIG.TASKS.TODO_LIST_ID, 
    SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID
  ];
  
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

  listsToFetch.forEach(listId => {
    let pageToken;
    do {
      try {
        const response = Tasks.Tasks.list(listId, { showCompleted: false, showHidden: false, showAssigned: true, maxResults: 100, pageToken: pageToken });
        if (response.items) {
           response.items.forEach(t => {
               if (t.status !== 'completed' && t.title) {
                  let isDueTodayOrBefore = true;
                  if (t.due) {
                     const dueDate = new Date(t.due).getTime();
                     if (dueDate > endOfToday) {
                        isDueTodayOrBefore = false;
                     }
                  }
                  
                  if (isDueTodayOrBefore) {
                     activeTasksForToday.set(t.id, t.title.trim());
                  }
               }
           });
        }
        pageToken = response.nextPageToken;
      } catch (e) {
        pageToken = undefined;
      }
    } while (pageToken);
  });
  
  const verifiedTasks = [];
  for (const task of parsedTasks) {
     if (task.id && activeTasksForToday.has(task.id)) {
        task.title = activeTasksForToday.get(task.id); // Use the actual Task title, not the AI generated one
        verifiedTasks.push(task);
     } else if (!task.id) {
        // Fallback to title matching if ID is missing
        let found = false;
        for (const [id, title] of activeTasksForToday.entries()) {
           if (title.toLowerCase() === task.title.toLowerCase()) {
              verifiedTasks.push(task);
              found = true;
              break;
           }
        }
        if (!found) console.warn(`Task "${task.title}" is completed, missing ID, or moved. Skipping timebox.`);
     } else {
        console.warn(`Task ID "${task.id}" (${task.title}) is completed or moved to a future date. Skipping timebox.`);
     }
  }
  
  return verifiedTasks;
}

/**
 * Parses a markdown string to extract tasks intended for timeboxing, looking within specific sections.
 *
 * @param {string} markdown - The raw markdown content of the execution plan.
 * @returns {Array<Object>} An array of task objects with id, title, startTime, endTime, and rawLine properties.
 */
function parseTasksForTimeboxing(markdown) {
  if (typeof markdown !== 'string' || !markdown) {
    console.error("parseTasksForTimeboxing: markdown is null or not a string.");
    return [];
  }

  const lines = markdown.split('\n');
  const tasks = [];
  let inTargetSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const upperLine = line.toUpperCase();
    if (upperLine.includes("EAT THE FROG") || upperLine.includes("TODAY'S TOP 3") || upperLine.includes("ROUTINES") || upperLine.includes("THE REST OF TODAY")) {
      inTargetSection = true;
      continue;
    }
    
    if (upperLine.includes("THIS WEEK") || upperLine.includes("THIS MONTH") || upperLine.includes("BOTTLENECKS") || upperLine.includes("QUARANTINE")) {
      inTargetSection = false;
    }
    
    if (inTargetSection && line.startsWith("- [ ]")) {
      const regex = /- \[ \]\s*(?:\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*)?(?:(?:🐸|\\ud83d\\udc38)\s*)?(?:\[THE FROG\]\s*)?\[Q[1-4]\]\s*(.*?)(?:\s*\{ID:\s*(.*?)\})?(?:\s*\((.*?)\))?$/i;
      const match = line.match(regex);
      
      if (match) {
        const startTime = match[1];
        const endTime = match[2];
        let title = match[3] ? match[3].trim() : "";
        const id = match[4] ? match[4].trim() : null;
        
        // Remove markdown artifacts like trailing hyphens if the AI appended notes
        if (title.endsWith(" -")) title = title.slice(0, -2).trim();
        
        if (title && !tasks.find(t => (t.id && t.id === id) || (!t.id && t.title === title))) {
           tasks.push({
              id: id,
              title: title,
              startTime: startTime,
              endTime: endTime,
              rawLine: line
           });
        }
      }
    }
  }
  return tasks;
}

/**
 * Schedules the verified tasks into the default Google Calendar.
 * Clears existing unstarted timebox events for today before scheduling to prevent duplicates.
 *
 * @param {Array<Object>} tasks - Array of verified task objects to schedule.
 * @returns {void}
 */
function scheduleTasksToCalendar(tasks) {
  if (!tasks || !Array.isArray(tasks)) {
    console.error("scheduleTasksToCalendar: tasks is null or not an array.");
    return;
  }

  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const existingEvents = calendar.getEvents(startOfDay, endOfDay);
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      // Only delete future blocks. Keep blocks that have already started as a historical diary record.
      if (e.getStartTime() > now) {
         e.deleteEvent();
      }
    }
  });
  
  for (const task of tasks) {
    if (task.startTime && task.endTime) {
      const startParts = task.startTime.split(':');
      const endParts = task.endTime.split(':');
      
      if (startParts.length === 2 && endParts.length === 2) {
        let startH = parseInt(startParts[0], 10);
        const startM = parseInt(startParts[1], 10);
        let endH = parseInt(endParts[0], 10);
        const endM = parseInt(endParts[1], 10);
        
        // Auto-correct 12-hour format mistakes and midnight wraparounds
        if (startH >= 1 && startH <= 6) startH += 12;
        if (endH >= 1 && endH <= 6) endH += 12;
        
        if (endH < startH || (endH === startH && endM < startM)) {
           endH += 12;
        }
        
        const proposedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0);
        const proposedEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0);
        
        if (proposedEnd > now) {
           // --- COLLISION DETECTION ---
           let hasCollision = false;
           const response = Calendar.Events.list('primary', {
             timeMin: proposedStart.toISOString(),
             timeMax: proposedEnd.toISOString(),
             singleEvents: true,
             maxResults: 50
           });
           const overlappingEvents = response.items || [];
           
           for (const oe of overlappingEvents) {
              if (oe.start.date) continue; // All day event
              if (oe.summary && oe.summary.startsWith("[TS] ")) continue;
              if (oe.transparency === 'transparent') continue; // Free event
              
              const oeStart = new Date(oe.start.dateTime).getTime();
              const oeEnd = new Date(oe.end.dateTime).getTime();
              
              // Only trigger collision if the overlap is substantial (e.g. > 1 minute)
              // to avoid edge cases where events end exactly at the start minute of the next.
              if (oeEnd <= proposedStart.getTime() + 60000 || 
                  oeStart >= proposedEnd.getTime() - 60000) {
                 continue;
              }
              
              if (task.rawLine && task.rawLine.toLowerCase().includes(oe.summary.toLowerCase())) {
                 console.log(`Collision bypassed: AI explicitly scheduled "${task.title}" during "${oe.summary}".`);
                 continue;
              }
              
              console.log(`Collision detected: AI timebox "${task.title}" overlaps with real meeting "${oe.summary}". Skipping.`);
              hasCollision = true;
              break;
           }
           
           if (!hasCollision) {
               console.log(`Scheduling ${task.title} at ${task.startTime}-${task.endTime} as requested by AI.`);
               const newEvent = calendar.createEvent("[TS] " + task.title, proposedStart, proposedEnd);
               newEvent.setVisibility(CalendarApp.Visibility.PRIVATE);
               newEvent.setColor(CalendarApp.EventColor.ORANGE);
           }
        } else {
           console.log(`Skipping ${task.title} because ${task.startTime} is in the past.`);
        }
      } else {
        console.warn(`Invalid AI time block format for ${task.title}: ${task.startTime}-${task.endTime}`);
      }
    } else {
      console.warn(`No AI time block provided for ${task.title}. Skipping.`);
    }
  }
}
