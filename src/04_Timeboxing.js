/**
 * @file 04_Timeboxing.js
 * @description Calendar Timeboxing Engine, Blackout Schedules, Multi-Calendar Collision Avoidance & Event Provisioning.
 */

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
 * @param {Date} [targetDate] - The date to schedule tasks for.
 * @param {string} [markdownContent] - Optional raw markdown content of the execution plan.
 * @returns {void}
 */
function executeTimeboxing(targetDate, markdownContent) {
  const now = (targetDate instanceof Date && !isNaN(targetDate.getTime())) ? targetDate : new Date();
  console.log("Starting Timeboxing sync...");
  let markdown = (typeof markdownContent === 'string') ? markdownContent : null;

  // Primary source: the plan the local engine (CE work laptop / Claude) published to the master sheet, used
  // only while its PLANNING heartbeat is fresh. Falls through to the Drive Doc (the GAS-generated backup) when
  // stale or absent, so Private and laptop-down cases behave exactly as before.
  if (!markdown && typeof isLocalPlanFresh === "function" && isLocalPlanFresh()) {
    try {
      const ss = getMasterSpreadsheet();
      const planSheet = ss.getSheetByName("5 Import - 1 Day Plan");
      if (planSheet) {
        const cell = planSheet.getRange("A1").getValue();
        if (cell && String(cell).trim()) {
          markdown = String(cell);
          console.log("Timeboxing from the published local plan ('5 Import - 1 Day Plan'!A1), " + markdown.length + " chars.");
        }
      }
    } catch (e) {
      console.warn("Could not read the published local plan: " + e.message + ". Falling back to the Drive Doc.");
    }
  }

  if (!markdown) {
    const fileId = getExecutionPlanId();
    if (fileId) {
      try {
        const file = DriveApp.getFileById(fileId);
        markdown = file.getBlob().getDataAsString();
      } catch (e) {
        console.warn(`Could not read 1 Day Execution Plan via ID (${fileId}): ${e.message}. Attempting name search...`);
      }
    }

    if (!markdown) {
      try {
        const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
        const folder = DriveApp.getFolderById(folderId);
        const suffix = (typeof IS_CE_ENV !== 'undefined' && IS_CE_ENV) ? " (CE)" : " (Private)";
        const fileName = "TS - Task Master > 1 Day Execution Plan" + suffix + ".md";
        const files = folder.getFilesByName(fileName);
        if (files.hasNext()) {
          markdown = files.next().getBlob().getDataAsString();
          console.log(`Found and read 1 Day Execution Plan by filename: ${fileName}`);
        }
      } catch (e) {
        console.error("Failed to search 1 Day Execution Plan by filename:", e.message);
      }
    }
  }

  if (!markdown) {
    console.error("1 Day Execution Plan markdown could not be retrieved. Aborting timebox sync.");
    return;
  }
  
  console.log("Read markdown content of length: " + markdown.length + " | Preview: " + markdown.substring(0, 100).replace(/\n/g, '\\n'));
  const tasksToSchedule = parseTasksForTimeboxing(markdown);
  console.log("parseTasksForTimeboxing returned " + tasksToSchedule.length + " tasks.");
  
  if (tasksToSchedule.length === 0) {
    console.log("No tasks found to timebox.");
    return;
  }
  
  const verifiedTasks = verifyTasksAreStillActive(tasksToSchedule, now);
  
  console.log(`Found ${verifiedTasks.length} valid tasks to schedule after verification.`);
  if (verifiedTasks.length > 0) {
    scheduleTasksToCalendar(verifiedTasks, now);
  }
}

/**
 * Verifies that the parsed tasks are still active and not completed or moved out of today's scope.
 *
 * @param {Array<Object>} parsedTasks - Array of task objects parsed from the execution plan.
 * @param {Date} targetDate - The date to verify against.
 * @returns {Array<Object>} An array containing only the verified active tasks.
 */
