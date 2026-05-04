// ==========================================
// TASK MASTER ENGINE (PHASE D.5 - D.8)
// Priority Engine, Backlog Sweep & Calendar Capacity
// ==========================================

const TM_MODEL_NAME = "gemini-3.1-pro-preview"; // Upgraded to Gemini 3.1 Pro (High Intelligence Engine)
const ONE_PAGER_FILE_ID_PROP = "TASKMASTER_ONEPAGER_ID"; 

/**
 * Main execution pipeline for Task Master.
 * Covers D.5 (Priority), D.6 (Daily Plan), D.7 (Weekly Sweep), and D.8 (Capacity Context).
 */
function runTaskMasterEngine() {
  const now = new Date();
  console.log("Initializing Task Master Engine...");

  // 1. Extract Calendar Capacity (D.8)
  const capacityData = extractCalendarCapacity(now);

  // 2. Extract Tasks Backlog & Identify Missing Deadlines (D.5/D.7)
  const taskData = extractTasksBacklog();

  // 3. Extract Goals & Strategy
  const goalsData = getSystemGoals();

  // 4. Compile Context Payload
  const payload = {
    currentTime: now.toISOString(),
    goals: goalsData,
    capacity: capacityData,
    tasks: taskData
  };

  console.log(`Extracted ${taskData.length} active tasks and ${capacityData.events.length} upcoming events.`);
  
  // 5. Send to Gemini
  const aiResponse = callTaskMasterAI(payload);
  if (!aiResponse) return;

  // 6. Update Tasks (Deadlines & Clean up)
  processTaskUpdates(aiResponse.taskUpdates);

  // 7. Generate & Update the One-Pager Markdown File
  updateOnePagerMarkdown(aiResponse.onePagerMarkdown);
}

/**
 * Helper to extract text from either a Google Doc or a raw text/markdown file.
 */
function getFileContent(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    if (file.getMimeType() === MimeType.GOOGLE_DOCS) {
      return DocumentApp.openById(fileId).getBody().getText();
    } else {
      return file.getBlob().getDataAsString();
    }
  } catch(e) {
    return `[File Not Found or Unreadable: ${e.message}]`;
  }
}

/**
 * Fetches the master Goals documents from Google Drive.
 */
function getSystemGoals() {
  const personalId = SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID;
  const workId = SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID;
  
  let goalsText = "=== PERSONAL GOALS ===\n";
  if (personalId) {
    goalsText += getFileContent(personalId) + "\n\n";
  } else {
    goalsText += "No PERSONAL_GOALS_FILE_ID provided in Script Properties.\n\n";
  }

  goalsText += "=== WORK GOALS ===\n";
  if (workId) {
    goalsText += getFileContent(workId) + "\n";
  } else {
    goalsText += "No WORK_GOALS_FILE_ID provided in Script Properties.\n";
  }

  return goalsText;
}

/**
 * Sends the entire ecosystem context to Gemini to act as the Task Master.
 */
function callTaskMasterAI(payload) {
  const systemInstruction = getTaskMasterSystemPrompt();

  const schema = {
    "type": "OBJECT",
    "properties": {
      "taskUpdates": {
        "type": "ARRAY",
        "items": {
          "type": "OBJECT",
          "properties": {
            "taskId": { "type": "STRING" },
            "listId": { "type": "STRING" },
            "routingTarget": { "type": "STRING", "description": "THIS_HOUR, TODAY, TOMORROW, THIS_WEEK, THIS_MONTH, BACKLOG, DELETE, COMPLETE" },
            "recommendedDeadline": { "type": "STRING" },
            "systemComment": { "type": "STRING", "description": "AI questions or feedback to the user." },
            "clearUserComment": { "type": "BOOLEAN", "description": "Set to true if you have processed the user's DA: instruction." },
            "reasoning": { "type": "STRING" }
          }
        }
      },
      "onePagerMarkdown": {
        "type": "STRING",
        "description": "The full Markdown string for the Day/Week/Month priority document."
      }
    },
    "required": ["taskUpdates", "onePagerMarkdown"]
  };

  // Uses the centralized callGemini function from Code_Utilities.js
  const result = callGemini(JSON.stringify(payload), TM_MODEL_NAME, systemInstruction, schema);
  
  if (result.error) {
    console.error("Task Master AI Error:", result.error);
    return null;
  }
  return result;
}

