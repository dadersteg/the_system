// ==========================================
// TASK MASTER ENGINE (PHASE D.5 - D.8)
// Priority Engine, Backlog Sweep & Calendar Capacity
// ==========================================

const TM_MODEL_NAME = PropertiesService.getScriptProperties().getProperty("TASK_MASTER_MODEL") || "gemini-3.0-pro";
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
  const props = PropertiesService.getScriptProperties();
  const personalId = props.getProperty("PERSONAL_GOALS_FILE_ID");
  const workId = props.getProperty("WORK_GOALS_FILE_ID");
  
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
  const props = PropertiesService.getScriptProperties();
  const promptFileId = props.getProperty("TASK_MASTER_PROMPT_ID");
  
  let systemInstruction = "";
  if (promptFileId) {
    systemInstruction = getFileContent(promptFileId);
  } else {
    console.error("Missing TASK_MASTER_PROMPT_ID. Cannot run Task Master AI.");
    return null;
  }

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
            "action": { "type": "STRING", "description": "UPDATE, MOVE_TO_BACKLOG, or PROPOSE_DELETE" },
            "recommendedDeadline": { "type": "STRING" },
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
function processTaskUpdates(updates) {
  if (!updates || updates.length === 0) return;
  console.log(`Processing ${updates.length} task modifications...`);
  
  const props = PropertiesService.getScriptProperties();
  const backlogListId = props.getProperty("BACKLOG_LIST_ID");
  const deleteListId = props.getProperty("TO_BE_DELETED_LIST_ID");

  updates.forEach(update => {
    try {
      if (update.action === "MOVE_TO_BACKLOG" || update.action === "PROPOSE_DELETE") {
        const targetListId = update.action === "MOVE_TO_BACKLOG" ? backlogListId : deleteListId;
        if (!targetListId) {
          console.warn(`[WARNING] Skipping move to ${update.action}: Target List ID missing from properties.`);
          return;
        }
        
        // Google Tasks doesn't support list-to-list moves. We must fetch, clone, and delete.
        const originalTask = Tasks.Tasks.get(update.listId, update.taskId);
        
        const clonedTask = {
          title: originalTask.title,
          notes: (originalTask.notes || "") + `\n\n[TaskMaster Logic: ${update.reasoning}]`,
          due: originalTask.due
        };
        
        Tasks.Tasks.insert(clonedTask, targetListId);
        Tasks.Tasks.remove(update.listId, update.taskId);
        console.log(`Moved task '${originalTask.title}' to ${update.action === "MOVE_TO_BACKLOG" ? "Backlog" : "99 To be deleted"}.`);
      } 
      else if (update.action === "UPDATE") {
        const originalTask = Tasks.Tasks.get(update.listId, update.taskId);
        if (update.recommendedDeadline) {
          originalTask.notes = (originalTask.notes || "") + `\n[DEADLINE: ${update.recommendedDeadline}]`;
        }
        Tasks.Tasks.update(originalTask, update.listId, update.taskId);
        console.log(`Updated task '${originalTask.title}' with deadline ${update.recommendedDeadline}.`);
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
    const folderId = props.getProperty("WORKSPACE_FOLDER_ID");
    const targetFolder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    file = targetFolder.createFile("The System - Task Master One-Pager.md", markdownContent, MimeType.PLAIN_TEXT);
    props.setProperty(ONE_PAGER_FILE_ID_PROP, file.getId());
  } else {
    file.setContent(markdownContent);
  }

  console.log(`One-Pager updated: ${file.getUrl()}`);
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