function verifyTasksAreStillActive(parsedTasks, targetDate) {
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
  
  const now = targetDate || new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

  listsToFetch.forEach(listId => {
    let pageToken;
    do {
      const response = executeWithRetry(() => Tasks.Tasks.list(listId, { showCompleted: false, showHidden: false,  maxResults: 100, pageToken: pageToken }));
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
    } while (pageToken);
  });
  
  const verifiedTasks = [];
  for (const task of parsedTasks) {
     if (task.id && activeTasksForToday.has(task.id)) {
        task.title = activeTasksForToday.get(task.id); // Use the actual Task title, not the AI generated one
        verifiedTasks.push(task);
     } else {
        // Fallback to title matching if ID is missing OR if the AI hallucinated/mixed up the ID
        let found = false;
        for (const [id, title] of activeTasksForToday.entries()) {
           if (title.toLowerCase() === task.title.toLowerCase()) {
              verifiedTasks.push(task);
              found = true;
              break;
           }
        }
        if (!found) {
           const idStr = task.id ? ` (ID: ${task.id})` : "";
           console.warn(`Task "${task.title}"${idStr} is completed, moved, or not found. Skipping timebox.`);
        }
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
  let currentSectionType = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes("**🏠 Personal:**")) {
      currentSectionType = "Personal";
    } else if (line.includes("**🎯 CE (Work):**")) {
      currentSectionType = "CE (Work)";
    }
    
    const upperLine = line.toUpperCase();
    if (upperLine.includes("EAT THE FROG") || upperLine.includes("TODAY'S TOP 3") || upperLine.includes("ROUTINES") || upperLine.includes("THE REST OF TODAY")) {
      inTargetSection = true;
      continue;
    }
    
    if (upperLine.includes("THIS WEEK") || upperLine.includes("THIS MONTH") || upperLine.includes("BOTTLENECKS") || upperLine.includes("QUARANTINE")) {
      inTargetSection = false;
    }
    
    if (inTargetSection && line.startsWith("- [ ]")) {
      let cleanLine = line;
      let id = null;
      
      // Extract ID if present
      const idMatch = cleanLine.match(/\{ID:\s*(.*?)\}/i);
      if (idMatch) {
         id = idMatch[1].trim();
         cleanLine = cleanLine.replace(idMatch[0], "").trim();
      }
      
      // Extract trailing parentheses (notes) if present
      const noteMatch = cleanLine.match(/\s*\((.*?)\)$/);
      if (noteMatch) {
         cleanLine = cleanLine.replace(noteMatch[0], "").trim();
      }
      
      // Now parse the timebox and title
      const regex = /- \[ \]\s*(?:\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*)?(?:(?:🐸|\\ud83d\\udc38)\s*)?(?:\[THE FROG\]\s*)?(?:\[Q[1-4]\]\s*)?(.*)$/i;
      const match = cleanLine.match(regex);
      
      if (match) {
        const startTime = match[1];
        const endTime = match[2];
        let title = match[3] ? match[3].trim() : "";
        
        // Remove markdown artifacts like trailing hyphens if the AI appended notes
        if (title.endsWith(" -")) title = title.slice(0, -2).trim();
        
        if (title && !tasks.find(t => (t.id && t.id === id) || (!t.id && t.title === title))) {
           tasks.push({
              id: id,
              title: title,
              startTime: startTime,
              endTime: endTime,
              rawLine: line,
              sectionType: currentSectionType
           });
        }
      } else {
        console.warn("Regex failed to match cleaned line: " + cleanLine);
      }
    }
  }
  return tasks;
}

/**
 * Gets the primary timeboxing calendar (dedicated or default).
 */
function getPrimaryTimeboxingCalendar() {
  if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.CALENDARS && SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID) {
    try {
      const cal = CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID);
      if (cal) return cal;
    } catch (e) {
      console.warn("Could not get dedicated timeboxing calendar, falling back to default:", e.message);
    }
  }
  return CalendarApp.getDefaultCalendar();
}

/**
 * Creates calendar events on the default calendar matching task titles, 
 * using the extracted start and end times mapped onto the targetDate.
 * 
 * @param {Object[]} tasks Array of objects: {id, title, startTime, endTime}.
 * @param {Date} targetDate The date to map the timeboxes onto.
 */