/**
 * Applies the AI's recommendations to the Google Tasks API.
 */
function formatTaskNotes(notes, systemComment, clearUserComment, recommendedDeadline) {
  let urlLine = "";
  let otherNotes = [];
  let daComment = "DA:";
  let sysComment = "SYS:";

  const lines = (notes || "").split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("http")) {
      urlLine = trimmed;
    } else if (trimmed.startsWith("DA:")) {
      daComment = clearUserComment ? "DA:" : trimmed;
    } else if (trimmed.startsWith("SYS:")) {
      sysComment = trimmed;
    } else if (trimmed.includes("[DEADLINE:") || trimmed.includes("[TaskMaster Logic:") || trimmed.includes("[DURATION:") || trimmed.includes("[GOAL:")) {
      // aggressively drop old legacy blocks that stacked up in V1
    } else if (trimmed !== "") {
      otherNotes.push(trimmed);
    }
  });

  if (systemComment) sysComment = `SYS: ${systemComment}`;
  if (recommendedDeadline) otherNotes.push(`[DEADLINE: ${recommendedDeadline}]`);

  let finalNotes = [];
  if (urlLine) finalNotes.push(urlLine);
  if (otherNotes.length > 0) finalNotes.push(otherNotes.join('\n'));
  
  // Only add dialogue block if there is a comment
  if (sysComment !== "SYS:" || daComment !== "DA:") {
    finalNotes.push(""); // spacer
    finalNotes.push(sysComment);
    finalNotes.push(daComment);
  }

  return finalNotes.join('\n');
}

function processTaskUpdates(updates) {
  if (!updates || updates.length === 0) return;
  console.log(`Processing ${updates.length} task modifications...`);
  
  const backlogListId = SYSTEM_CONFIG.TASKS.BACKLOG_LIST_ID;
  const deleteListId = SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID;

  updates.forEach(update => {
    try {
      const originalTask = Tasks.Tasks.get(update.listId, update.taskId);
      const formattedNotes = formatTaskNotes(originalTask.notes, update.systemComment, update.clearUserComment, update.recommendedDeadline);
      
      if (update.routingTarget === "BACKLOG" || update.routingTarget === "DELETE" || update.routingTarget === "PROPOSE_DELETE") {
        const targetListId = update.routingTarget === "BACKLOG" ? backlogListId : deleteListId;
        if (!targetListId) {
          console.warn(`[WARNING] Skipping move to ${update.routingTarget}: Target List ID missing from properties.`);
          return;
        }
        
        // Google Tasks doesn't support list-to-list moves. We must fetch, clone, and delete.
        const clonedTask = {
          title: originalTask.title,
          notes: formattedNotes,
          due: originalTask.due
        };
        
        Tasks.Tasks.insert(clonedTask, targetListId);
        Tasks.Tasks.remove(update.listId, update.taskId);
        console.log(`Moved task '${originalTask.title}' to ${update.routingTarget}.`);
      } 
      else if (update.routingTarget === "COMPLETE") {
        originalTask.status = "completed";
        originalTask.notes = formattedNotes;
        Tasks.Tasks.update(originalTask, update.listId, update.taskId);
        console.log(`Completed task '${originalTask.title}'.`);
      }
      else {
        // Routine update (THIS_HOUR, TODAY, THIS_WEEK, THIS_MONTH, TOMORROW)
        originalTask.notes = formattedNotes;
        Tasks.Tasks.update(originalTask, update.listId, update.taskId);
        console.log(`Updated task '${originalTask.title}' [Target: ${update.routingTarget}].`);
      }
    } catch (e) {
      console.error(`Failed to process update for Task ID ${update.taskId}: ${e.message}`);
    }
  });
}

