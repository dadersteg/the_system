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
  const secret = getEnvProp("WEBAPP_SECRET");
  if (secret && typeof secret === 'string' && secret.trim() !== "") {
    if (e && e.parameter && e.parameter.secret === secret) {
      return true;
    }
  }

  const allowedEmails = [
    "adersteg.daniel@gmail.com",
    "daniel@playmetech.net",
    "daniel@playmetech.com"
  ];

  try {
    const activeEmail = Session.getActiveUser().getEmail();
    const effectiveEmail = Session.getEffectiveUser().getEmail();

    if (e) {
      // In a web app request context, we can only trust the active user's identity.
      // If activeEmail is in the allowlist, they are authorized.
      if (activeEmail && allowedEmails.indexOf(activeEmail.toLowerCase()) !== -1) {
        return true;
      }
    } else {
      // In a non-web request context (triggers, editor runs), we trust getEffectiveUser().
      if (effectiveEmail && allowedEmails.indexOf(effectiveEmail.toLowerCase()) !== -1) {
        return true;
      }
    }
  } catch (err) {
    console.warn("isAuthorized: check failed: " + err.message);
  }

  return false;
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
  
  if (e && e.parameter && e.parameter.action === "updateCloudDoc") {
     try {
       updateCloudDoc();
       return ContentService.createTextOutput("OK - Cloud doc forced to update.");
     } catch(err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "runDriveArchaeologist") {
     try {
       runDriveArchaeologist();
       return ContentService.createTextOutput("OK - runDriveArchaeologist executed successfully.");
     } catch(err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "testPhotos") {
     try {
       processGmailPhotos();
       return ContentService.createTextOutput("OK - processGmailPhotos executed successfully.");
     } catch(err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "createManifestSpreadsheet") {
     try {
       const url = createManifestSpreadsheet();
       return ContentService.createTextOutput("Spreadsheet created successfully! Link: " + url);
     } catch (err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "readManifestSpreadsheet") {
     try {
       var ss = SpreadsheetApp.openById("1mT3oV1PcdpkILxYZLiN9e9a7xYiYqeHYVFBZWl9wHzQ");
       var sheets = ss.getSheets();
       var data = {};
       for (var i = 0; i < sheets.length; i++) {
         var sheet = sheets[i];
         data[sheet.getName()] = sheet.getDataRange().getValues();
       }
       return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "syncScriptProperties") {
     try {
       var result = syncPropertiesFromManifest();
       return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput("Error: " + err.message);
     }
  }

  if (e && e.parameter && e.parameter.action === "moveWorkFiles") {
     try {
       var result = moveWorkFilesToNewFolder();
       return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
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
      const taskLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === "1580572397");
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

  if (e && e.parameter && e.parameter.test === "true") {
     const result = testTaskMasterSimulation();
     return ContentService.createTextOutput(JSON.stringify(result));
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



  return HtmlService.createHtmlOutputFromFile('WebApp_Dashboard')
      .setTitle('The System Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
    const indexData = [
      ['System Dashboard', '=HYPERLINK("https://script.google.com/macros/s/AKfycbxHAmhD0Bv5pD1akLaBm26xM1BDXpuUfEI2y8MpbiHF1v5cZuJs_hkAoyOZxTsY0lr7/exec", "🚀 Open Dashboard")', 'WEB_APP'],
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

function triggerVantage14Day() {
  return _triggerReflectionAPI("run14DayRawLog");
}

function triggerVantage14DayAudit() {
  return _triggerReflectionAPI("run14DayAudit");
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

function getDashboardData() {
  const data = {
    emails: [],
    tasks: [],
    recentTasks: [],
    files: [],
    notes: [],
    links: [],
    calendar: [],
    clerkEmails: [],
    clerkTasks: [],
    workouts: []
  };
  
  let ss = null;
  let allSheets = [];
  let workspaceFolder = null;
  try {
    ss = getMasterSpreadsheet();
    allSheets = ss.getSheets();
  } catch (e) { console.error("Error loading master sheet: " + e.message); }
  
  try {
    workspaceFolder = DriveApp.getFolderById(SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID);
  } catch (e) { console.error("Error loading workspace folder: " + e.message); }

  try {
    // 1. Fetch 25 latest emails from inbox
    const threads = GmailApp.search('in:inbox', 0, 25);
    data.emails = threads.map(t => ({
      subject: t.getFirstMessageSubject(),
      sender: t.getMessages()[0].getFrom(),
      date: t.getLastMessageDate().toISOString(),
      url: `https://mail.google.com/mail/u/0/#inbox/${t.getId()}`
    }));
  } catch(e) { console.error("Error fetching emails: " + e.message); }

  try {
    // Fetch Calendar events for today from current timeime
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const events = CalendarApp.getDefaultCalendar().getEvents(now, endOfDay);
    data.calendar = events.map(e => ({
      title: e.getTitle() || '(No Title)',
      startTime: e.getStartTime().toISOString(),
      endTime: e.getEndTime().toISOString(),
      isAllDay: e.isAllDayEvent(),
      location: e.getLocation()
    }));
  } catch(e) { console.error("Error fetching calendar: " + e.message); }

  try {
    // 2 & 3. Fetch Tasks Efficiently without infinite pagination
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    
    // Open Tasks (max 50)
    const openResponse = Tasks.Tasks.list(todoListId, {
      showCompleted: false,
      showHidden: false, showAssigned: true,
      maxResults: 50
    });
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const openTasks = openResponse.items || [];
    const filteredOpen = openTasks.filter(t => t.status !== 'completed' && (!t.due || new Date(t.due) <= todayEnd));
    data.tasks = filteredOpen.slice(0, 25).map(t => ({
      id: t.id,
      title: t.title,
      due: t.due || null,
      url: 'https://mail.google.com/tasks/canvas'
    }));

    // Recent Tasks
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentResponse = Tasks.Tasks.list(todoListId, {
      showCompleted: true,
      showHidden: true, showAssigned: true,
      updatedMin: thirtyDaysAgo.toISOString(),
      maxResults: 100
    });
    
    const allRecent = recentResponse.items || [];
    const updatedTasks = allRecent.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    data.recentTasks = updatedTasks.slice(0, 25).map(t => ({
      id: t.id,
      title: t.title,
      updated: t.updated,
      status: t.status,
      notesSnippet: (t.notes || "").substring(0, 50).replace(/\n/g, " ")
    }));

    data.workoutsTasks = [];
  } catch(e) { console.error("Error fetching tasks: " + e.message); }

  try {
    // 3.5 Fetch Workouts (Past 7 days, Next 7 days)
    const workoutKeywords = ["workout", "gym", "run", "swim", "lift", "cycle", "yoga", "training", "exercise", "cardio", "pilates", "boulder", "climb", "fitness"];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const workoutEvents = CalendarApp.getDefaultCalendar().getEvents(sevenDaysAgo, sevenDaysFromNow);
    
    const calWorkouts = workoutEvents
      .filter(e => {
        const title = (e.getTitle() || "").toLowerCase();
        return workoutKeywords.some(kw => title.includes(kw));
      })
      .map(e => ({
        title: e.getTitle(),
        startTime: e.getStartTime().toISOString(),
        endTime: e.getEndTime().toISOString()
      }));
      
    data.workouts = calWorkouts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 15);
  } catch(e) { console.error("Error fetching workouts: " + e.message); }

  try {
    // 4. Fetch 25 latest files modified
    const fileList = Drive.Files.list({
      q: "trashed=false and mimeType != 'application/vnd.google-apps.folder'",
      orderBy: "modifiedByMeTime desc",
      maxResults: 25,
      fields: "files(id, name, webViewLink, modifiedByMeTime, mimeType)"
    });
    if (fileList.files) {
      data.files = fileList.files.map(f => ({
        id: f.id,
        name: f.name,
        date: f.modifiedByMeTime,
        url: f.webViewLink,
        mimeType: f.mimeType
      }));
    }
  } catch(e) { console.error("Error fetching files: " + e.message); }

  try {
    // 5. Fetch 25 latest Clerk notes from Notes Log
    if (ss) {
      const notesLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.NOTES_LOG);
      if (notesLogSheet) {
        const lastRow = notesLogSheet.getLastRow();
        if (lastRow > 1) {
          const startRow = Math.max(2, lastRow - 24); // Up to 25 items
          const numRows = lastRow - startRow + 1;
          const logData = notesLogSheet.getRange(startRow, 1, numRows, 8).getValues();
          data.notes = logData.reverse().map(row => ({
            url: row[0],
            name: row[1],
            tasksCount: row[3],
            status: row[6],
            date: row[7] ? new Date(row[7]).toISOString() : new Date().toISOString()
          }));
        }
      }
    }
  } catch(e) { console.error("Error fetching notes: " + e.message); }

  try {
    // 6. Fetch 25 latest Clerk emails from Email Log
    if (ss) {
      const emailLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
      if (emailLogSheet) {
        const lastRow = emailLogSheet.getLastRow();
        if (lastRow > 1) {
          const startRow = Math.max(2, lastRow - 24);
          const numRows = lastRow - startRow + 1;
          const logData = emailLogSheet.getRange(startRow, 1, numRows, 8).getValues();
          data.clerkEmails = logData.reverse().map(row => {
            let parsedDate = "";
            try { parsedDate = row[0] ? new Date(row[0]).toISOString() : new Date().toISOString(); } catch(e) {}
            return {
              date: parsedDate,
              subject: row[1] || "No Subject",
              sender: row[2] || "Unknown",
              labels: row[3] || "",
              summary: row[4] || "",
              actions: row[5] || "",
              link: row[6] || "",
              status: row[7] || ""
            };
          });
        }
      }
    }
  } catch(e) { console.error("Error fetching clerk emails: " + e.message); }

  try {
    // 6.5 Fetch 25 latest Clerk tasks from Task Review
    if (ss) {
      const taskLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.TASK_REVIEW);
      if (taskLogSheet) {
        const lastRow = taskLogSheet.getLastRow();
        if (lastRow > 1) {
          const startRow = Math.max(2, lastRow - 24);
          const numRows = lastRow - startRow + 1;
          const logData = taskLogSheet.getRange(startRow, 1, numRows, 17).getValues();
          data.clerkTasks = logData.reverse().map(row => {
            let parsedDate = "";
            try { parsedDate = row[7] ? new Date(row[7]).toISOString() : new Date().toISOString(); } catch(e) {}
            return {
              date: parsedDate,
              originalTitle: row[4] || "Untitled", // Task Title
              due: row[7] || "",                  // Due Date
              targetList: row[1] || "",           // Task List
              cleanedTitle: row[4] || "",         // Cleaned Title
              category: row[3] ? (row[2] + " > " + row[3]) : (row[2] || "N/A"), // Combined Category
              notes: row[5] || "",                // Notes
              status: row[6] || "",               // Status
              taskId: row[14] || ""               // Task ID
            };
          });
        }
      }
    }
  } catch(e) { console.error("Error fetching clerk tasks: " + e.message); }

  try {
    // 8. Master Spreadsheet Link
    data.links.push({
      name: "Master Spreadsheet",
      url: `https://docs.google.com/spreadsheets/d/${SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID}/edit`,
      type: 'sheet'
    });
    
    // 7. Fetch Content for MD / Docs (Fast)
    try {
      // 1 Day Execution Plan
      const planId = getExecutionPlanId();
      if (planId) {
        data.executionPlan = DriveApp.getFileById(planId).getBlob().getDataAsString();
      }

      // 2-Day Vantage Log
      if (SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID) {
        const v2 = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID);
        data.vantageReport = v2.getBlob().getDataAsString();
        
        const vantageJson = parseVantageJson(data.vantageReport);
        data.health = {
          activeMinutes: vantageJson ? vantageJson.activeMinutes : parseActiveMinutesFromVantage(data.vantageReport),
          sleepHours: vantageJson ? vantageJson.sleepHours : parseSleepHoursFromVantage(data.vantageReport)
        };
      }

      // 14-Day Vantage Log
      if (workspaceFolder) {
        const v14Files = workspaceFolder.getFilesByName("Vantage_Log_14-Day.md");
        if (v14Files.hasNext()) {
          data.vantageReport14 = v14Files.next().getBlob().getDataAsString();
        } else {
          // Fallback search if exact name doesn't match
          const v14Search = workspaceFolder.searchFiles("title contains 'Vantage_Log_14-Day'");
          if (v14Search.hasNext()) data.vantageReport14 = v14Search.next().getBlob().getDataAsString();
        }
      }

      // Recent Reflections (Journal)
      if (SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID) {
        const rr = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID);
        data.recentReflections = rr.getBlob().getDataAsString();
      }
    } catch(e) { console.error("Error fetching docs: " + e.message); }
  } catch(e) { console.error("Error fetching links/drive content: " + e.message); }

  return data;
}


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

    const dates = data.slice(1)
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
    
    const todayStr = getLondonDateStr(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLondonDateStr(yesterday);
    
    if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
      return 0; // Streak broken
    }
    
    let streak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const curr = new Date(uniqueDates[i]);
      const next = new Date(uniqueDates[i + 1]);
      const diff = Math.round((curr - next) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        streak++;
      } else {
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

    const workoutKeywords = ["workout", "gym", "run", "swim", "lift", "cycle", "yoga", "training", "exercise", "cardio", "pilates", "boulder", "climb", "fitness"];
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
              const metaSplit = t.notes.split('---SYSTEM_METADATA---');
              if (metaSplit.length > 1) {
                try {
                  const meta = JSON.parse(metaSplit[1].trim());
                  if (meta.created_at) {
                    dateVal = new Date(meta.created_at).toISOString();
                    hasCreatedAt = true;
                  }
                } catch(e) {}
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
  const data = { bluf: "", frogs: { pmt: [], personal: [] }, top3: { pmt: [], personal: [] }, rest: { pmt: [], personal: [] }, alerts: [], triage: "" };
  if (typeof md !== "string") {
    console.warn("parseExecutionPlan received non-string input:", md);
    return data;
  }
  
  let currentSection = "";
  let currentCategory = ""; // "pmt" or "personal"
  
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
        else if (upperLine.includes("TRIAGE")) currentSection = "triage";
        continue;
      }
      
      // Support emojis or bold
      if (line.match(/^\*\*PMT:\*\*/i) || line.match(/^\*\*🎯 PMT:\*\*/i)) {
        currentCategory = "pmt";
        continue;
      }
      if (line.match(/^\*\*Personal:\*\*/i) || line.match(/^\*\*🏠 Personal:\*\*/i)) {
        currentCategory = "personal";
        continue;
      }
      
      // Regex to strip emojis
      const stripEmojis = (str) => str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}\u{2B50}\u{2B55}]/gu, '').trim();

      if (currentSection === "frogs" || currentSection === "top3" || currentSection === "rest") {
        if (line.startsWith("- [ ]") || line.startsWith("- [x]")) {
          const isChecked = line.startsWith("- [x]");
          // remove the checkbox syntax and strip emojis
          let text = line.replace(/^- \[[xX ]\]\s*/, "").trim();
          text = stripEmojis(text);
          if (text && currentCategory && data[currentSection] && data[currentSection][currentCategory]) {
            data[currentSection][currentCategory].push({ text, checked: isChecked });
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
    if (planId) {
      let plan = DriveApp.getFileById(planId).getBlob().getDataAsString();
      res.executionPlan = plan;
      res.executionPlanData = parseExecutionPlan(plan);
    }
      
      try {
        if (SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID) {
          const v2 = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID);
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