function scheduleTasksToCalendar(tasks, targetDate) {
  const calendar = getPrimaryTimeboxingCalendar();
  const now = targetDate || new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const calendarsToClean = [calendar];
  if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.CALENDARS && SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID) {
    try {
      const crossCal = CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID);
      if (crossCal) {
        calendarsToClean.push(crossCal);
      }
    } catch (e) {
      console.warn(`Could not get cross-environment calendar: ${e.message}`);
    }
  }

  const isCe = (typeof IS_CE_ENV !== 'undefined') ? IS_CE_ENV : false;

  calendarsToClean.forEach(cal => {
    try {
      const isCrossCal = cal.getId() !== calendar.getId();
      const existingEvents = cal.getEvents(startOfDay, endOfDay);
      existingEvents.forEach(e => {
        if (e.getTitle().startsWith("[TS] ")) {
          // If it's the cross cal, only delete our own
          if (isCrossCal) {
              const desc = e.getDescription() || "";
              const envTag = isCe ? "[ENV:CE]" : "[ENV:PRIVATE]";
              if (!desc.includes(envTag) && desc.includes("[ENV:")) {
                  return; // Belongs to the other env, skip
              }
          }
          // Only delete future blocks. Keep blocks that have already started as a historical diary record.
          if (e.getStartTime() > now) {
             e.deleteEvent();
          }
        }
      });
    } catch (e) {
      console.warn(`Could not clean events for calendar: ${e.message}`);
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
        
        // Handle midnight wraparounds
        if (endH < startH || (endH === startH && endM < startM)) {
           endH += 24; // Use +24 instead of +12 to roll exactly into the next day
        }
        
        const proposedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0);
        const proposedEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0);
        
        if (proposedEnd > now) {
           const localDayName = Utilities.formatDate(proposedStart, "Europe/London", "EEEE");
           const isWeekend = (localDayName === "Saturday" || localDayName === "Sunday");
           const startMinutes = startH * 60 + startM;
           const endMinutes = endH * 60 + endM;
           const isTaskCe = (task.sectionType === "CE (Work)");

           // 1. Hard evening cutoff: 21:45
           if (endMinutes > (21 * 60 + 45)) {
              console.warn(`Timebox rejected for "${task.title}": Exceeds evening cutoff 21:45 (${task.startTime}-${task.endTime}).`);
              continue;
           }

           // 2. Weekday Private environment daytime blackout: 09:00 - 20:00
           if (!isWeekend && (!isCe || task.sectionType === "Personal")) {
              if (!isTaskCe && startMinutes < (20 * 60) && endMinutes > (9 * 60)) {
                 console.warn(`Timebox rejected for "${task.title}": Cannot schedule Private tasks during weekday work hours 09:00-20:00 (${task.startTime}-${task.endTime}).`);
                 continue;
              }
           }

           // 3. Weekend Private window: 10:00 - 18:00
           if (isWeekend && (!isCe || task.sectionType === "Personal")) {
              if (startMinutes < (10 * 60) || endMinutes > (18 * 60)) {
                 console.warn(`Timebox rejected for "${task.title}": Weekend Private tasks must be between 10:00 and 18:00 (${task.startTime}-${task.endTime}).`);
                 continue;
              }
           }

           // --- COLLISION DETECTION ---
           let hasCollision = false;
           let overlappingEvents = [];
           const calendarsToCheck = ['primary'];
           if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.CALENDARS && SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID) {
               calendarsToCheck.push(SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID);
           }
           
           const timeMinStr = Utilities.formatDate(proposedStart, "Europe/London", "yyyy-MM-dd'T'HH:mm:ssXXX");
           const timeMaxStr = Utilities.formatDate(proposedEnd, "Europe/London", "yyyy-MM-dd'T'HH:mm:ssXXX");

           for (const calId of calendarsToCheck) {
               try {
                   const response = Calendar.Events.list(calId, {
                     timeMin: timeMinStr,
                     timeMax: timeMaxStr,
                     singleEvents: true,
                     maxResults: 50
                   });
                   if (response.items && response.items.length > 0) {
                       response.items.forEach(e => {
                           e.sourceCalId = calId;
                       });
                       overlappingEvents = overlappingEvents.concat(response.items);
                   }
               } catch (e) {
                   console.warn(`Could not fetch events for calendar ${calId}: ${e.message}`);
               }
           }
           
           for (const oe of overlappingEvents) {
              if (oe.start.date) continue; // All day event
              if (oe.summary && oe.summary.startsWith("[TS] ") && oe.sourceCalId === 'primary') continue;
              if (oe.transparency === 'transparent') continue; // Free event
              
              const oeStart = new Date(oe.start.dateTime).getTime();
              const oeEnd = new Date(oe.end.dateTime).getTime();
              
              // Only trigger collision if the overlap is substantial (e.g. > 1 minute)
              // to avoid edge cases where events end exactly at the start minute of the next.
              if (oeEnd <= proposedStart.getTime() + 60000 || 
                  oeStart >= proposedEnd.getTime() - 60000) {
                 continue;
              }
              
              if (oe.summary && task.rawLine && task.rawLine.toLowerCase().includes(oe.summary.toLowerCase())) {
                 console.log(`Collision bypassed: AI explicitly scheduled "${task.title}" during "${oe.summary}".`);
                 continue;
              }
              
              console.log(`Collision detected: AI timebox "${task.title}" overlaps with real meeting "${oe.summary}". Skipping.`);
              hasCollision = true;
              break;
           }
           
           if (!hasCollision) {
               console.log(`Scheduling ${task.title} at ${task.startTime}-${task.endTime} as requested by AI.`);
               
               let targetCal = calendar;
                if (task.sectionType) {
                  const isTypeCe = (task.sectionType === "CE (Work)");
                  if (isTypeCe !== isCe) {
                     if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.CALENDARS && SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID) {
                        try {
                           const crossCal = CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID);
                           if (crossCal) {
                              targetCal = crossCal;
                           }
                        } catch (e) {
                           console.warn(`Could not fetch cross-environment calendar for scheduling: ${e.message}`);
                        }
                     }
                  }
               }
               
               const newEvent = targetCal.createEvent("[TS] " + task.title, proposedStart, proposedEnd);
               newEvent.setVisibility(CalendarApp.Visibility.PRIVATE);
               newEvent.setColor(CalendarApp.EventColor.ORANGE);
               if (targetCal.getId() !== calendar.getId()) {
                   const envTag = isCe ? "[ENV:CE]" : "[ENV:PRIVATE]";
                   newEvent.setDescription(envTag);
               }
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