/**
 * Updates or creates the One-Pager Markdown file in Google Drive.
 */
function updateOnePagerMarkdown(markdownContent) {
  const props = PropertiesService.getScriptProperties();
  let fileId = props.getProperty(ONE_PAGER_FILE_ID_PROP);
  let file;

  if (fileId) {
    try {
      file = DriveApp.getFileById(fileId);
      file.setContent(markdownContent);
    } catch (e) {
      fileId = null; // Reset if deleted or inaccessible
    }
  }

  if (!fileId) {
    const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
    const targetFolder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    file = targetFolder.createFile("The System - Task Master One-Pager.md", markdownContent, MimeType.PLAIN_TEXT);
    props.setProperty(ONE_PAGER_FILE_ID_PROP, file.getId());
  } else {
    file.setContent(markdownContent);
  }

  console.log(`One-Pager updated: ${file.getUrl()}`);
  
  // Append historical data to the Audit Log
  updateAuditLog(markdownContent);
}

/**
 * Extracts COMPLETED LOG and QUARANTINE REPORT and appends to a monthly historical audit log.
 */
function updateAuditLog(markdownContent) {
  const now = new Date();
  const monthStr = now.toISOString().substring(0, 7); // YYYY-MM format
  const fileName = `Task Master Audit Log [${monthStr}].md`;
  
  // Extract sections safely using regex
  const quarantineMatch = markdownContent.match(/## 🗑️ QUARANTINE REPORT[\s\S]*?(?=##|$)/);
  const completedMatch = markdownContent.match(/## ✅ COMPLETED LOG \(Last 24h\)[\s\S]*?(?=##|$)/);
  
  if (!quarantineMatch && !completedMatch) return;

  let logEntry = `\n\n---\n### 🕒 ${now.toISOString()}\n`;
  if (quarantineMatch) logEntry += quarantineMatch[0] + "\n";
  if (completedMatch) logEntry += completedMatch[0] + "\n";

  const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(file.getBlob().getDataAsString() + logEntry);
    console.log(`Appended to Audit Log: ${fileName}`);
  } else {
    folder.createFile(fileName, `# Task Master Audit Log - ${monthStr}` + logEntry, MimeType.PLAIN_TEXT);
    console.log(`Created new Audit Log: ${fileName}`);
  }
}

/**
 * Extracts Calendar events for the next 30 days to calculate true working capacity.
 */
function extractCalendarCapacity(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30); // 30-day lookahead
  
  const events = CalendarApp.getDefaultCalendar().getEvents(startDate, endDate);
  
  const formattedEvents = events.map(e => ({
    title: e.getTitle(),
    startTime: e.getStartTime().toISOString(),
    endTime: e.getEndTime().toISOString(),
    isAllDay: e.isAllDayEvent()
  }));

  return {
    lookaheadDays: 30,
    events: formattedEvents
  };
}

/**
 * Pulls all incomplete tasks across all lists.
 * Flags tasks that lack deadlines or metadata.
 */
function extractTasksBacklog() {
  const taskLists = Tasks.Tasklists.list().items || [];
  const allTasks = [];
  
  taskLists.forEach(list => {
    let pageToken = null;
    do {
      const response = Tasks.Tasks.list(list.id, { 
        showHidden: true, 
        maxResults: 100,
        pageToken: pageToken
      });
      
      const tasks = response.items || [];
      tasks.forEach(t => {
        if (t.status !== "completed") {
          // Check if Task Pipeline D.12 encoding exists
          const hasEncodedDeadline = t.notes && t.notes.includes("[DEADLINE:");
          
          allTasks.push({
            id: t.id,
            listId: list.id,
            listName: list.title,
            title: t.title,
            notes: t.notes || "",
            apiDueDate: t.due || "None", // Google Tasks native notification date
            hasHardDeadline: hasEncodedDeadline,
            needsReview: !hasEncodedDeadline && !t.due
          });
        }
      });
      
      pageToken = response.nextPageToken;
    } while (pageToken);
  });
  
  return allTasks;
}
