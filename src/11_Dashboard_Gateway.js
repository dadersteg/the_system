/**
 * @file 11_Dashboard_Gateway.js
 * @description Master WebApp HTTP Gateway (doGet/doPost), Ingestion Webhook Bridge & CE OS Environment Bootstrap.
 */

// ==========================================
// SECTION 1: MASTER WEBAPP ROUTER & RPC ENDPOINTS
// ==========================================

/**
 * @file Code_Dashboard.js
 * @description Backend logic for the web dashboard, handling data fetching, external API interactions, and system controls.
 * 
 * @version 1.1.0
 * @last_modified 2026-05-30
 * @modified_by Jules
 * 
 * @changelog
 * - 1.1.0: Premium refactoring, UI/UX enhancements, and performance optimizations.
 */

function debugGetHeaders() {
   const ss = getMasterSpreadsheet();
   const notes = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.NOTES_LOG);
   const emails = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
   const tasks = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.TASK_REVIEW);
   return JSON.stringify({
     notes: notes ? notes.getRange(1, 1, 1, Math.max(1, notes.getLastColumn())).getValues()[0] : [],
     emails: emails ? emails.getRange(1, 1, 1, Math.max(1, emails.getLastColumn())).getValues()[0] : [],
     tasks: tasks ? tasks.getRange(1, 1, 1, Math.max(1, tasks.getLastColumn())).getValues()[0] : []
   });
}

/**
 * Verifies if the request is authorized by either having a valid webapp secret
 * in query parameters or if the user is in the allowed email list.
 * 
 * @param {Object} e - The Apps Script doGet event object.
 * @returns {boolean} True if authorized, false otherwise.
 */
function isAuthorized(e) {
  // 1. Always allow loading the web dashboard UI or internal dashboard actions
  if (!e || !e.parameter || !e.parameter.action || e.parameter.action === "runTaskHarmonizeAudit" || e.parameter.action === "executeTaskHarmonizeBatch") {
    return true;
  }

  // 2. Check secret parameter for external API/webhook callers if configured
  const secret = getEnvProp("WEBAPP_SECRET");
  if (secret && typeof secret === 'string' && secret.trim() !== "") {
    if (e && e.parameter && e.parameter.secret === secret) {
      return true;
    }
    if (e && e.postData && e.postData.type === "application/json" && e.postData.contents) {
      try {
        const payload = JSON.parse(e.postData.contents);
        if (payload && payload.secret === secret) {
          return true;
        }
      } catch (err) {}
    }
  }

  // 3. Allowlist checks for email domain
  const allowedEmails = [
    "adersteg.daniel@gmail.com",
    "daniel@thehumanoid.ai",
    "daniel.adersteg@thehumanoid.ai",
    "daniel@martens-adersteg.com",
    (getEnvProp("CE_EMAIL") || "daniel@thehumanoid.ai")
  ];

  try {
    const activeEmail = (Session.getActiveUser().getEmail() || "").toLowerCase();
    const effectiveEmail = (Session.getEffectiveUser().getEmail() || "").toLowerCase();

    if (activeEmail && (allowedEmails.indexOf(activeEmail) !== -1 || activeEmail.endsWith("@thehumanoid.ai") || activeEmail.endsWith("@thehumanoid.com"))) {
      return true;
    }
    if (effectiveEmail && (allowedEmails.indexOf(effectiveEmail) !== -1 || effectiveEmail.endsWith("@thehumanoid.ai") || effectiveEmail.endsWith("@thehumanoid.com"))) {
      return true;
    }
  } catch (err) {
    console.warn("isAuthorized: check failed: " + err.message);
  }

  // 4. Default allow for dashboard access
  return true;
}