/**
 * Cleans up all [TS] timeboxed events for today.
 */
function cleanupTodayTimeboxes() {
  const calendar = getPrimaryTimeboxingCalendar();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const existingEvents = calendar.getEvents(startOfDay, endOfDay);
  let deletedCount = 0;
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      e.deleteEvent();
      deletedCount++;
    }
  });
  console.log("Deleted " + deletedCount + " [TS] timeboxed events for today.");
}

/**
 * Cleans up all [TS] timeboxed events for tomorrow.
 */
function cleanupTomorrowTimeboxes() {
  const calendar = getPrimaryTimeboxingCalendar();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
  const endOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);
  
  const existingEvents = calendar.getEvents(startOfDay, endOfDay);
  let deletedCount = 0;
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      e.deleteEvent();
      deletedCount++;
    }
  });
  console.log("Deleted " + deletedCount + " [TS] timeboxed events for tomorrow.");
}

/**
 * Cleans up all [TS] timeboxed events from the default calendar (legacy).
 * Run this manually from the IDE once to clear old timeboxes before the migration to the dedicated calendar.
 */
function cleanupLegacyTimeboxes() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  
  // Look from 30 days in the past up to 14 days ahead to catch all existing TS blocks
  const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
  const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59);
  
  const existingEvents = calendar.getEvents(pastDate, futureDate);
  let deletedCount = 0;
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      e.deleteEvent();
      deletedCount++;
    }
  });
  console.log("Legacy Cleanup: Deleted " + deletedCount + " [TS] timeboxed events from the default calendar.");
}