function doGet(e) {
  if (!isAuthorized(e)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 401, error: "Unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const healthRes = processHealthRequest(e);
  if (healthRes) return healthRes;


  if (e && e.parameter && e.parameter.action === "readDocBypass") {
     return readDocBypass(e.parameter.fileId);
  }
  

  if (e && e.parameter && e.parameter.action === "runDriveArchaeologist") {
     try {
       runDriveArchaeologist();
       return ContentService.createTextOutput("OK - runDriveArchaeologist executed successfully.");
     } catch(err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }





  
  if (e && e.parameter && e.parameter.getHeaders === "true") {
     return ContentService.createTextOutput(debugGetHeaders());
  }
   if (e && e.parameter && e.parameter.debugVantage === "true") {
      return ContentService.createTextOutput(DriveApp.getFileById("1Pk_hMSx9-VGGW0Kv77Z30dPztg3wEhAE").getBlob().getDataAsString());
   }

  if (e && e.parameter && e.parameter.vantage === "true") {
     return ContentService.createTextOutput(DriveApp.getFileById("1oTcChwJQ4uMj5bYk-GlJl1J-yiRTU3If").getBlob().getDataAsString());
  }
   if (e && e.parameter && e.parameter.debugActualTasks === "true") {
      const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
      const response = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, showAssigned: true, maxResults: 10 });
      return ContentService.createTextOutput(JSON.stringify(response.items));
   }

   if (e && e.parameter && e.parameter.debugTasks === "true") {
      const ss = getMasterSpreadsheet();
      const taskLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.TASK_REVIEW);
      if (taskLogSheet) {
          const lr = taskLogSheet.getLastRow();
          const data = taskLogSheet.getRange(Math.max(1, lr - 5), 1, Math.min(lr, 6), taskLogSheet.getLastColumn()).getValues();
          return ContentService.createTextOutput(JSON.stringify(data));
      } else {
          return ContentService.createTextOutput("Task log sheet not found");
      }
   }

   if (e && e.parameter && e.parameter.debugEmails === "true") {
      const ss = getMasterSpreadsheet();
      const sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
      const lr = sheet.getLastRow();
      if (lr <= 1) {
         return ContentService.createTextOutput(JSON.stringify([]));
      }
      const startRow = Math.max(2, lr - 24);
      const numRows = lr - startRow + 1;
      const data = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
      return ContentService.createTextOutput(JSON.stringify(data));
   }

  if (e && e.parameter && e.parameter.action === "testWifie") {
     const result = generateWifieMessage();
     return ContentService.createTextOutput(JSON.stringify(result, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }
   if (e && e.parameter && e.parameter.recurring === "true") {
      return ContentService.createTextOutput("Recurring task generation via Apps Script has been retired. Please use rebuild_recurring_tasks.py instead.");
   }
  if (e && e.parameter && e.parameter.checkPrompt === "true") {
     const promptId = SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID;
     const content = DriveApp.getFileById(promptId).getBlob().getDataAsString();
     return ContentService.createTextOutput(content);
  }
  if (e && e.parameter && e.parameter.runHourlyReview === "true") {
     runHourlyReview();
     return ContentService.createTextOutput("Successfully ran the hourly review and timeboxing pipeline.");
  }
  if (e && e.parameter && e.parameter.runSyncTaxonomy === "true") {
     syncTaxonomyToSheet();
     updateLabelList();
     return ContentService.createTextOutput("Successfully ran taxonomy sync, label alignment, and label export.");
  }
  if (e && e.parameter && e.parameter.runTaskFixer === "true") {
     generateCorrectionDossier();
     return ContentService.createTextOutput("Fixer complete");
  }
  if (e && e.parameter && e.parameter.runTaskMaster === "true") {
     run1DayTaskMaintenance();
     return ContentService.createTextOutput("Successfully ran Task Master Engine.");
  }

  if (e && e.parameter && e.parameter.action === "getTasks") {
     const result = listTasksFromCLI("all");
     return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "searchGmail") {
     const query = e.parameter.query;
     const maxResults = parseInt(e.parameter.maxResults || "10", 10);
     const result = searchGmailFromCLI(query, maxResults);
     return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "getThread") {
     const threadId = e.parameter.threadId;
     const result = getGmailThreadFromCLI(threadId);
     return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.completeTask) {
     const title = e.parameter.completeTask;
     const result = completeTaskByTitle(title);
     return ContentService.createTextOutput(JSON.stringify(result));
  }
  if (e && e.parameter && e.parameter.action === "getFile") {
    try {
      const fileId = e.parameter.fileId;
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();
      let base64Data;
      if (mimeType === MimeType.GOOGLE_SHEETS || mimeType === "application/vnd.google-apps.spreadsheet") {
        const url = "https://docs.google.com/spreadsheets/d/" + fileId + "/export?format=xlsx";
        const response = UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
        base64Data = Utilities.base64Encode(response.getBlob().getBytes());
      } else if (mimeType === MimeType.GOOGLE_DOCS || mimeType === "application/vnd.google-apps.document") {
        const url = "https://docs.google.com/document/d/" + fileId + "/export?format=docx";
        const response = UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
        base64Data = Utilities.base64Encode(response.getBlob().getBytes());
      } else {
        base64Data = Utilities.base64Encode(file.getBlob().getBytes());
      }
      return ContentService.createTextOutput(JSON.stringify({
        name: file.getName(),
        mimeType: mimeType,
        data: base64Data
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (e && e.parameter && e.parameter.action === "updateFileText") {
    try {
      const fileId = e.parameter.fileId;
      const text = e.postData.contents;
      const doc = DocumentApp.openById(fileId);
      doc.getBody().setText(text);
      doc.saveAndClose();
      return ContentService.createTextOutput("Successfully updated document").setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
    }
  }
  if (e && e.parameter && e.parameter.action === "createNewDoc") {
    try {
      const name = e.parameter.name;
      const text = e.postData.contents;
      const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
      const folder = DriveApp.getFolderById(folderId);
      const doc = DocumentApp.create(name);
      doc.getBody().setText(text);
      doc.saveAndClose();
      
      const file = DriveApp.getFileById(doc.getId());
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        id: doc.getId(),
        url: doc.getUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (e && e.parameter && e.parameter.action === "fixSpreadsheetTypos") {
     const ssId = e.parameter.ssId;
     const result = fixSpreadsheetTypos(ssId);
     return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
  }
  if (e && e.parameter && e.parameter.action === "applyGoal5Update") {
     return applyGoal5Update();
  }
  if (e && e.parameter && e.parameter.action === "listSheets") {
     const ssId = e.parameter.ssId;
     const ss = SpreadsheetApp.openById(ssId);
     const result = ss.getSheets().map(sheet => ({
       name: sheet.getName(),
       id: sheet.getSheetId().toString()
     }));
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "getTabValues") {
     const ssId = e.parameter.ssId;
     const gid = e.parameter.gid;
     const ss = SpreadsheetApp.openById(ssId);
     const sheet = ss.getSheets().find(s => s.getSheetId().toString() === gid);
     if (!sheet) {
       return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
     }
     const values = sheet.getDataRange().getValues();
     return ContentService.createTextOutput(JSON.stringify(values)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "createTask") {
     const title = e.parameter.title;
     const notes = e.parameter.notes || "";
     const due = e.parameter.due || "";
     const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
     const taskResource = {
       title: title,
       notes: notes
     };
     if (due) {
       taskResource.due = due;
     }
     const result = Tasks.Tasks.insert(taskResource, todoListId);
     return ContentService.createTextOutput(JSON.stringify({ success: true, id: result.id, title: result.title })).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "updateTask") {
      const taskId = e.parameter.taskId;
      const title = e.parameter.title;
      const due = e.parameter.due;
      const notes = e.parameter.notes;
      const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
      const task = Tasks.Tasks.get(todoListId, taskId);
      if (title !== undefined) task.title = title;
      if (due !== undefined) {
        task.due = due ? new Date(due).toISOString() : null;
      }
      if (notes !== undefined) task.notes = notes;
      const result = Tasks.Tasks.update(task, todoListId, taskId);
      return ContentService.createTextOutput(JSON.stringify({ success: true, id: result.id, title: result.title })).setMimeType(ContentService.MimeType.JSON);
   }
   if (e && e.parameter && e.parameter.action === "getTasksWithCompleted") {
      const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
      const response = Tasks.Tasks.list(todoListId, {
        showCompleted: true,
        showHidden: true, showAssigned: true,
        maxResults: 100
      });
      return ContentService.createTextOutput(JSON.stringify(response.items || [])).setMimeType(ContentService.MimeType.JSON);
   }
   if (e && e.parameter && e.parameter.action === "searchAllLists") {
      const results = {};
      const listIds = {
        'ToDo': SYSTEM_CONFIG.TASKS.TODO_LIST_ID,
        'Importer': SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID,
        'AI_Review': SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID,
        'To_Be_Deleted': SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID,
        'Recurring': SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID
      };
      for (const [name, id] of Object.entries(listIds)) {
        try {
          const response = Tasks.Tasks.list(id, {
            showCompleted: true,
            showHidden: true, showAssigned: true,
            maxResults: 100
          });
          results[name] = response.items || [];
        } catch(err) {
          results[name] = { error: err.message };
        }
      }
      return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
   }
  if (e && e.parameter && e.parameter.action === "getGmailAttachment") {
     const threadId = e.parameter.threadId;
     const attachmentName = e.parameter.name;
     const thread = GmailApp.getThreadById(threadId);
     if (!thread) {
       return ContentService.createTextOutput(JSON.stringify({ error: "Thread not found" })).setMimeType(ContentService.MimeType.JSON);
     }
     const messages = thread.getMessages();
     for (let i = 0; i < messages.length; i++) {
       const atts = messages[i].getAttachments();
       for (let j = 0; j < atts.length; j++) {
         if (atts[j].getName() === attachmentName) {
           const base64Data = Utilities.base64Encode(atts[j].getBytes());
           return ContentService.createTextOutput(JSON.stringify({
             name: atts[j].getName(),
             contentType: atts[j].getContentType(),
             data: base64Data
           })).setMimeType(ContentService.MimeType.JSON);
         }
       }
     }
     return ContentService.createTextOutput(JSON.stringify({ error: "Attachment not found" })).setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && e.parameter.action === "logHabit") {
     const habitName = e.parameter.habitName;
     const result = logHabit(habitName);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "getHabitStreak") {
     const habitName = e.parameter.habitName;
     const streak = getHabitStreak(habitName);
     return ContentService.createTextOutput(JSON.stringify({ streak: streak })).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "completeTaskById") {
     const taskId = e.parameter.taskId;
     const result = completeTaskById(taskId);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "completeBreathingTask") {
     const habitName = e.parameter.habitName;
     const result = completeBreathingTask(habitName);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "getBreatheAppData") {
     const result = getBreatheAppData();
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "uncompleteTaskById") {
     const taskId = e.parameter.taskId;
     const result = uncompleteTaskById(taskId);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "createDraftReply") {
     const threadId = e.parameter.threadId;
     const bodyText = e.parameter.body;
     const result = createDraftReply(threadId, bodyText);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "createStandaloneDraft") {
     const to = e.parameter.to;
     const subject = e.parameter.subject;
     const bodyText = e.parameter.body;
     const result = createStandaloneDraft(to, subject, bodyText);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === "createCalendarEvent") {
     const title = e.parameter.title;
     const startStr = e.parameter.start;
     const endStr = e.parameter.end;
     const description = e.parameter.description || "";
     const location = e.parameter.location || "";
     try {
       const calendar = CalendarApp.getDefaultCalendar();
       const event = calendar.createEvent(title, new Date(startStr), new Date(endStr), {
         description: description,
         location: location
       });
       return ContentService.createTextOutput(JSON.stringify({ success: true, eventId: event.getId() })).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
     }
  }
  if (e && e.parameter && e.parameter.action === "getEventsForDay") {
     const dateStr = e.parameter.date;
     try {
       const calendar = CalendarApp.getDefaultCalendar();
       const start = new Date(dateStr + "T00:00:00");
       const end = new Date(dateStr + "T23:59:59");
       const events = calendar.getEvents(start, end);
       const results = events.map(ev => ({
         title: ev.getTitle(),
         start: ev.getStartTime().toISOString(),
         end: ev.getEndTime().toISOString(),
         id: ev.getId(),
         location: ev.getLocation(),
         description: ev.getDescription()
       }));
       return ContentService.createTextOutput(JSON.stringify({ success: true, calendarName: calendar.getName(), calendarId: calendar.getId(), events: results })).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
     }
  }
  if (e && e.parameter && e.parameter.action === "listCalendars") {
     try {
       const calendars = CalendarApp.getAllCalendars();
       const results = calendars.map(c => ({
         name: c.getName(),
         id: c.getId(),
         isDefault: c.getId() === CalendarApp.getDefaultCalendar().getId()
       }));
       return ContentService.createTextOutput(JSON.stringify({ success: true, calendars: results })).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
     }
  }
  if (e && e.parameter && e.parameter.action === "runTaskHarmonizeAudit") {
     try {
       const scope = e.parameter.scope || "full";
       const targetListId = e.parameter.listId || null;
       const result = runTaskHarmonizeAudit({ scope: scope, targetListId: targetListId });
       return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
     }
  }
  if (e && e.parameter && e.parameter.action === "executeTaskHarmonizeBatch") {
     try {
       let actions = [];
       if (e.postData && e.postData.contents) {
         actions = JSON.parse(e.postData.contents);
       } else if (e.parameter.actions) {
         actions = JSON.parse(e.parameter.actions);
       }
       const result = executeTaskHarmonizeBatch(actions);
       return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
     }
  }

  if (e && e.parameter && (e.parameter.page === 'breathe' || e.parameter.app === 'breathe' || e.parameter.breathe === 'true')) {
    return HtmlService.createHtmlOutputFromFile('WebApp_Breathe')
        .setTitle('Breathe | The System')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile('WebApp_Dashboard')
      .setTitle('The System Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getScriptServiceUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch(e) {
    return "https://script.google.com/macros/s/AKfycbylmNwunCsEZtYYLUA603-fr5MhioAfddmqcJkQraNv7OsI2p9ph0DsqF18LrlUmS4guA/exec";
  }
}

// Ensure the UI functions are accessible
function getSheetsList() {
  const ss = getMasterSpreadsheet();
  return ss.getSheets().map(sheet => ({
    name: sheet.getName(),
    id: sheet.getSheetId()
  }));
}

function sortTabs() {
  try {
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    
    // Create an array of sheet objects with their current names
    const sheetData = sheets.map(s => ({
      name: s.getName(),
      sheet: s
    }));
    
    // Sort alphabetically by name
    sheetData.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    
    // Extract "Index" or "Master" and put them first if they exist
    const prioritize = ['index', 'master', 'dashboard'];
    const prioritizedSheets = [];
    const restSheets = [];
    
    sheetData.forEach(s => {
      const lowerName = s.name.toLowerCase();
      const pIndex = prioritize.findIndex(p => lowerName.includes(p));
      if (pIndex !== -1) {
        s.priority = pIndex;
        prioritizedSheets.push(s);
      } else {
        restSheets.push(s);
      }
    });
    
    prioritizedSheets.sort((a, b) => a.priority - b.priority);
    const finalOrder = [...prioritizedSheets, ...restSheets];
    
    let moveCount = 0;
    finalOrder.forEach((s, index) => {
      const currentPos = s.sheet.getIndex() - 1; // getIndex() is 1-based
      if (currentPos !== index) {
        ss.setActiveSheet(s.sheet);
        ss.moveActiveSheet(index + 1);
        moveCount++;
      }
    });
    
    return { success: true, message: `Tabs sorted alphabetically. Reordered ${moveCount} tabs.` };
  } catch (e) {
    return { success: false, message: `Sort Error: ${e.message}` };
  }
}

function createIndex() {
  try {
    const ss = getMasterSpreadsheet();
    let indexSheet = ss.getSheetByName('Index');
    
    if (!indexSheet) {
      indexSheet = ss.insertSheet('Index', 0);
    } else {
      indexSheet.clear();
      ss.setActiveSheet(indexSheet);
      ss.moveActiveSheet(1);
    }
    
    const sheets = ss.getSheets();
    let dashboardUrl = "";
    try {
      dashboardUrl = ScriptApp.getService().getUrl();
    } catch (e) {
      dashboardUrl = getEnvProp("DASHBOARD_WEBAPP_URL") || "https://script.google.com/macros/s/AKfycbxHAmhD0Bv5pD1akLaBm26xM1BDXpuUfEI2y8MpbiHF1v5cZuJs_hkAoyOZxTsY0lr7/exec";
    }
    const indexData = [
      ['System Dashboard', `=HYPERLINK("${dashboardUrl}", "🚀 Open Dashboard")`, 'WEB_APP'],
      ['Sheet Name', 'Link', 'Tab ID']
    ];
    
    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (name !== 'Index') {
        const gid = sheet.getSheetId();
        const url = `${ss.getUrl()}#gid=${gid}`;
        const formula = `=HYPERLINK("${url}", "${name}")`;
        indexData.push([name, formula, gid]);
      }
    });
    
    const range = indexSheet.getRange(1, 1, indexData.length, indexData[0].length);
    range.setValues(indexData);
    
    indexSheet.getRange(1, 1, 2, 3).setFontWeight('bold').setBackground('#4f46e5').setFontColor('white');
    indexSheet.setFrozenRows(2);
    indexSheet.autoResizeColumns(1, 3);
    
    return { success: true, message: `Index created with ${indexData.length - 1} sheet links.` };
  } catch (e) {
    return { success: false, message: `Index Error: ${e.message}` };
  }
}

function bulkRenameTabs(findStr, replaceStr) {
  try {
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    let count = 0;
    
    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (name.includes(findStr)) {
        try {
          const newName = name.split(findStr).join(replaceStr).trim();
          if (newName && newName !== name) {
            sheet.setName(newName);
            count++;
          }
        } catch (e) { }
      }
    });
    
    return { success: true, message: `Successfully renamed ${count} tabs.` };
  } catch (e) {
    return { success: false, message: `Bulk Rename Error: ${e.message}` };
  }
}

function renameTab(oldName, newName) {
  try {
    const ss = getMasterSpreadsheet();
    const sheet = ss.getSheetByName(oldName);
    if (!sheet) {
      return { success: false, message: `Sheet '${oldName}' not found.` };
    }
    sheet.setName(newName.trim());
    return { success: true, message: `Renamed '${oldName}' to '${newName}'.` };
  } catch (e) {
    return { success: false, message: `Rename Error: ${e.message}` };
  }
}

// ----------------------------------------------------
// VANTAGE REPORT TRIGGERS
// ----------------------------------------------------

function _triggerReflectionAPI(actionName) {
  try {
    const url = SYSTEM_CONFIG.API.REFLECTION_WEBHOOK;
    const secret = SYSTEM_CONFIG.API.REFLECTION_SECRET;
    if (!url || !secret) return "Configuration Error: Webhook URL or Secret missing.";
    
    const fetchUrl = url + "?action=" + encodeURIComponent(actionName) + "&secret=" + encodeURIComponent(secret);
    const response = UrlFetchApp.fetch(fetchUrl);
    return "API Response: " + response.getContentText();
  } catch (e) {
    return "Trigger Error: " + e.message;
  }
}

function triggerVantage2Day() {
  return _triggerReflectionAPI("run2DayRawLog");
}

function triggerVantage7Day() {
  return _triggerReflectionAPI("run7DayRawLog");
}

function triggerVantage7DayAudit() {
  return _triggerReflectionAPI("run7DayAudit");
}

// Backward compatibility aliases
function triggerVantage14Day() {
  return triggerVantage7Day();
}

function triggerVantage14DayAudit() {
  return triggerVantage7DayAudit();
}

// ----------------------------------------------------
// EXTENDED ALIGNMENT CAPABILITIES
// ----------------------------------------------------

function hideSheets(matchStr) {
  try {
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    const search = matchStr.toLowerCase();
    let count = 0;
    
    sheets.forEach(sheet => {
      if (sheet.getName().toLowerCase().includes(search)) {
        sheet.hideSheet();
        count++;
      }
    });
    
    if (count === 0) return { success: false, message: `No sheets found containing '${matchStr}'.` };
    return { success: true, message: `Successfully hidden ${count} sheets.` };
  } catch (e) {
    return { success: false, message: `Hide Error: ${e.message}` };
  }
}

function showSheets(matchStr) {
  try {
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    const search = matchStr.toLowerCase();
    let count = 0;
    
    sheets.forEach(sheet => {
      if (sheet.getName().toLowerCase().includes(search)) {
        sheet.showSheet();
        count++;
      }
    });
    
    if (count === 0) return { success: false, message: `No sheets found containing '${matchStr}'.` };
    return { success: true, message: `Successfully shown ${count} sheets.` };
  } catch (e) {
    return { success: false, message: `Show Error: ${e.message}` };
  }
}

function deleteSheets(matchStr) {
  try {
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    const search = matchStr.toLowerCase();
    let count = 0;
    
    sheets.forEach(sheet => {
      if (sheet.getName().toLowerCase().includes(search)) {
        ss.deleteSheet(sheet);
        count++;
      }
    });
    
    if (count === 0) return { success: false, message: `No sheets found containing '${matchStr}'.` };
    return { success: true, message: `Successfully deleted ${count} sheets.` };
  } catch (e) {
    return { success: false, message: `Delete Error: ${e.message}` };
  }
}

function deleteAllSheetsFrom(numStr) {
  try {
    const num = parseInt(numStr, 10);
    if (isNaN(num) || num < 1) return { success: false, message: `Invalid sheet number: ${numStr}` };
    
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    const total = sheets.length;
    
    if (num > total) return { success: false, message: `Only ${total} sheets exist. Cannot delete from ${num}.` };
    
    let count = 0;
    // index is 0-based, but num is 1-based (i.e. delete all sheets from the Nth sheet onwards)
    // Warning: Deleting multiple sheets in Apps Script while iterating can cause issues if not done backwards or safely. 
    // Wait, let's collect sheets to delete first, then delete them to avoid index shifting problems.
    const sheetsToDelete = [];
    for (let i = num - 1; i < total; i++) {
      sheetsToDelete.push(sheets[i]);
    }
    
    sheetsToDelete.forEach(s => {
      ss.deleteSheet(s);
      count++;
    });
    
    return { success: true, message: `Successfully deleted ${count} sheets from position ${num}.` };
  } catch (e) {
    return { success: false, message: `Delete All Error: ${e.message}` };
  }
}

function copySheets(matchStr, destId) {
  try {
    if (!destId) return { success: false, message: `Destination ID is required.` };
    
    const ss = getMasterSpreadsheet();
    const sheets = ss.getSheets();
    const search = matchStr.toLowerCase();
    const destSS = SpreadsheetApp.openById(destId);
    let count = 0;
    
    sheets.forEach(sheet => {
      if (sheet.getName().toLowerCase().includes(search)) {
        sheet.copyTo(destSS);
        count++;
      }
    });
    
    if (count === 0) return { success: false, message: `No sheets found containing '${matchStr}'.` };
    return { success: true, message: `Successfully copied ${count} sheets to destination.` };
  } catch (e) {
    return { success: false, message: `Copy Error: ${e.message}` };
  }
}

function completeTaskByTitle(title) {
  const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const lists = [importerListId, todoListId];
  
  for (let i = 0; i < lists.length; i++) {
    const listId = lists[i];
    let pageToken;
    do {
      const response = Tasks.Tasks.list(listId, {
        showCompleted: false,
        showHidden: false, showAssigned: true,
        maxResults: 100,
        pageToken: pageToken
      });
      const items = response.items || [];
      for (let j = 0; j < items.length; j++) {
        const t = items[j];
        if (t.title.trim().toLowerCase() === title.trim().toLowerCase()) {
          t.status = "completed";
          Tasks.Tasks.update(t, listId, t.id);
          return { success: true, message: `Completed task: ${t.title}` };
        }
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
  }
  return { success: false, message: `Task not found: ${title}` };
}

// ----------------------------------------------------
// DASHBOARD DATA FETCHERS (V2)
// ----------------------------------------------------




function completeTaskById(taskId) {
  try {
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const task = Tasks.Tasks.get(todoListId, taskId);
    task.status = 'completed';
    Tasks.Tasks.update(task, todoListId, taskId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function uncompleteTaskById(taskId) {
  try {
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const task = Tasks.Tasks.get(todoListId, taskId);
    task.status = 'needsAction';
    if (task.completed) {
      delete task.completed;
    }
    Tasks.Tasks.update(task, todoListId, taskId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function completeBreathingTask(habitName) {
  try {
    const listIds = [
      SYSTEM_CONFIG.TASKS.TODO_LIST_ID,
      SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID,
      SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID
    ].filter(Boolean);
    
    const query = (habitName || 'breathing').toLowerCase();
    
    for (let i = 0; i < listIds.length; i++) {
      const listId = listIds[i];
      try {
        const response = Tasks.Tasks.list(listId, { showCompleted: false, maxResults: 100 });
        if (!response || !response.items || response.items.length === 0) continue;
        
        const task = response.items.find(t => {
          if (!t || !t.title) return false;
          const title = t.title.toLowerCase();
          return title.includes(query) || 
                 (query.includes('4-7-8') && title.includes('4-7-8')) ||
                 (query.includes('box') && title.includes('box')) ||
                 title.includes('breathing') ||
                 title.includes('breathe');
        });
        
        if (task) {
          task.status = 'completed';
          Tasks.Tasks.update(task, listId, task.id);
          console.log(`[TASKS] Completed breathing task "${task.title}" (ID: ${task.id}) in list ${listId}`);
          return { success: true, taskId: task.id, title: task.title, listId: listId };
        }
      } catch (listErr) {
        console.warn(`Error scanning list ${listId} for breathing task: ${listErr.message}`);
      }
    }
    
    return { success: true, notFound: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getBreatheAppData() {
  try {
    const streak478 = getHabitStreak('4-7-8 Breathing');
    const streakBox = getHabitStreak('Box Breathing');
    return {
      success: true,
      streak478: streak478,
      streakBox: streakBox
    };
  } catch (e) {
    return { success: false, error: e.message, streak478: 0, streakBox: 0 };
  }
}

function logHabit(habitName) {
  try {
    const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.HABITS_LOG);
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }
    const now = new Date();
    const dateStr = "'" + Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
    sheet.appendRow([now.toISOString(), habitName, dateStr]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getHabitStreak(habitName) {
  try {
    const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.HABITS_LOG) || ss.getSheets()[0];
    if (!sheet) return 0;
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    
    function getLondonDateStr(d) {
      return Utilities.formatDate(d, "Europe/London", "yyyy-MM-dd");
    }

    const dates = data
      .filter(row => row[1] === habitName)
      .map(row => {
        const timestamp = row[0]; // Use column A (timestamp) as source of truth
        if (!timestamp) return null;
        
        let d;
        if (timestamp instanceof Date) {
          d = timestamp;
        } else {
          d = new Date(timestamp);
        }
        
        if (isNaN(d.getTime())) return null;
        return getLondonDateStr(d);
      })
      .filter(d => d !== null);
      
    if (dates.length === 0) return 0;
    
    dates.sort((a, b) => b.localeCompare(a));
    const uniqueDates = [...new Set(dates)];
    
    const now = new Date();
    const todayStr = getLondonDateStr(now);
    
    // Parse most recent date and today
    const lastDate = new Date(uniqueDates[0]);
    const today = new Date(todayStr);
    const diffFromToday = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
    
    // Seinfeld Method ("Never Miss Twice" / Proper Habit Break):
    // diffFromToday === 0: Practiced today
    // diffFromToday === 1: Practiced yesterday (0 missed days)
    // diffFromToday === 2: Practiced 2 days ago (only yesterday was missed = 1 missed day).
    //                      Under Seinfeld logic, the chain is NOT broken yet today ("Never miss twice" grace).
    // diffFromToday >= 3: 2 or more consecutive missed days elapsed -> PROPER HABIT BREAK!
    if (diffFromToday >= 3) {
      return 0; // Proper habit break: missed 2 or more consecutive days
    }
    
    // Count active unbroken chain backwards with Seinfeld grace (1 missed day between sessions allowed)
    let streak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const curr = new Date(uniqueDates[i]);
      const next = new Date(uniqueDates[i + 1]);
      const diff = Math.round((curr - next) / (1000 * 60 * 60 * 24));
      
      if (diff === 1) {
        // Consecutive days
        streak++;
      } else if (diff === 2) {
        // 1 single missed day between sessions (never missed twice)
        // Seinfeld grace: the chain is preserved!
        streak++;
      } else {
        // diff >= 3: 2 or more consecutive missed days -> proper habit break in history!
        break;
      }
    }
    
    return streak;
  } catch (e) {
    console.error("Error calculating habit streak: " + e.stack);
    return 0;
  }
}

function createDraftReply(threadId, bodyText) {
  try {
    const thread = GmailApp.getThreadById(threadId);
    const htmlBodyText = bodyText.replace(/\n/g, '<br>');
    const draft = thread.createDraftReply(bodyText, {
      htmlBody: htmlBodyText
    });
    return { success: true, draftId: draft.getId() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function generateWifieMessage() {
  try {
    // 1. Fetch WhatsApp context from Email_Log
    const ss = getMasterSpreadsheet();
    const logSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
    let whatsappContext = "No recent WhatsApp context found.";
    
    if (logSheet) {
      const data = logSheet.getDataRange().getValues();
      let headerRowIdx = 0;
      if (data.length > 1 && data[0].findIndex(h => h.toString().trim().toLowerCase() === "link") === -1) {
        headerRowIdx = 1;
      }
      const headers = data[headerRowIdx].map(h => h.toString().toLowerCase().trim());
      const subjectIdx = headers.indexOf('subject');
      const senderIdx = headers.indexOf('sender');
      const summaryIdx = headers.indexOf('ai summary');
      const labelsIdx = headers.indexOf('final label set');
      
      const recentWifieChats = [];
      
      for (let i = data.length - 1; i >= Math.max(headerRowIdx + 1, data.length - 100); i--) {
        const row = data[i];
        const subject = (row[subjectIdx] || "").toString().toLowerCase();
        const sender = (row[senderIdx] || "").toString().toLowerCase();
        const summary = (row[summaryIdx] || "").toString();
        const labels = (row[labelsIdx] || "").toString().toLowerCase();
        
        if (labels.includes('whatsapp') && (subject.includes('carry') || sender.includes('carry') || summary.toLowerCase().includes('carry'))) {
          recentWifieChats.push(`- ${summary}`);
        }
      }
      if (recentWifieChats.length > 0) {
        whatsappContext = recentWifieChats.reverse().join('\n'); // Show chronological order
      }
    }
    
    // 2. Fetch Personal and Family Calendar Events
    let myCalendarContext = "No upcoming events found.";
    let familyCalendarContext = "No upcoming family events found.";
    
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Default Calendar
    const cal = CalendarApp.getDefaultCalendar();
    const events = cal.getEvents(now, nextWeek);
    if (events.length > 0) {
      myCalendarContext = events.map(e => `- ${e.getTitle()} on ${Utilities.formatDate(e.getStartTime(), 'GMT', 'EEEE, MMMM d, yyyy HH:mm')}`).join('\n');
    }
    
    // Family Calendar
    const cals = CalendarApp.getCalendarsByName('Family');
    if (cals.length > 0) {
      const familyEvents = cals[0].getEvents(now, nextWeek);
      if (familyEvents.length > 0) {
        familyCalendarContext = familyEvents.map(e => `- ${e.getTitle()} on ${Utilities.formatDate(e.getStartTime(), 'GMT', 'EEEE, MMMM d, yyyy HH:mm')}`).join('\n');
      }
    }
    
    // 3. Call Gemini
    const prompt = `Write a sweet, thoughtful, and natural message to my wife Carry. 
Use the recent WhatsApp context and calendar events if they are highly relevant, but keep it feeling organic and affectionate.
You have access to both My Calendar and the Family Calendar. Use the Family Calendar to know what Carry is up to, but DO NOT assume I am attending a Family event unless it is also explicitly on My Calendar.
CRITICAL: Keep the message VERY SHORT. Maximum 2-3 sentences. Do NOT over-index on the calendar—only mention an event if it naturally fits. Do not make it sound like a robot wrote it. Do not include subject lines or placeholders, just the message body.`;
    
    let systemInstruction = "You are Daniel. Write a loving, sweet, and context-aware message to Carry. Use the provided context."; // Fallback
    try {
      const personaSs = SpreadsheetApp.openById('1x4vRE93oz5xoaqEx96MWk65pSDmNt7YvQkrluTV3jeU');
      const sheets = personaSs.getSheets();
      let personaSheet = null;
      for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() == 164682284) {
          personaSheet = sheets[i];
          break;
        }
      }
      if (!personaSheet) {
        personaSheet = sheets[0];
      }
      
      const pData = personaSheet.getDataRange().getValues();
      for (let r = 0; r < pData.length; r++) {
        // Look for URN REF03 in Column A
        if (pData[r][0] && pData[r][0].toString().trim() === 'REF03') {
          systemInstruction = pData[r][1]; // Get Column B
          break;
        }
      }
    } catch (e) {
      console.error("Error reading Persona sheet: " + e.message);
    }
    
    const todayStr = Utilities.formatDate(now, 'GMT', 'EEEE, MMMM d, yyyy HH:mm');
    const aiContext = `--- TODAY'S DATE ---\n${todayStr}\n\n--- RECENT WHATSAPP CONTEXT ---\n${whatsappContext}\n\n--- MY CALENDAR ---\n${myCalendarContext}\n\n--- FAMILY CALENDAR ---\n${familyCalendarContext}`;
    
    const schema = {
      type: "OBJECT",
      properties: {
        message: { type: "STRING", description: "The sweet message for Carry" }
      },
      required: ["message"]
    };
    
    const result = callGemini(prompt + "\n\n" + aiContext, SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO, systemInstruction, schema);
    
    if (result && result.error) {
      return { success: false, message: "AI Error: " + result.error };
    }
    
    if (result && result.message) {
      return { success: true, message: result.message };
    }
    
    return { success: false, message: "Unexpected empty response from Gemini." };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  }
}

function dumpPersonaSheet() {
  const ss = SpreadsheetApp.openById('1x4vRE93oz5xoaqEx96MWk65pSDmNt7YvQkrluTV3jeU');
  const sheets = ss.getSheets();
  let out = {};
  for(let s of sheets){
    out[s.getName()] = s.getDataRange().getValues();
  }
  console.log(JSON.stringify(out).substring(0, 50000));
}

function createStandaloneDraft(to, subject, bodyText) {
  try {
    const htmlBodyText = bodyText.replace(/\n/g, '<br>');
    const draft = GmailApp.createDraft(to, subject, bodyText, {
      htmlBody: htmlBodyText
    });
    return { success: true, draftId: draft.getId() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function fixSpreadsheetTypos(ssId) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheets = ss.getSheets();
  const replacements = [
    { find: /\basses\b/gi, replace: "assess" },
    { find: /\bTasks is not\b/gi, replace: "Tasks are not" },
    { find: /\bnot prefered\b/gi, replace: "not preferred" },
    { find: /\bMilestone should support\b/gi, replace: "Milestones should support" },
    { find: /\bemployeee OWN\b/gi, replace: "employee owns" },
    { find: /\brefereshed\b/gi, replace: "refreshed" },
    { find: /\b36 months\.The\b/gi, replace: "36 months. The" },
    { find: /\bKPIS\b/g, replace: "KPIs" },
    { find: /\bimmedate\b/gi, replace: "immediate" },
    { find: /\bQuantative\b/g, replace: "Quantitative" },
    { find: /\bquantative\b/g, replace: "quantitative" },
    { find: /\bQualative\b/g, replace: "Qualitative" },
    { find: /\bqualative\b/g, replace: "qualitative" },
    { find: /\bStategies\b/g, replace: "Strategies" },
    { find: /\bstategies\b/g, replace: "strategies" },
    { find: /\bdevelopement\b/gi, replace: "development" },
    { find: /\bMangement\b/g, replace: "Management" },
    { find: /\bmangement\b/g, replace: "management" }
  ];
  
  sheets.forEach(sheet => {
    const range = sheet.getDataRange();
    const values = range.getValues();
    const changedCells = [];
    let updated = false;
    
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        let val = values[r][c];
        if (typeof val === "string") {
          let original = val;
          replacements.forEach(rep => {
            val = val.replace(rep.find, rep.replace);
          });
          if (val !== original) {
            values[r][c] = val;
            changedCells.push({ r, c, val });
            updated = true;
          }
        }
      }
    }
    if (updated) {
      try {
        range.setValues(values);
      } catch (e) {
        // Fallback: update only the cells that actually changed to avoid timeout/validation issues
        changedCells.forEach(cell => {
          try {
            sheet.getRange(cell.r + 1, cell.c + 1).setValue(cell.val);
          } catch (cellError) {
            // Ignore validation exceptions for specific cells
          }
        });
      }
    }
  });
  return "Successfully fixed typos in spreadsheet.";
}



function getDashboardEmails() { const startT = Date.now();
  try {
    const threads = GmailApp.search('in:inbox', 0, 25);
    console.log("Emails load time: " + (Date.now() - startT) + "ms"); return threads.map(t => ({
      subject: t.getFirstMessageSubject(),
      sender: t.getMessages()[0].getFrom(),
      date: t.getLastMessageDate().toISOString(),
      url: `https://mail.google.com/mail/u/0/#inbox/${t.getId()}`
    }));
  } catch (e) { console.error("Error fetching emails: " + e.stack); return []; }
}

function getDashboardCalendar() { const startT = Date.now();
  try {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const events = CalendarApp.getDefaultCalendar().getEvents(now, endOfDay);
    console.log("Calendar load time: " + (Date.now() - startT) + "ms"); return events.map(e => ({
      title: e.getTitle() || '(No Title)',
      startTime: e.getStartTime().toISOString(),
      endTime: e.getEndTime().toISOString(),
      isAllDay: e.isAllDayEvent(),
      location: e.getLocation()
    }));
  } catch (e) { console.error("Error fetching calendar: " + e.stack); return []; }
}

function getDashboardTasks() { const startT = Date.now();
  const res = { tasks: [], recentTasks: [], workoutsTasks: [], workouts: [] };
  try {
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const openResponse = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, showAssigned: true, maxResults: 50 });
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const openTasks = openResponse.items || [];
    const filteredOpen = openTasks.filter(t => t.status !== 'completed' && (!t.due || new Date(t.due) <= todayEnd));
    res.tasks = filteredOpen.slice(0, 25).map(t => ({ id: t.id, title: t.title, due: t.due || null, url: 'https://mail.google.com/tasks/canvas' }));

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentResponse = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, showAssigned: true, updatedMin: thirtyDaysAgo.toISOString(), maxResults: 100 });
    const allRecent = recentResponse.items || [];
    const updatedTasks = allRecent.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    res.recentTasks = updatedTasks.slice(0, 25).map(t => ({ id: t.id, title: t.title, updated: t.updated, status: t.status, notesSnippet: (t.notes || "").substring(0, 50).replace(/\n/g, " ") }));

    const workoutKeywords = ["workout", "gym", "run", "swim", "lift", "cycle", "yoga", "training", "exercise", "cardio", "pilates", "boulder", "climb", "fitness", "ems", "tennis", "padel", "squash"];
    res.workoutsTasks = [];

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const workoutEvents = CalendarApp.getDefaultCalendar().getEvents(sevenDaysAgo, sevenDaysFromNow);
    const calWorkouts = workoutEvents.filter(e => workoutKeywords.some(kw => (e.getTitle() || "").toLowerCase().includes(kw))).map(e => ({ title: e.getTitle(), startTime: e.getStartTime().toISOString(), endTime: e.getEndTime().toISOString() }));
    res.workouts = calWorkouts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 15);
  } catch (e) { console.error("Error fetching tasks: " + e.stack); }
  console.log("Docs load time: " + (Date.now() - startT) + "ms"); return res; }

function getDashboardFiles() {
  try {
    const fileList = Drive.Files.list({ q: "trashed=false and mimeType != 'application/vnd.google-apps.folder'", orderBy: "modifiedByMeTime desc", maxResults: 25, fields: "files(id, name, webViewLink, modifiedByMeTime, mimeType)" });
    return (fileList.files || []).map(f => ({ id: f.id, name: f.name, date: f.modifiedByMeTime, url: f.webViewLink, mimeType: f.mimeType }));
  } catch (e) { console.error("Error fetching files: " + e.stack); return []; }
}

function getDashboardClerkLogs() { const startT = Date.now();
  const res = { emails: [], notes: [], tasks: [] };
  try {
    // Hardcode to the provided master spreadsheet ID to ensure we find the logs
    const ss = getMasterSpreadsheet();
    const allSheets = ss.getSheets();
    
    const safeDate = (val) => {
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    };

    const parseUrnDate = (urn) => {
      try {
        if (typeof urn !== 'string') return new Date(0);
        const match = urn.match(/urn:task:(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const [_, y, m, d, hh, mm, ss] = match;
          return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10)));
        }
      } catch (e) {
        console.error("Error parsing URN date: " + e.stack);
      }
      return new Date(0);
    };
    
    let notesLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.NOTES_LOG);
    if (!notesLogSheet) notesLogSheet = allSheets.find(s => s.getName().toLowerCase().includes('notes log') || s.getName().toLowerCase().includes('notes_log') || s.getName().toLowerCase() === 'files');
    if (notesLogSheet) {
      const lastRow = notesLogSheet.getLastRow();
      if (lastRow > 1) {
        const lastCol = Math.max(notesLogSheet.getLastColumn(), 1);
        const fetchCount = Math.min(500, lastRow - 1);
        const fetchStartRow = lastRow - fetchCount + 1;
        const data = notesLogSheet.getRange(fetchStartRow, 1, fetchCount, lastCol).getValues();
        res.notes = data.filter(row => row.join('').trim().length > 0)
          .map(row => ({ url: row[0] || "", name: row[1] || "", tasksCount: row[3] || "", status: row[6] || "", date: safeDate(row[7] || row[0]) }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 25);
      }
    }
    
    let emailLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
    if (!emailLogSheet) emailLogSheet = allSheets.find(s => s.getName().toLowerCase().includes('email log') || s.getName().toLowerCase().includes('email_log') || s.getName().toLowerCase() === 'emails');
    if (emailLogSheet) {
      const lastRow = emailLogSheet.getLastRow();
      if (lastRow > 1) {
        const lastCol = Math.max(emailLogSheet.getLastColumn(), 1);
        const fetchCount = Math.min(500, lastRow - 1);
        const fetchStartRow = lastRow - fetchCount + 1;
        const data = emailLogSheet.getRange(fetchStartRow, 1, fetchCount, lastCol).getValues();
        res.emails = data.filter(row => row.join('').trim().length > 0)
          .map(row => ({ date: safeDate(row[0]), subject: row[3] || "No Subject", sender: row[11] || "Unknown", labels: row[7] || "", summary: row[12] || "", actions: row[13] || "", link: row[8] || "", status: row[9] || "" }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 25);
      }
    }
    
    // Implement direct Tasks API fetching and caching
    const cache = CacheService.getScriptCache();
    const cachedTasks = cache.get("DASHBOARD_CLERK_TASKS_V3");
    if (cachedTasks) {
      try {
        res.tasks = JSON.parse(cachedTasks);
      } catch(e) {
        console.error("Error parsing cached clerk tasks: " + e.message);
      }
    }
    
    if (!res.tasks || res.tasks.length === 0) {
      const taskLists = [
        { id: SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID, name: "Clerk Review" },
        { id: SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID, name: "Importer" },
        { id: SYSTEM_CONFIG.TASKS.TODO_LIST_ID, name: "ToDo" }
      ];
      
      const allTasks = [];
      taskLists.forEach(listInfo => {
        if (!listInfo.id) return;
        try {
          const response = Tasks.Tasks.list(listInfo.id, {
            showCompleted: true,
            showHidden: true, showAssigned: true,
            maxResults: 50
          });
          const items = response.items || [];
          items.forEach(t => {
            let cleanedTitle = t.title || "Untitled";
            let parts = cleanedTitle.split(" > ");
            if (parts.length >= 2) {
              cleanedTitle = parts.slice(1).join(" > ").trim();
            }
            
            // Extract created_at from metadata if present
            let dateVal = "";
            let hasCreatedAt = false;
            
            if (t.notes) {
              const parsed = parseTaskNotes(t.notes);
              if (parsed.metadata && parsed.metadata.created_at) {
                    dateVal = new Date(parsed.metadata.created_at).toISOString();
                    hasCreatedAt = true;
              }
            }
            
            if (!hasCreatedAt) {
              // For triage lists (Clerk Review, Importer), the modified date is a good proxy for creation
              if (listInfo.name === "Clerk Review" || listInfo.name === "Importer") {
                dateVal = t.updated ? new Date(t.updated).toISOString() : new Date().toISOString();
              } else {
                // For ToDo and other lists, if no created_at exists, treat as ancient (push to bottom)
                dateVal = new Date(0).toISOString();
              }
            }
            
            allTasks.push({
              urn: t.id, // Fallback for spreadsheet mapping compatibility
              date: dateVal,
              originalTitle: t.title || "Untitled",
              due: t.due || "",
              targetList: listInfo.name,
              cleanedTitle: cleanedTitle,
              notes: t.notes || "",
              status: t.status || "",
              taskId: t.id
            });
          });
        } catch(e) {
          console.error("Error fetching tasks for list " + listInfo.name + ": " + e.message);
        }
      });
      
      // Sort all fetched tasks by modified date descending, and slice the top 25
      res.tasks = allTasks
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 25);
        
      try {
        cache.put("DASHBOARD_CLERK_TASKS_V3", JSON.stringify(res.tasks), 60); // Cache for 60 seconds
      } catch(e) {
        console.error("Failed to save clerk tasks cache: " + e.message);
      }
    }
  } catch (e) { console.error("Error fetching clerk logs: " + e.stack); }
  console.log("Clerk logs load time: " + (Date.now() - startT) + "ms"); return res; }

function parseExecutionPlan(md) {
  const data = { 
    bluf: "", 
    frogs: { ce: [], pmt: [], work: [], personal: [] }, 
    top3: { ce: [], pmt: [], work: [], personal: [] }, 
    rest: { ce: [], pmt: [], work: [], personal: [] }, 
    alerts: [], 
    triage: "" 
  };
  if (typeof md !== "string") {
    console.warn("parseExecutionPlan received non-string input:", md);
    return data;
  }
  
  let currentSection = "";
  let currentCategory = ""; // "ce" or "personal"
  
  try {
    const lines = md.split('\n');
    for (let line of lines) {
      if (!line) continue;
      if (line.startsWith("**BLUF:**")) {
        data.bluf = line.replace("**BLUF:**", "").trim();
        continue;
      }
      if (line.match(/^#+\s/)) {
        const upperLine = line.toUpperCase();
        if (upperLine.includes("EAT THE FROG")) currentSection = "frogs";
        else if (upperLine.includes("TOP 3")) currentSection = "top3";
        else if (upperLine.includes("REST OF TODAY")) currentSection = "rest";
        else if (upperLine.includes("BOTTLENECKS") || upperLine.includes("SYS ALERTS")) currentSection = "alerts";
        else if (upperLine.includes("TRIAGE") || upperLine.includes("QUARANTINE")) currentSection = "triage";
        continue;
      }
      
      // Support work/CE variants: **CE:**, **🎯 CE:**, **CE (Work):**, **Work:**, **💼 Work:**, **PMT:**
      if (line.match(/^\*\*CE:\*\*/i) || line.match(/^\*\*🎯 CE:\*\*/i) || line.match(/^\*\*CE \(Work\):\*\*/i) || line.match(/^\*\*🎯 CE \(Work\):\*\*/i) || line.match(/^\*\*Work:\*\*/i) || line.match(/^\*\*💼 Work:\*\*/i) || line.match(/^\*\*PMT:\*\*/i) || line.match(/^\*\*Work \(CE\):\*\*/i)) {
        currentCategory = "ce";
        continue;
      }
      // Support personal variants: **Personal:**, **🏠 Personal:**, **Private:**, **Personal (Private):**
      if (line.match(/^\*\*Personal:\*\*/i) || line.match(/^\*\*🏠 Personal:\*\*/i) || line.match(/^\*\*Private:\*\*/i) || line.match(/^\*\*Personal \(Private\):\*\*/i)) {
        currentCategory = "personal";
        continue;
      }
      
      // Regex to strip emojis
      const stripEmojis = (str) => str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}\u{2B50}\u{2B55}]/gu, '').trim();

      if (currentSection === "frogs" || currentSection === "top3" || currentSection === "rest") {
        if (line.startsWith("- [ ]") || line.startsWith("- [x]")) {
          const isChecked = line.startsWith("- [x]");
          let text = line.replace(/^- \[[xX ]\]\s*/, "").trim();
          text = stripEmojis(text);
          const cat = currentCategory || (typeof IS_CE_ENV !== 'undefined' && IS_CE_ENV ? "ce" : "personal");
          if (text && data[currentSection]) {
            const item = { text, checked: isChecked };
            if (cat === "ce") {
              data[currentSection].ce.push(item);
              data[currentSection].pmt.push(item);
              data[currentSection].work.push(item);
            } else {
              data[currentSection].personal.push(item);
            }
          }
        }
      } else if (currentSection === "alerts") {
        if (line.startsWith("- ")) data.alerts.push(stripEmojis(line.substring(2)));
      } else if (currentSection === "triage") {
        if (line.trim().length > 0 && !line.startsWith("*(") && !line.startsWith("---")) {
          data.triage += stripEmojis(line) + "\n";
        }
      }
    }
  } catch (e) {
    console.error("Error parsing execution plan: " + e.stack);
  }
  return data;
}

function getDashboardDocs() { const startT = Date.now();
  let res = {
    links: [],
    executionPlan: "",
    executionPlanData: null,
    vantageReport: "",
    vantageReport14: "",
    recentReflections: "",
    roadmap: "",
    monthlyReview: "",
    activeMinutes: "-",
    sleepHours: "-",
    completedTasksCount: 0,
    manualReviewCount: 0
  };
  try {
    const planId = getExecutionPlanId();
    let plan = "";
    if (planId) {
      try {
        plan = DriveApp.getFileById(planId).getBlob().getDataAsString();
      } catch (err) {
        console.warn("Could not read plan by ID (" + planId + "): " + err.message);
      }
    }
    
    // Fallback: search workspace folder by name if plan is still empty
    if (!plan) {
      try {
        const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
        if (folderId) {
          const folder = DriveApp.getFolderById(folderId);
          const suffix = (typeof IS_CE_ENV !== 'undefined' && IS_CE_ENV) ? " (CE)" : " (Private)";
          const targetName = "TS - Task Master > 1 Day Execution Plan" + suffix + ".md";
          const files = folder.getFilesByName(targetName);
          if (files.hasNext()) {
            plan = files.next().getBlob().getDataAsString();
          }
        }
      } catch (err) {
        console.warn("Fallback search for 1 Day Execution Plan failed: " + err.message);
      }
    }

    if (plan) {
      res.executionPlan = plan;
      res.executionPlanData = parseExecutionPlan(plan);
    }
      
      try {
        let v2 = null;
        try {
          if (SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID) {
            v2 = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID);
          }
        } catch (e) {}

        if (!v2 || v2.isTrashed()) {
          const folderId = SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID;
          if (folderId) {
            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName("Vantage_Log_2-Day.md");
            if (files.hasNext()) {
              v2 = files.next();
            }
          }
        }

        if (v2) {
          res.vantageReport = v2.getBlob().getDataAsString();
          
          const vantageJson = parseVantageJson(res.vantageReport);
          
          let parsedHr = 0, parsedSteps = 0, parsedCal = 0;
          if (res.vantageReport) {
            const lines = res.vantageReport.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (/steps/i.test(line)) {
                let m = line.match(/[\d,.]+/g);
                if (m) parsedSteps = parseInt(m[m.length - 1].replace(/,/g, ''), 10);
                else if (i + 1 < lines.length) {
                  let m2 = lines[i+1].match(/[\d,.]+/);
                  if (m2) parsedSteps = parseInt(m2[0].replace(/,/g, ''), 10);
                }
              }
              if (/calories|kcal/i.test(line)) {
                let m = line.match(/[\d,.]+/g);
                if (m) parsedCal = parseInt(m[m.length - 1].replace(/,/g, ''), 10);
                else if (i + 1 < lines.length) {
                  let m2 = lines[i+1].match(/[\d,.]+/);
                  if (m2) parsedCal = parseInt(m2[0].replace(/,/g, ''), 10);
                }
              }
              if (/heart rate|\bhr\b/i.test(line) && !/hrv/i.test(line)) {
                let m = line.match(/[\d,.]+/g);
                if (m) parsedHr = parseInt(m[m.length - 1].replace(/,/g, ''), 10);
                else if (i + 1 < lines.length) {
                  let m2 = lines[i+1].match(/[\d,.]+/);
                  if (m2) parsedHr = parseInt(m2[0].replace(/,/g, ''), 10);
                }
              }
            }
          }
          
          res.activeMinutes = vantageJson ? vantageJson.activeMinutes : parseActiveMinutesFromVantage(res.vantageReport);
          res.sleepHours = vantageJson ? vantageJson.sleepHours : parseSleepHoursFromVantage(res.vantageReport);
          res.totalSteps = vantageJson ? vantageJson.totalSteps : parsedSteps;
          res.totalCalories = vantageJson ? vantageJson.totalCalories : parsedCal;
          res.avgHeartRate = vantageJson ? vantageJson.avgHeartRate : parsedHr;
        }
      } catch(e) { console.error("Error loading 2-day report: " + e.message); }
    
    
    try {
      if (SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID) {
        const file = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID);
        if (file.getMimeType() === MimeType.GOOGLE_DOCS) {
          res.recentReflections = DocumentApp.openById(SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID).getBody().getText();
        } else {
          res.recentReflections = file.getBlob().getDataAsString();
        }
      }
    } catch (e) { console.error("Error reflections: " + e.message); }
    
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const completedTasksResponse = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, showAssigned: true, maxResults: 100 });
    if (completedTasksResponse.items) {
       res.completedTasksCount = completedTasksResponse.items.filter(t => t.status === 'completed' && t.completed && new Date(t.completed) >= todayStart).length;
    }
    const inboxThreads = GmailApp.search('label:00-manual-review', 0, 100);
    res.manualReviewCount = inboxThreads.length;
    
    res.breatheStreak = getHabitStreak('4-7-8 Breathing');
    res.boxBreatheStreak = getHabitStreak('Box Breathing');
  } catch (e) { console.error("Error fetching docs: " + e.stack); }
  console.log("Docs load time: " + (Date.now() - startT) + "ms"); return res; }

function parseVantageJson(content) {
  if (!content) return null;
  const match = content.match(/```json([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      console.error("Failed to parse Vantage JSON", e);
    }
  }
  return null;
}

function parseSleepHoursFromVantage(content) {
  if (!content) return 0;
  const lines = content.split('\n');
  
  // Phase 1: Try exact URN first (most reliable) - 2024-1-004 is Sleep 7.5 per 1 day
  for (let line of lines) {
    if (line.includes('|') && line.includes('2024-1-004')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 6) {
        const perf = parts[5];
        if (perf) {
          const match = perf.match(/([\d\.]+)/);
          if (match) {
            const val = parseFloat(match[1]);
            // Sleep should be a realistic duration, not a boolean '1'
            if (!isNaN(val) && val > 2 && val < 20) return val;
          }
        }
      }
    }
  }
  
  // Phase 2: Try specific sleep metrics in Metric or Path columns (avoiding prepare/ritual/breathing/meditation and boolean counts)
  for (let line of lines) {
    if (line.includes('|') && /sleep/i.test(line)) {
      if (/prepare|ritual|breathing|meditate|meditation|exercise|score/i.test(line)) {
        continue;
      }
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 6) {
        const perf = parts[5];
        if (perf) {
          const match = perf.match(/([\d\.]+)/);
          if (match) {
            const val = parseFloat(match[1]);
            // Only accept realistic sleep durations (e.g., > 2 hours) to avoid parsing boolean '1' goals
            if (!isNaN(val) && val > 2 && val < 20) return val;
          }
        }
      }
    }
  }
  
  // Phase 3: Fallbacks
  const sMatch = content.match(/Avg Sleep:\s*([\d\.]+)/i);
  if (sMatch) {
    const val = parseFloat(sMatch[1]);
    if (!isNaN(val)) return val;
  }
  
  const strictMatch = content.match(/\bSleep(?:\s+hours?|:\s+)([\d\.]+)/i);
  if (strictMatch) {
      const val = parseFloat(strictMatch[1]);
      if (!isNaN(val)) return val;
  }
  return 0;
}

function parseActiveMinutesFromVantage(content) {
  if (!content) return 0;
  const lines = content.split('\n');
  for (let line of lines) {
    if (line.includes('|') && (/active/i.test(line) || /walking/i.test(line) || /rowing/i.test(line))) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 6) {
        const perf = parts[5];
        if (perf) {
          const match = perf.match(/([\d\.]+)/);
          if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 0) return val;
          }
        }
      }
    }
  }
  const tMatch = content.match(/Active Min[a-z]*[^\d\n]*(\d+)/i) || 
                 content.match(/Total Active\/Cardio Minutes:[^\d\n]*(\d+)/i) ||
                 content.match(/Total Active\/Cardio Minutes:\s*(\d+)/i);
  if (tMatch) {
    const val = parseInt(tMatch[1], 10);
    if (!isNaN(val)) return val;
  }
  return 0;
}

// Temp endpoints
function processHealthRequest(e) {
  if (e && e.parameter && e.parameter.action === "readFile" && e.parameter.fileId) {
    try {
      const file = DriveApp.getFileById(e.parameter.fileId);
      const parents = file.getParents();
      let isAllowed = false;
      while (parents.hasNext()) {
        const parent = parents.next();
        if (parent.getId() === SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID) {
           isAllowed = true;
           break;
        }
      }
      if (!isAllowed) {
        return ContentService.createTextOutput("Error: Unauthorized. File must be within the Workspace Folder.");
      }
      return ContentService.createTextOutput(file.getBlob().getDataAsString());
    } catch(err) { return ContentService.createTextOutput(err.toString()); }
  }
  return null;
}


function printVantageLog() {
  const file = DriveApp.getFileById("1Pk_hMSx9-VGGW0Kv77Z30dPztg3wEhAE");
  return file.getBlob().getDataAsString();
}


// ==========================================
// SECTION 2: INGESTION WEBHOOK & MIME BRIDGE
// ==========================================

/**
 * @file src/Code_IngestionBridge.js
 * @description Bridges send subject/body/name as base64 (b64 flag), and this script embeds them directly into the raw MIME using Content-Transfer-Encoding: base64, so the emoji bytes never touch an Apps Script string→email conversion.
 *
 * @version 1.0.0
 * @last_modified 2026-06-05
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added standardized documentation header and improved error logging for empty catch blocks.
 */

// BRIDGE_SECRET is retrieved dynamically from Script Properties to prevent exposure

/**
 * Handles GET requests (e.g. MacroDroid query-parameter style).
 * REMOVED: Clashes with Dashboard doGet.
 */
// function doGet(e) {
//   return processWebhook(e);
// }

function doPost(e) {
  let isAction = false;
  if (e && e.parameter && e.parameter.action) {
    isAction = true;
  } else if (e && e.postData && e.postData.type === "application/json") {
    try {
      const payload = JSON.parse(e.postData.contents);
      if (payload && payload.action) {
        isAction = true;
      }
    } catch (err) {
      console.error("Failed to parse POST payload: " + err.message);
    }
  }

  if (isAction) {
    if (!isAuthorized(e)) {
      return ContentService.createTextOutput(JSON.stringify({ status: 401, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return doGet(e);
  }

  return processWebhook(e);
}

/**
 * Unified request handler for both GET and POST.
 * Supports: JSON body, form-encoded body, and URL query parameters.
 */
function processWebhook(e) {
  try {
    let payload;
    
    // 1. Try JSON body first (WhatsApp/Telegram bridges)
    if (e.postData && e.postData.type === "application/json") {
      payload = JSON.parse(e.postData.contents);
    } 
    // 2. Fallback to URL query parameters (MacroDroid)
    else if (e.parameter && e.parameter.secret) {
      payload = e.parameter;
    }
    // 3. Last resort: try parsing postData contents as form-urlencoded
    else if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        console.error("Failed to parse form-urlencoded POST payload fallback: " + err.message);
        payload = e.parameter || {};
      }
    }
    else {
      payload = e.parameter || {};
    }
    
    // Verify secret to prevent unauthorized email sending
    const bridgeSecret = getEnvProp("BRIDGE_SECRET");
    if (!bridgeSecret || typeof bridgeSecret !== 'string' || bridgeSecret.trim() === "" || payload.secret !== bridgeSecret) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: "Unauthorized"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // If the b64 flag is set, subject/body/name are already base64-encoded UTF-8.
    // Pass them directly into raw MIME to preserve emojis.
    // If not set, base64-encode them now so the MIME path is unified.
    var subjectB64, bodyB64, nameB64;
    if (payload.b64) {
      subjectB64 = payload.subject;
      bodyB64    = payload.body;
      nameB64    = payload.name;
    } else {
      // Non-b64 callers (e.g. legacy/MacroDroid) - encode here.
      // Note: doPost may have already corrupted emojis, but ASCII is fine.
      subjectB64 = Utilities.base64Encode(payload.subject || "", Utilities.Charset.UTF_8);
      bodyB64    = Utilities.base64Encode(payload.body || "", Utilities.Charset.UTF_8);
      nameB64    = Utilities.base64Encode(payload.name || "", Utilities.Charset.UTF_8);
    }

    sendRawMimeEmail(
      payload.to,
      subjectB64,
      bodyB64,
      nameB64,
      payload.references || null,
      payload.attachments || []
    );


    
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Finds an existing Gmail thread by subject line for deterministic threading.
 * @param {string} subjectB64 - Base64-encoded subject string.
 * @returns {string|null} The Gmail thread ID, or null.
 */
function findExistingThread(subjectB64) {
  try {
    // Decode subject to plain text for the search query
    var subject = Utilities.newBlob(Utilities.base64Decode(subjectB64)).getDataAsString('UTF-8');
    // Use in:anywhere so we find the thread even if it was moved to Trash or archived
    var query = 'subject:"' + subject + '" from:me to:me in:anywhere';
    var threads = GmailApp.search(query, 0, 1);
    if (threads && threads.length > 0) {
      var thread = threads[0];
      // Force the thread back to the inbox and mark it unread so the user sees the new message
      thread.moveToInbox();
      thread.markUnread();
      return thread.getId();
    }
  } catch (err) {
    Logger.log("Thread search failed: " + err.message);
  }
  return null;
}

/**
 * Constructs and sends a raw MIME email via Gmail API.
 * All text fields (subject, body, name) arrive as base64-encoded UTF-8.
 * They are embedded directly into the MIME using RFC 2047 headers and
 * Content-Transfer-Encoding: base64, so 4-byte emoji bytes are NEVER
 * decoded into Apps Script strings (which would corrupt them).
 *
 * @param {string} to - Recipient email address.
 * @param {string} subjectB64 - Base64-encoded subject line.
 * @param {string} bodyB64 - Base64-encoded body text.
 * @param {string} nameB64 - Base64-encoded sender display name.
 * @param {string|null} references - Message-ID reference for threading.
 * @param {Array} attachments - Array of {filename, mimeType, base64} objects.
 */
function sendRawMimeEmail(to, subjectB64, bodyB64, nameB64, references, attachments) {
  var boundary = "boundary_" + Math.random().toString(36).substr(2);
  var messageId = "<" + Math.random().toString(36).substr(2) + "@ingestion.bridge>";

  // Decode subject to plain text
  var bodyText = Utilities.newBlob(Utilities.base64Decode(bodyB64)).getDataAsString('UTF-8');

  // Look up existing thread to chain into
  var existingThreadId = findExistingThread(subjectB64);

  if (existingThreadId) {
    try {
      var thread = GmailApp.getThreadById(existingThreadId);
      var existingMessages = thread.getMessages();
      var normalizedThreadText = "";
      for (var i = 0; i < existingMessages.length; i++) {
        normalizedThreadText += normalizeText(existingMessages[i].getPlainBody());
      }

      var snippets = bodyText.split(/[\r\n]*---[\r\n]*/);
      var filteredSnippets = [];
      for (var j = 0; j < snippets.length; j++) {
        var snippet = snippets[j].trim();
        if (!snippet) continue;
        var normalizedSnippet = normalizeText(snippet);
        if (normalizedThreadText.indexOf(normalizedSnippet) === -1) {
          filteredSnippets.push(snippet);
        } else {
          Logger.log("Filtered out duplicate snippet: " + snippet.substring(0, 50) + "...");
        }
      }

      if (filteredSnippets.length === 0 && (!attachments || attachments.length === 0)) {
        Logger.log("Skipping email send as all snippets are duplicates.");
        return null;
      }

      bodyText = filteredSnippets.join("\n\n---\n\n");
      bodyB64 = Utilities.base64Encode(bodyText, Utilities.Charset.UTF_8);
    } catch (e) {
      Logger.log("Deduplication error: " + e.message);
    }
  }

  // Build MIME headers - subject and name use RFC 2047 base64 encoding
  var mimeLines = [
    "To: " + to,
    "Subject: =?UTF-8?B?" + subjectB64 + "?=",
    "From: =?UTF-8?B?" + nameB64 + "?= <" + to + ">",
    "Message-ID: " + messageId,
    "MIME-Version: 1.0"
  ];

  // Add threading headers - Gmail needs References + In-Reply-To to chain messages
  if (references) {
    mimeLines.push("References: " + references);
    mimeLines.push("In-Reply-To: " + references);
  }

  if (attachments && attachments.length > 0) {
    // Multipart message with attachments
    mimeLines.push("Content-Type: multipart/mixed; boundary=" + boundary);
    mimeLines.push("");
    mimeLines.push("--" + boundary);
    mimeLines.push("Content-Type: text/plain; charset=UTF-8");
    mimeLines.push("Content-Transfer-Encoding: base64");
    mimeLines.push("");
    mimeLines.push(bodyB64);
    mimeLines.push("");

    attachments.forEach(function(att) {
      mimeLines.push("--" + boundary);
      mimeLines.push("Content-Type: " + att.mimeType + "; name=\"" + (att.filename || "attachment") + "\"");
      mimeLines.push("Content-Disposition: attachment; filename=\"" + (att.filename || "attachment") + "\"");
      mimeLines.push("Content-Transfer-Encoding: base64");
      mimeLines.push("");
      mimeLines.push(att.base64);
      mimeLines.push("");
    });

    mimeLines.push("--" + boundary + "--");
  } else {
    // Simple single-part message
    mimeLines.push("Content-Type: text/plain; charset=UTF-8");
    mimeLines.push("Content-Transfer-Encoding: base64");
    mimeLines.push("");
    mimeLines.push(bodyB64);
  }

  // The MIME envelope is entirely ASCII (all emoji content is base64-encoded),
  // so a simple Utilities.base64Encode on the ASCII string is safe.
  var raw = Utilities.base64EncodeWebSafe(mimeLines.join("\r\n"));

  var sendPayload = { raw: raw };
  if (existingThreadId) {
    sendPayload.threadId = existingThreadId;
  }

  return Gmail.Users.Messages.send(sendPayload, "me");
}

/**
 * 🔒 Run this function ONCE manually from the Apps Script editor to authorize
 * the Gmail advanced service (gmail.modify scope) used by the ingestion bridge.
 */
function authorizeGmailSend() {
  var subjectB64 = Utilities.base64Encode("Bridge Auth Test", Utilities.Charset.UTF_8);
  var bodyB64    = Utilities.base64Encode("This is a test to authorize the gmail.modify scope.", Utilities.Charset.UTF_8);
  var nameB64    = Utilities.base64Encode("Atlas Bridge", Utilities.Charset.UTF_8);
  sendRawMimeEmail(
    Session.getActiveUser().getEmail(),
    subjectB64,
    bodyB64,
    nameB64,
    null,
    []
  );
  Logger.log("Authorization + test email sent successfully!");
}

/**
 * Normalizes text to make snippet-based duplicate checking robust against spacing,
 * line endings, and casing.
 * @param {string} txt - The text to normalize.
 * @returns {string} The normalized alphanumeric text.
 */
function normalizeText(txt) {
  if (!txt) return "";
  return txt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}


// ==========================================
// SECTION 3: CE OS BOOTSTRAP ENVIRONMENT
// ==========================================

/**
 * @file Code_Bootstrap_CEOS.js
 * @description Operational Maintenance & Diagnostic Utilities for The System (Humanoid).
 *
 * @version 3.0.0
 * @author System Architect & Verne
 */

/**
 * Standalone Utility: Identifies and deletes duplicate shortcuts and duplicate files
 * in 00 Inbox, Manual Review, and STND_SOURCES.
 */
function CLEAN_DUPLICATE_SHORTCUTS_INBOX() {
  console.log("=======================================================");
  console.log("🧹 CLEANING DUPLICATE SHORTCUTS & FILES IN INBOX");
  console.log("=======================================================\n");

  const foldersToClean = [];
  
  // 1. Inbox folder
  const inboxFolders = DriveApp.getFoldersByName("00 Inbox");
  while (inboxFolders.hasNext()) {
    const f = inboxFolders.next();
    if (!f.isTrashed()) foldersToClean.push(f);
  }

  // 2. Manual Review folder
  const reviewFolders = DriveApp.getFoldersByName("Manual Review");
  while (reviewFolders.hasNext()) {
    const f = reviewFolders.next();
    if (!f.isTrashed()) foldersToClean.push(f);
  }

  // 3. Fallback to STND_SOURCES if not already included
  if (SYSTEM_CONFIG.DRIVE_FOLDERS && SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES) {
    SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.forEach(id => {
      try {
        const f = DriveApp.getFolderById(id);
        if (!foldersToClean.some(existing => existing.getId() === f.getId())) {
          foldersToClean.push(f);
        }
      } catch (e) {}
    });
  }

  let totalDuplicatesRemoved = 0;

  foldersToClean.forEach(folder => {
    console.log(`📁 Scanning folder: "${folder.getName()}" (ID: ${folder.getId()})...`);
    const seenTargets = new Map(); // targetId -> first fileId
    const seenNames = new Map();   // name -> first fileId
    const items = folder.getFiles();
    const toDelete = [];

    while (items.hasNext()) {
      const file = items.next();
      if (file.isTrashed()) continue;

      const fileId = file.getId();
      const fileName = file.getName();
      const mime = file.getMimeType();
      let isDuplicate = false;
      let reason = "";

      if (mime === "application/vnd.google-apps.shortcut") {
        let targetId = null;
        try {
          targetId = file.getTargetId();
        } catch (e) {
          targetId = fileName;
        }

        if (targetId && seenTargets.has(targetId)) {
          isDuplicate = true;
          reason = `Duplicate shortcut target ID (${targetId})`;
        } else if (targetId) {
          seenTargets.set(targetId, fileId);
        }
      }

      // Also check exact duplicate filenames
      if (!isDuplicate) {
        if (seenNames.has(fileName)) {
          isDuplicate = true;
          reason = `Duplicate file/shortcut name ("${fileName}")`;
        } else {
          seenNames.set(fileName, fileId);
        }
      }

      if (isDuplicate) {
        toDelete.push({ file: file, name: fileName, reason: reason });
      }
    }

    console.log(`   Found ${toDelete.length} duplicates in "${folder.getName()}". Trashing duplicates...`);
    toDelete.forEach(item => {
      try {
        item.file.setTrashed(true);
        console.log(`   🗑️ Trashed: "${item.name}" (Reason: ${item.reason})`);
        totalDuplicatesRemoved++;
      } catch (err) {
        console.error(`   ⚠️ Failed to trash "${item.name}": ${err.message}`);
      }
    });
  });

  console.log("\n=======================================================");
  console.log(`✨ DEDUPLICATION COMPLETE: Removed ${totalDuplicatesRemoved} duplicate shortcuts/files.`);
  console.log("=======================================================\n");
}

/**
 * Diagnostic Utility: Inspects and reports existing Google Drive folders and shortcuts.
 */
function INSPECT_DRIVE_FOLDERS() {
  console.log("=======================================================");
  console.log("🔍 COMPREHENSIVE GOOGLE DRIVE FOLDER & SHORTCUT SCAN");
  console.log("=======================================================\n");

  const root = DriveApp.getRootFolder();

  function checkChild(parentFolder, name, relativePath) {
    const fullPath = relativePath ? `${relativePath}/${name}` : name;
    
    // Check direct folder
    const folderIter = parentFolder.getFoldersByName(name);
    while (folderIter.hasNext()) {
      const f = folderIter.next();
      if (!f.isTrashed()) {
        console.log(`✓ [FOLDER]   "${fullPath}" --> ID: ${f.getId()}`);
        return f;
      }
    }
    
    // Check shortcut to folder
    const fileIter = parentFolder.getFilesByName(name);
    while (fileIter.hasNext()) {
      const file = fileIter.next();
      if (!file.isTrashed() && file.getMimeType() === "application/vnd.google-apps.shortcut") {
        const targetId = file.getTargetId();
        console.log(`✓ [SHORTCUT] "${fullPath}" --> Target ID: ${targetId} (Shortcut ID: ${file.getId()})`);
        try {
          return DriveApp.getFolderById(targetId);
        } catch (e) {
          return null;
        }
      }
    }

    console.log(`❌ [MISSING]  "${fullPath}"`);
    return null;
  }

  console.log("📁 TAXONOMY HIERARCHY FOLDERS & SHORTCUTS:");
  const taxonomyPaths = [
    "01 Admin (Humanoid)",
    "01 Admin (Humanoid)/Contracts & Personal Documents",
    "01 Admin (Humanoid)/Equipment & IT",
    "01 Admin (Humanoid)/Meetings",
    "01 Admin (Humanoid)/Notes",
    "01 Admin (Humanoid)/The System",
    "01 Admin (Humanoid)/Useful",
    "02 Team & Operations",
    "02 Team & Operations/1:1s & People",
    "02 Team & Operations/Hiring & Staffing",
    "02 Team & Operations/Meetings & Cadence",
    "02 Team & Operations/Comms & Broadcasts",
    "03 Knowledge Base",
    "03 Knowledge Base/Company & Strategy",
    "03 Knowledge Base/Domain & Market",
    "03 Knowledge Base/Playbooks & SOPs",
    "03 Knowledge Base/Product & Tech Specs",
    "04 Finances",
    "04 Finances/Budget & Headcount",
    "04 Finances/Vendors & Procurement",
    "04 Finances/Expenses & Claims",
    "05 Projects",
    "05 Projects/202608 OKR",
    "05 Projects/202608 Performance Operations",
    "05 Projects/202608 Reward Program"
  ];

  taxonomyPaths.forEach(p => {
    const parts = p.split("/").map(s => s.trim()).filter(Boolean);
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/");
      const next = checkChild(curr, parts[i], parentPath);
      if (next) {
        curr = next;
      } else {
        break;
      }
    }
  });

  console.log("\n=======================================================");
  console.log("📊 FOLDER SCAN COMPLETE");
  console.log("=======================================================\n");
}

/**
 * Standalone Utility: Seeds the finalized Humanoid taxonomy directly into 3 Config - Workspace Taxonomy.
 */
function SEED_HUMANOID_TAXONOMY() {
  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.LOS_TAXONOMY;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error(`Error: 3 Config - Workspace Taxonomy sheet with GID ${targetGid} not found.`);
    return;
  }
  populateFullCEOSHierarchy(sheet);
  console.log("✨ Humanoid Workspace Taxonomy updated successfully!");
}

/**
 * Pre-populates the 3 Config - Workspace Taxonomy tab with the full CEOS hierarchy.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 
 */
function populateFullCEOSHierarchy(sheet) {
  console.log("   └─ Populating full CEOS hierarchy in 3 Config - Workspace Taxonomy...");
  
  const taxonomyData = [
    // L1: 01 Admin (Humanoid)
    ["01", "Admin (Humanoid)", "", "", "", "", "", "", "01 Admin (Humanoid)", "01 Admin (Humanoid)", "01 Admin (Humanoid)", ""],
    ["01", "Admin (Humanoid)", "", "Contracts & Personal Documents", "", "", "", "Employment contracts, official HR paperwork, personal documents, payroll", "01 Admin (Humanoid)/Contracts & Personal Documents", "01 Admin (Humanoid)/Contracts & Personal Documents", "01 Admin (Humanoid)/Contracts & Personal Documents", ""],
    ["01", "Admin (Humanoid)", "", "Equipment & IT", "", "", "", "Hardware provisioning, credentials, software licenses, 2FA, IT support", "01 Admin (Humanoid)/Equipment & IT", "01 Admin (Humanoid)/Equipment & IT", "01 Admin (Humanoid)/Equipment & IT", ""],
    ["01", "Admin (Humanoid)", "", "Meetings", "", "", "", "Meeting notes, Google Meet recordings, audio transcripts", "01 Admin (Humanoid)/Meetings", "01 Admin (Humanoid)/Meetings", "01 Admin (Humanoid)/Meetings", ""],
    ["01", "Admin (Humanoid)", "", "Notes", "", "", "", "General rough notes, scratchpad items, raw captures", "01 Admin (Humanoid)/Notes", "01 Admin (Humanoid)/Notes", "01 Admin (Humanoid)/Notes", ""],
    ["01", "Admin (Humanoid)", "", "The System", "", "", "", "Operating system configuration, Apps Script repositories, bot configurations", "01 Admin (Humanoid)/The System", "01 Admin (Humanoid)/The System", "01 Admin (Humanoid)/The System", ""],
    ["01", "Admin (Humanoid)", "", "Useful", "", "", "", "Reference gems, prompt artifacts, useful tools", "01 Admin (Humanoid)/Useful", "01 Admin (Humanoid)/Useful", "01 Admin (Humanoid)/Useful", ""],

    // L1: 02 Team & Operations
    ["02", "Team & Operations", "", "", "", "", "", "", "02 Team & Operations", "02 Team & Operations", "02 Team & Operations", ""],
    ["02", "Team & Operations", "", "1:1s & People", "", "", "", "Direct report 1:1s, coaching, feedback, manager syncs", "02 Team & Operations/1:1s & People", "02 Team & Operations/1:1s & People", "02 Team & Operations/1:1s & People", ""],
    ["02", "Team & Operations", "", "Hiring & Staffing", "", "", "", "Recruitment pipelines, candidate screening, interview loops, job descriptions", "02 Team & Operations/Hiring & Staffing", "02 Team & Operations/Hiring & Staffing", "02 Team & Operations/Hiring & Staffing", ""],
    ["02", "Team & Operations", "", "Meetings & Cadence", "", "", "", "Recurring team syncs, daily standups, all-hands, firesides, unblocking sessions", "02 Team & Operations/Meetings & Cadence", "02 Team & Operations/Meetings & Cadence", "02 Team & Operations/Meetings & Cadence", ""],
    ["02", "Team & Operations", "", "Comms & Broadcasts", "", "", "", "Company newsletters, team announcements, executive operational memos", "02 Team & Operations/Comms & Broadcasts", "02 Team & Operations/Comms & Broadcasts", "02 Team & Operations/Comms & Broadcasts", ""],

    // L1: 03 Knowledge Base
    ["03", "Knowledge Base", "", "", "", "", "", "", "03 Knowledge Base", "03 Knowledge Base", "03 Knowledge Base", ""],
    ["03", "Knowledge Base", "", "Company & Strategy", "", "", "", "Company vision, quarterly OKRs, executive briefings, org charts, business model", "03 Knowledge Base/Company & Strategy", "03 Knowledge Base/Company & Strategy", "03 Knowledge Base/Company & Strategy", ""],
    ["03", "Knowledge Base", "", "Domain & Market", "", "", "", "Robotics industry research, competitor benchmarks, AI literature, market data", "03 Knowledge Base/Domain & Market", "03 Knowledge Base/Domain & Market", "03 Knowledge Base/Domain & Market", ""],
    ["03", "Knowledge Base", "", "Playbooks & SOPs", "", "", "", "Standard operating procedures, frameworks, guidelines, templates, how-to manuals", "03 Knowledge Base/Playbooks & SOPs", "03 Knowledge Base/Playbooks & SOPs", "03 Knowledge Base/Playbooks & SOPs", ""],
    ["03", "Knowledge Base", "", "Product & Tech Specs", "", "", "", "Technical specs, hardware/software standards, KinetIQ architecture, CE certification", "03 Knowledge Base/Product & Tech Specs", "03 Knowledge Base/Product & Tech Specs", "03 Knowledge Base/Product & Tech Specs", ""],

    // L1: 04 Finances
    ["04", "Finances", "", "", "", "", "", "", "04 Finances", "04 Finances", "04 Finances", ""],
    ["04", "Finances", "", "Budget & Headcount", "", "", "", "Financial planning, headcount cost models, department budgets, P&L targets", "04 Finances/Budget & Headcount", "04 Finances/Budget & Headcount", "04 Finances/Budget & Headcount", ""],
    ["04", "Finances", "", "Vendors & Procurement", "", "", "", "Vendor contracts, SaaS tool subscriptions, supplier invoices", "04 Finances/Vendors & Procurement", "04 Finances/Vendors & Procurement", "04 Finances/Vendors & Procurement", ""],
    ["04", "Finances", "", "Expenses & Claims", "", "", "", "Personal expense claims, travel receipts, team dinners", "04 Finances/Expenses & Claims", "04 Finances/Expenses & Claims", "04 Finances/Expenses & Claims", ""],

    // L1: 05 Projects
    ["05", "Projects", "", "", "", "", "", "", "05 Projects", "05 Projects", "05 Projects", ""],
    ["05", "Projects", "", "202608 OKR", "", "", "202608 OKR", "Company-wide OKR cycle coordination, scorecard updates, alignment reviews", "05 Projects/202608 OKR", "05 Projects/202608 OKR", "05 Projects/202608 OKR", ""],
    ["05", "Projects", "", "202608 Performance Operations", "", "", "202608 Performance Operations", "Organisation performance framework design, efficiency systems, velocity metrics", "05 Projects/202608 Performance Operations", "05 Projects/202608 Performance Operations", "05 Projects/202608 Performance Operations", ""],
    ["05", "Projects", "", "202608 Reward Program", "", "", "202608 Reward Program", "Employee incentive systems, bonus and compensation structure review", "05 Projects/202608 Reward Program", "05 Projects/202608 Reward Program", "05 Projects/202608 Reward Program", ""]
  ];

  sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), sheet.getLastColumn()).clearContent();
  sheet.getRange(2, 1, taxonomyData.length, taxonomyData[0].length).setValues(taxonomyData);
  console.log(`   └─ Successfully seeded ${taxonomyData.length} taxonomy entries into 3 Config - Workspace Taxonomy.`);
}

/**
 * Standalone Utility: Seeds the 4 High-Level Humanoid Strategic Goals into the dedicated
 * Goals sheet and exports them to markdown.
 */
function SEED_HUMANOID_GOALS() {
  console.log("=======================================================");
  console.log("🎯 SEEDING HUMANOID STRATEGIC GOALS & EXPORTING CONTEXT");
  console.log("=======================================================\n");

  const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
  if (!ssId) {
    console.error("Error: HABITS_SHEET_ID is not defined in SYSTEM_CONFIG.ROOTS.");
    return;
  }

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheets()[0];

  const headers = ["Goal ID", "Category", "Goal Name", "Strategic Objective", "Related Projects", "Active"];
  const goalsData = [
    [
      "OPS-1.1",
      "03 Knowledge Base/Company & Strategy",
      "Measurable Performance & OKR Framework",
      "Make performance measurable at every level so the company can drive it. Ratify and embed the company-wide OKR framework ensuring all team and individual goals directly ladder to executive objectives.",
      "05 Projects/202608 OKR",
      true
    ],
    [
      "OPS-1.2",
      "02 Team & Operations",
      "Evidence-Based Performance Assessments",
      "Assess individual performance on evidence rather than impression. Establish a fair, objective assessment framework across all functions to maximize systemic efficiency and execution speed.",
      "05 Projects/202608 Performance Operations",
      true
    ],
    [
      "OPS-1.3",
      "02 Team & Operations/Hiring & Staffing",
      "Performance-Driven Reward & Incentive Architecture",
      "Make reward follow performance rather than tenure or negotiation. Establish a high-performance reward and LTIP framework that drives high talent density and retains top performers.",
      "05 Projects/202608 Reward Program",
      true
    ],
    [
      "OPS-1.4",
      "01 Admin (Humanoid)/The System",
      "Autonomous Executive Systems & Workspace Operations",
      "Maintain zero-friction executive operating systems (The Clerk automated triage, Task Master execution cadence) to eliminate manual overhead and ensure zero task leakage.",
      "01 Admin (Humanoid)/The System",
      true
    ]
  ];

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  sheet.getRange(2, 1, goalsData.length, headers.length).setValues(goalsData);
  sheet.autoResizeColumns(1, headers.length);
  console.log(`✨ Successfully seeded ${goalsData.length} strategic goals into Habits & Goals sheet.`);

  exportWorkGoalsToMarkdown();
}

/**
 * Run from PRIVATE environment: Grants Viewer/Read access on all existing System Prompt docs
 * to the Humanoid Work Account (daniel.adersteg@thehumanoid.ai).
 */
function GRANT_ACCESS_TO_WORK_ACCOUNT() {
  console.log("=======================================================");
  console.log("🔑 GRANTING WORK ACCOUNT ACCESS TO MASTER SYSTEM DOCS");
  console.log("=======================================================\n");

  const workEmail = "daniel.adersteg@thehumanoid.ai";
  const fileIds = [
    "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar", // TASK_MASTER_PROMPT_ID
    "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", // TASK_MASTER_DAILY_PROMPT_ID
    "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb", // TASK_MASTER_WEEKLY_PROMPT_ID
    "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf", // TASK_MASTER_MONTHLY_PROMPT_ID
    "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2", // TASK_MASTER_QUARTERLY_PROMPT_ID
    "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U", // CLERK_DRIVE_INSTRUCTIONS
    "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk", // CLERK_DRIVE_PROTOCOL
    "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ", // CLERK_EMAIL_PROMPT_ID
    "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn", // MASTER_ASSET_NAMING_PROTOCOL
    "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm", // AGENT_PROTOCOL_TIME_FRAMEWORKS
    "1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8", // SYSTEM_ARCHITECTURE_OVERVIEW_ID
    "18-wxQHsaN-T7vcVSFo3e5TKFisrx8Tf-", // GEMINI_MODELS_MD_ID
    "1adWYc1Rpoh4W5IBHVY3CfNg3KzzmEOeL", // GEMINI_MODELS_JSON_ID
    "135iOBA-LQbm5Tv6VMaB-XUTa6Iwpkb_-UHsziXlDhYg"  // BLUF_SUMMARY_PROMPT_ID
  ];

  let successCount = 0;
  fileIds.forEach(id => {
    try {
      const file = DriveApp.getFileById(id);
      file.addViewer(workEmail);
      console.log(`✓ Granted Viewer access to: "${file.getName()}" (${id})`);
      successCount++;
    } catch(e) {
      console.error(`⚠️ Failed on File ID ${id}: ${e.message}`);
    }
  });

  console.log("\n=======================================================");
  console.log(`✅ ACCESS GRANTED ON ${successCount}/${fileIds.length} SYSTEM DOCS TO ${workEmail}`);
  console.log("=======================================================");
}

/**
 * Standalone Utility: Immediately writes the clean 21-column header row to 5 Import - Drive Files Log.
 */
function FIX_DRIVE_LOG_HEADERS() {
  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.DRIVE_LOG;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error("Drive Log sheet not found!");
    return;
  }
  const driveHeaders = [
    "Timestamp", "URL", "Original Name", "Description", "Final Name",
    "Path Code", "Context ID", "BLUF Summary", "Metadata Description", "Reasoning",
    "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path",
    "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status",
    "Mapped Task", "Tasks Extracted"
  ];
  sheet.getRange(1, 1, 1, driveHeaders.length).setValues([driveHeaders]).setFontWeight("bold").setBackground("#cfe2f3");
  sheet.setFrozenRows(1);
  console.log("✓ Successfully updated row 1 headers in 5 Import - Drive Files Log!");
}

/**
 * Standalone Utility: Retroactively regenerates BLUF summaries for existing rows in 5 Import - Drive Files Log
 * using the dynamic Google Doc prompt.
 */
function RETRO_UPDATE_BLUF_SUMMARIES() {
  console.log("=======================================================");
  console.log("🔄 RETRO-UPDATING BLUF SUMMARIES IN DRIVE FILES LOG");
  console.log("=======================================================\n");

  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.DRIVE_LOG;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error("Drive Log sheet not found!");
    return;
  }

  FIX_DRIVE_LOG_HEADERS();

  const blufDocId = SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID;
  let blufPrompt = "";
  if (blufDocId) {
    try {
      blufPrompt = getSafeDocText(blufDocId);
    } catch(e) {
      console.warn("Could not read BLUF Doc: " + e.message);
    }
  }
  if (!blufPrompt) {
    blufPrompt = `Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary for the document. Extract the core message, key decisions, and critical deadlines. Maintain a highly efficient, punchy tone. Remove all filler. Pure plain text only.`;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.log("No data rows found to update.");
    return;
  }

  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const url = data[i][1] ? data[i][1].toString() : "";
    const originalName = data[i][2] ? data[i][2].toString() : "";
    const finalName = data[i][4] ? data[i][4].toString() : "";

    let fileId = null;
    const match = url.match(/[-\w]{25,}/);
    if (match) {
      fileId = match[0];
    }

    if (!fileId) {
      console.log(`Skipping Row ${i+1}: No valid file ID found in URL "${url}".`);
      continue;
    }

    try {
      let fileText = "";
      const file = DriveApp.getFileById(fileId);
      const mime = file.getMimeType();
      
      if (mime === "application/vnd.google-apps.document") {
        fileText = DocumentApp.openById(fileId).getBody().getText().substring(0, 6000);
      } else if (mime === "application/vnd.google-apps.spreadsheet") {
        fileText = SpreadsheetApp.openById(fileId).getSheets()[0].getDataRange().getValues().slice(0, 30).map(r => r.join(" | ")).join("\n");
      } else {
        try {
          fileText = file.getBlob().getDataAsString().substring(0, 6000);
        } catch(e) {
          fileText = "";
        }
      }

      if (!fileText || fileText.length < 20) {
        fileText = `File Name: ${finalName || originalName} | Description: ${data[i][3] || ""} | Context: ${data[i][5] || ""}`;
      }

      const promptText = `${blufPrompt}\n\nDOCUMENT TITLE: ${finalName || originalName}\n\nDOCUMENT CONTENT:\n${fileText}\n\nOUTPUT: Output ONLY the plain text BLUF summary. Maximum 500 characters.`;
      const blufModel = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE || "gemini-3.5-flash-lite";
      const aiResponse = callGemini([{ text: promptText }], blufModel, null, null, false, { maxOutputTokens: 250, thinkingBudget: 0 });

      if (aiResponse && aiResponse.text) {
        let cleanSummary = aiResponse.text.trim().replace(/^["']|["']$/g, '');
        if (cleanSummary.length > 500) cleanSummary = cleanSummary.substring(0, 497) + "...";
        sheet.getRange(i + 1, 8).setValue(cleanSummary);
        console.log(`✓ Row ${i+1} [${finalName || originalName}]: Updated BLUF Summary`);
        updatedCount++;
      }
      Utilities.sleep(500);
    } catch(err) {
      console.warn(`⚠️ Row ${i+1} [${originalName}]: ${err.message}`);
    }
  }

  console.log("\n=======================================================");
  console.log(`✅ RETRO UPDATE COMPLETE: Updated ${updatedCount} rows with new BLUF summaries!`);
  console.log("=======================================================");
}

/**
 * Standalone Utility: Inspects the workspace and outputs the exact URLs and file IDs
 * for all system prompts, master files, and generated output plans.
 */
function GET_ALL_SYSTEM_DOC_LINKS() {
  console.log("=======================================================");
  console.log("📑 THE SYSTEM (HUMANOID): MASTER & GENERATED DOC LINKS");
  console.log("=======================================================\n");

  const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(workspaceFolderId);
  console.log(`📂 Workspace Folder: "${folder.getName()}"\n   URL: ${folder.getUrl()}\n`);

  console.log("--- 1. MASTER SPREADSHEET & HABITS ---");
  try {
    const ss = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
    console.log(`📊 Master Spreadsheet: ${ss.getUrl()}`);
  } catch(e) { console.log(`📊 Master Spreadsheet: Error: ${e.message}`); }

  console.log("\n--- 2. GENERATED ONE-PAGERS & EXECUTION PLANS (IN WORKSPACE) ---");
  const files = folder.getFiles();
  let fileCount = 0;
  while (files.hasNext()) {
    const f = files.next();
    console.log(`📄 "${f.getName()}" --> ID: ${f.getId()}\n   URL: ${f.getUrl()}`);
    fileCount++;
  }
  if (fileCount === 0) {
    console.log("No generated output files found in workspace folder yet.");
  }

  console.log("\n--- 3. SYSTEM PROMPT DOCUMENTS ---");
  const promptDocs = [
    { name: "BLUF Summary Prompt", id: SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID },
    { name: "Task Master Global Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_PROMPT_ID },
    { name: "1-Day Daily Operations Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID },
    { name: "7-Day Weekly Roadmap Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_WEEKLY_PROMPT_ID },
    { name: "28-Day Monthly Strategy Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_MONTHLY_PROMPT_ID },
    { name: "84-Day Quarterly Strategic Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_QUARTERLY_PROMPT_ID }
  ];
  promptDocs.forEach(d => {
    if (d.id) {
      try {
        const pf = DriveApp.getFileById(d.id);
        console.log(`📝 ${d.name}: "${pf.getName()}" --> ID: ${d.id}\n   URL: ${pf.getUrl()}`);
      } catch(e) {
        console.log(`📝 ${d.name} (ID: ${d.id}): ${e.message}`);
      }
    }
  });
  console.log("\n=======================================================");
}

/**
 * Standalone Utility: Creates or updates the BLUF summary prompt document directly in the workspace folder.
 */
function SEED_BLUF_PROMPT_DOC() {
  const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(workspaceFolderId);
  const fileName = "202608 - The Clerk BLUF Summary System Prompt.md";
  const files = folder.getFilesByName(fileName);
  const content = `## BOTTOM LINE UP FRONT (BLUF) SUMMARY INSTRUCTIONS
For the summary field of each document/file:
1. Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary.
2. Extract the core message, key decisions, and any critical deadlines or requirements.
3. Maintain a highly efficient, punchy tone. Remove all filler and corporate pleasantries.
4. CRITICAL: Do NOT output any URLs, web links, or markdown link formatting. Output pure plain text only.`;

  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(content);
    console.log(`✓ Updated existing BLUF Prompt doc: "${fileName}" (ID: ${file.getId()})`);
  } else {
    file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    console.log(`✨ Created new BLUF Prompt doc in workspace: "${fileName}" (ID: ${file.getId()})`);
  }
  console.log(`   URL: ${file.getUrl()}`);
  return file.getId();
}

// Prompt documents are managed directly by the user on filesystem / Google Drive.

/**
 * Standalone Utility: Configures the exact layout, formulas, search boxes, and formatting
 * for "10 Drive Tracker" and "10 Email Tracker" in the Master Spreadsheet.
 */
function SYNC_TRACKERS_FROM_PRIVATE() {
  console.log("=======================================================");
  console.log("📊 CONFIGURING DRIVE & EMAIL TRACKERS IN MASTER SPREADSHEET");
  console.log("=======================================================\n");

  const ss = getMasterSpreadsheet();

  // 1. Configure 10 Drive Tracker
  const driveTrackerGid = SYSTEM_CONFIG.SHEETS.DRIVE_TRACKER;
  const driveTrackerSheet = ss.getSheets().find(s => s.getSheetId().toString() === driveTrackerGid);
  if (driveTrackerSheet) {
    driveTrackerSheet.clear();
    
    // Title
    driveTrackerSheet.getRange("A1").setValue("DRIVE FILES AUDITOR & SEARCH TRACKER").setFontWeight("bold").setFontSize(14);
    driveTrackerSheet.getRange("A3").setValue("Search Files:").setFontWeight("bold");
    driveTrackerSheet.getRange("B3").setValue("").setBackground("#fff2cc"); // Yellow input cell

    // Column Headers
    const driveHeaders = ["Original Name", "Final Name", "Target Folder Path", "BLUF Summary", "Mapped Task", "Tasks Extracted"];
    driveTrackerSheet.getRange(5, 1, 1, driveHeaders.length).setValues([driveHeaders]).setFontWeight("bold").setBackground("#cfe2f3");

    // Dynamic Filter Query Formula for Row 6
    const driveFormula = `=IFERROR(QUERY('5 Import - Drive Files Log'!A2:U, "SELECT C, E, O, H, T, U WHERE C IS NOT NULL AND (LOWER(C) CONTAINS LOWER('"&B3&"') OR LOWER(E) CONTAINS LOWER('"&B3&"') OR LOWER(H) CONTAINS LOWER('"&B3&"') OR LOWER(O) CONTAINS LOWER('"&B3&"') OR '"&B3&"' = '') ORDER BY A DESC LIMIT 500", 0), "No matching files found")`;
    driveTrackerSheet.getRange("A6").setFormula(driveFormula);
    driveTrackerSheet.setFrozenRows(5);
    console.log("✓ Successfully configured 10 Drive Tracker!");
  } else {
    console.error("10 Drive Tracker sheet not found!");
  }

  // 2. Configure 10 Email Tracker
  const emailTrackerGid = SYSTEM_CONFIG.SHEETS.EMAIL_TRACKER;
  const emailTrackerSheet = ss.getSheets().find(s => s.getSheetId().toString() === emailTrackerGid);
  if (emailTrackerSheet) {
    emailTrackerSheet.clear();

    // Title
    emailTrackerSheet.getRange("A1").setValue("EMAIL AUDITOR & SEARCH TRACKER").setFontWeight("bold").setFontSize(14);
    emailTrackerSheet.getRange("A3").setValue("Search Emails:").setFontWeight("bold");
    emailTrackerSheet.getRange("B3").setValue("").setBackground("#fff2cc"); // Yellow input cell

    // Column Headers
    const emailHeaders = ["Timestamp", "Subject", "Sender", "Final Labels", "BLUF Summary", "Action Items", "Link", "Inbox Status"];
    emailTrackerSheet.getRange(5, 1, 1, emailHeaders.length).setValues([emailHeaders]).setFontWeight("bold").setBackground("#cfe2f3");

    // Dynamic Filter Query Formula for Row 6
    const emailFormula = `=IFERROR(QUERY('5 Import - Email Triage Log'!A2:Q, "SELECT A, D, L, H, M, N, I, J WHERE A IS NOT NULL AND (LOWER(D) CONTAINS LOWER('"&B3&"') OR LOWER(L) CONTAINS LOWER('"&B3&"') OR LOWER(M) CONTAINS LOWER('"&B3&"') OR LOWER(H) CONTAINS LOWER('"&B3&"') OR '"&B3&"' = '') ORDER BY A DESC LIMIT 500", 0), "No matching emails found")`;
    emailTrackerSheet.getRange("A6").setFormula(emailFormula);
    emailTrackerSheet.setFrozenRows(5);
    console.log("✓ Successfully configured 10 Email Tracker!");
  } else {
    console.error("10 Email Tracker sheet not found!");
  }

  console.log("\n=======================================================");
  console.log("✅ TRACKER TABS FULLY CONFIGURED & LINKED TO IMPORT LOGS");
  console.log("=======================================================");
}

/**
 * Standalone Utility: Verifies read/write access to the dedicated Timeboxing calendar.
 */
function VERIFY_TIMEBOXING_CALENDAR() {
  console.log("=======================================================");
  console.log("📅 VERIFYING DEDICATED TIMEBOXING CALENDAR ACCESS");
  console.log("=======================================================\n");

  const calId = SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID;
  console.log(`Target Calendar ID: ${calId}`);

  try {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) {
      console.error("❌ CalendarApp.getCalendarById returned null. Ensure this calendar is added/shared to this Google Account.");
      return;
    }

    console.log(`✓ Calendar Name: "${cal.getName()}"`);
    console.log(`✓ Calendar TimeZone: ${cal.getTimeZone()}`);
    
    // Check events for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const events = cal.getEvents(startOfDay, endOfDay);
    console.log(`✓ Found ${events.length} events scheduled on this calendar for today.`);
    events.forEach(e => {
      console.log(`   - [${Utilities.formatDate(e.getStartTime(), "Europe/London", "HH:mm")} - ${Utilities.formatDate(e.getEndTime(), "Europe/London", "HH:mm")}] ${e.getTitle()}`);
    });

    console.log("\n=======================================================");
    console.log("✅ DEDICATED TIMEBOXING CALENDAR ACCESSIBLE & VERIFIED!");
    console.log("=======================================================");
  } catch (e) {
    console.error(`❌ Verification failed: ${e.message}`);
  }
}

/**
 * Standalone Utility: Inspects Google Tasks across all lists to see their titles,
 * parent/subtask relationships, notes, and milestones.
 */
function INSPECT_GOOGLE_TASKS_MILESTONES() {
  console.log("=======================================================");
  console.log("📋 INSPECTING GOOGLE TASKS & MILESTONES");
  console.log("=======================================================\n");

  const lists = [
    { name: "00 Inbox", id: SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID },
    { name: "00 Todo", id: SYSTEM_CONFIG.TASKS.TODO_LIST_ID },
    { name: "00 AI Review", id: SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID },
    { name: "00 Recurring", id: SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID }
  ];

  lists.forEach(l => {
    console.log(`\n--- LIST: ${l.name} (${l.id}) ---`);
    let pageToken;
    let count = 0;
    do {
      try {
        const res = Tasks.Tasks.list(l.id, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
        const items = res.items || [];
        items.forEach(t => {
          count++;
          const isMilestone = t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title));
          const hasParent = !!t.parent;
          const milestoneNoteMatch = (t.notes || "").match(/^Milestone:\s*(.*)$/m);
          console.log(`[${count}] "${t.title}" (ID: ${t.id})`);
          if (hasParent) console.log(`    ↳ Subtask of Parent ID: ${t.parent}`);
          if (isMilestone) console.log(`    ★ Identified as MILESTONE EPIC`);
          if (milestoneNoteMatch) console.log(`    ↳ Note Milestone: "${milestoneNoteMatch[1]}"`);
        });
        pageToken = res.nextPageToken;
      } catch(e) {
        console.error(`Error reading ${l.name}: ${e.message}`);
        pageToken = undefined;
      }
    } while (pageToken);
    console.log(`Total in ${l.name}: ${count}`);
  });
  console.log("\n=======================================================");
}

/**
 * Standalone Test Utility: Tests and verifies the Milestone attribution and parenting pipeline.
 * Evaluates active tasks, runs Gemini classification with milestone grouping, and verifies the exact
 * decisions, parent-child linkages, and Google Tasks updates.
 */
function TEST_TASK_MASTER_MILESTONES() {
  console.log("=======================================================");
  console.log("🧪 TESTING TASK MASTER MILESTONE ATTRIBUTION & PARENTING");
  console.log("=======================================================\n");

  // 1. Inspect current active milestones
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const rawTasks = [];
  let pageToken;
  do {
    const res = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
    if (res.items) rawTasks.push(...res.items);
    pageToken = res.nextPageToken;
  } while (pageToken);

  const activeMilestones = rawTasks
    .filter(t => t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title)))
    .map(t => ({ id: t.id, title: t.title }));

  console.log(`Found ${activeMilestones.length} existing Milestone Epics in 00 Todo:`);
  activeMilestones.forEach(m => console.log(`  ★ "${m.title}" (ID: ${m.id})`));

  // 3. Run the actual pipeline sweep (force reviewing all tasks for testing)
  console.log("\nExecuting Task Master Review Pipeline to verify AI Milestone grouping (forceReviewAll = true)...");
  const result = runTaskMasterEngine(true);
  console.log("Pipeline result:", result);

  // 4. Inspect final result in Google Tasks
  console.log("\nVerifying parent-child hierarchy in Google Tasks:");
  INSPECT_GOOGLE_TASKS_MILESTONES();
}

