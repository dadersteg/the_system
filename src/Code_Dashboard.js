/**
 * @file Code_Dashboard.js
 * @description Backend logic for the web app dashboard, providing data from Google Sheets, Drive, and Tasks.
 *
 * @version 1.0.0
 * @last_modified 2026-05-30
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added JSDoc header, optimized performance, replaced hardcoded IDs, improved UI.
 */

let _cachedMasterSheet = null;

let _cachedPersonaSheet = null;
function getPersonaSheet() {
  if (!_cachedPersonaSheet) {
    _cachedPersonaSheet = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.PERSONA_SHEET_ID);
  }
  return _cachedPersonaSheet;
}

function getMasterSheet() {
  if (!_cachedMasterSheet) {
    _cachedMasterSheet = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
  }
  return _cachedMasterSheet;
}

function debugGetHeaders() {
   const ss = getMasterSheet();
   const notes = ss.getSheets().find(s => s.getSheetId().toString() === "967747913");
   const emails = ss.getSheets().find(s => s.getSheetId().toString() === "2131515996");
   const tasks = ss.getSheets().find(s => s.getSheetId().toString() === "1580572397");
   return JSON.stringify({
     notes: notes ? notes.getRange(1, 1, 1, Math.max(1, notes.getLastColumn())).getValues()[0] : [],
     emails: emails ? emails.getRange(1, 1, 1, Math.max(1, emails.getLastColumn())).getValues()[0] : [],
     tasks: tasks ? tasks.getRange(1, 1, 1, Math.max(1, tasks.getLastColumn())).getValues()[0] : []
   });
}

function doGet(e) {
  if (e && e.parameter && e.parameter.getHeaders === "true") {
     return ContentService.createTextOutput(debugGetHeaders());
  }
   if (e && e.parameter && e.parameter.debugVantage === "true") {
      return ContentService.createTextOutput(DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_DEBUG_FILE_ID).getBlob().getDataAsString());
   }

  if (e && e.parameter && e.parameter.vantage === "true") {
     return ContentService.createTextOutput(DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_FILE_ID).getBlob().getDataAsString());
  }
   if (e && e.parameter && e.parameter.debugActualTasks === "true") {
      const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
      const response = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, maxResults: 10 });
      return ContentService.createTextOutput(JSON.stringify(response.items));
   }

   if (e && e.parameter && e.parameter.debugTasks === "true") {
      const ss = getMasterSheet();
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
      const ss = getMasterSheet();
      const sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG);
      const lr = sheet.getLastRow();
      const startRow = Math.max(2, lr - 24);
      const numRows = Math.max(1, lr - startRow + 1);
      const data = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
      return ContentService.createTextOutput(JSON.stringify(data));
   }
   if (e && e.parameter && e.parameter.getKey === "true") {
     return ContentService.createTextOutput(PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"));
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
     createRecurringCarryTasks();
     return ContentService.createTextOutput("Successfully created recurring tasks.");
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
  if (e && e.parameter && e.parameter.runTaskMaster === "true") {
     run1DayTaskMaintenance();
     return ContentService.createTextOutput("Successfully ran Task Master Engine.");
  }
  if (e && e.parameter && e.parameter.action === "runTheClerkEmailRetro") {
     const limit = parseInt(e.parameter.limit || "15", 10);
     const result = runTheClerkEmailRetroBatch(limit);
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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
  }
  if (e && e.parameter && e.parameter.action === "updateFileText") {
     const fileId = e.parameter.fileId;
     const text = e.postData.contents;
     const doc = DocumentApp.openById(fileId);
     doc.getBody().setText(text);
     doc.saveAndClose();
     return ContentService.createTextOutput("Successfully updated document").setMimeType(ContentService.MimeType.TEXT);
  }
  if (e && e.parameter && e.parameter.action === "createNewDoc") {
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
  }
  if (e && e.parameter && e.parameter.action === "fixSpreadsheetTypos") {
     const ssId = e.parameter.ssId;
     const result = fixSpreadsheetTypos(ssId);
     return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
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
  if (e && e.parameter && e.parameter.action === "createAxaContinuationTask") {
     const result = createAxaContinuationTask();
     return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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
        showHidden: true,
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
        'Backlog': SYSTEM_CONFIG.TASKS.BACKLOG_LIST_ID,
        'To_Be_Deleted': SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID,
        'Recurring': SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID
      };
      for (const [name, id] of Object.entries(listIds)) {
        try {
          const response = Tasks.Tasks.list(id, {
            showCompleted: true,
            showHidden: true,
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



  return HtmlService.createTemplateFromFile('WebApp_Dashboard').evaluate()
      .setTitle('The System Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Ensure the UI functions are accessible
function getSheetsList() {
  const ss = getMasterSheet();
  return ss.getSheets().map(sheet => ({
    name: sheet.getName(),
    id: sheet.getSheetId()
  }));
}

function sortTabs() {
  try {
    const ss = getMasterSheet();
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
    const ss = getMasterSheet();
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
    const ss = getMasterSheet();
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
    const ss = getMasterSheet();
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
// EXTENDED ALIGNMENT CAPABILITIES
// ----------------------------------------------------

function hideSheets(matchStr) {
  try {
    const ss = getMasterSheet();
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
    const ss = getMasterSheet();
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
    const ss = getMasterSheet();
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
    
    const ss = getMasterSheet();
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
    
    const ss = getMasterSheet();
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
        showHidden: false,
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
    ss = getMasterSheet();
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
      showHidden: false,
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
      showHidden: true,
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

    // Extract workout tasks from allRecent
    const workoutKeywords = ["workout", "gym", "run", "swim", "lift", "cycle", "yoga", "training", "exercise", "cardio", "pilates", "boulder", "climb", "fitness"];
    const workoutTasks = allRecent.filter(t => {
      const title = (t.title || "").toLowerCase();
      return workoutKeywords.some(kw => title.includes(kw));
    }).map(t => ({
      title: t.title,
      startTime: t.updated || new Date().toISOString(),
      endTime: t.updated || new Date().toISOString()
    }));
    
    data.workoutsTasks = workoutTasks;
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
      
    data.workouts = [...calWorkouts, ...(data.workoutsTasks || [])].sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 15);
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
      const notesLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.NOTES_LOG);
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
      const emailLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG);
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
      const taskLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.TASK_REVIEW);
      if (taskLogSheet) {
        const lastRow = taskLogSheet.getLastRow();
        if (lastRow > 1) {
          const startRow = Math.max(2, lastRow - 24);
          const numRows = lastRow - startRow + 1;
          const logData = taskLogSheet.getRange(startRow, 1, numRows, 8).getValues();
          data.clerkTasks = logData.reverse().map(row => {
            let parsedDate = "";
            try { parsedDate = row[0] ? new Date(row[0]).toISOString() : new Date().toISOString(); } catch(e) {}
            return {
              date: parsedDate,
              originalTitle: row[1] || "Untitled",
              due: row[2] || "",
              targetList: row[3] || "",
              cleanedTitle: row[4] || "",
              notes: row[5] || "",
              status: row[6] || "",
              taskId: row[7] || ""
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
      if (workspaceFolder) {
        const planFiles = workspaceFolder.getFilesByName("TS - Task Master > 1 Day Execution Plan.md");
        if (planFiles.hasNext()) {
          data.executionPlan = planFiles.next().getBlob().getDataAsString();
        }
      }

      // 2-Day Vantage Log
      if (SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID) {
        const v2 = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID);
        data.vantageReport = v2.getBlob().getDataAsString();
        
        let activeMinutes = 0;
        let sleepHours = 0;
        const activeMatch = data.vantageReport.match(/Total Active\/Cardio Minutes:\s*(\d+)/i);
        if (activeMatch) activeMinutes = parseInt(activeMatch[1], 10);
        const sleepMatch = data.vantageReport.match(/Avg Sleep:\s*([\d\.]+)/i);
        if (sleepMatch) sleepHours = parseFloat(sleepMatch[1]);
        
        data.health = { activeMinutes: activeMinutes, sleepHours: sleepHours };
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

function createAxaContinuationTask() {
  // 1. Complete the existing task "Evaluate AXA Policy Status"
  const completionResult = completeTaskByTitle("Evaluate AXA Policy Status");
  
  // 2. Create the One Pager Google Doc
  const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(folderId);
  const doc = DocumentApp.create("One Pager - Call AXA to Transfer Group Policy");
  const body = doc.getBody();
  
  body.appendParagraph("One Pager: AXA Health Policy Continuation").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  
  body.appendParagraph("This note contains the necessary details to transfer Daniel Adersteg's corporate AXA Health insurance (provided by Revolut) to a personal policy while preserving Medical History Disregarded (MHD) terms.\n");
  
  const detailsSection = body.appendParagraph("Key Policy Details");
  detailsSection.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("• Lead Member: Daniel Erik Patrik Adersteg (DOB: 19-Sep-1990)");
  body.appendParagraph("• Covered Partner: Carina Martens Adersteg (DOB: 06-Aug-1993, joined scheme on 08-Dec-2025)");
  body.appendParagraph("• Former Employer: Revolut Ltd");
  body.appendParagraph("• Group Policy Number: 96660");
  body.appendParagraph("• Current Plan Tier: ADVANCE (Couple Cover)");
  body.appendParagraph("• Date of Joining Group Scheme: 01-Apr-2020");
  body.appendParagraph("• Underwriting Terms: Medical History Disregarded (MHD) - Covers pre-existing conditions.");
  body.appendParagraph("• Offboarding / Last Day of Contract: 25 May 2026");
  
  const claimsSection = body.appendParagraph("Pending Claims & Shortfall");
  claimsSection.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("• Outpatient consultation & diagnostic tests with Prof. Ghassan Alusi occurred on 5 May 2026 (prior to offboarding date, so covered).");
  body.appendParagraph("• Consultation total cost was £270.00. AXA paid £170.00.");
  body.appendParagraph("• Action Required: Daniel owes a £100.00 excess shortfall to Alusi Ent Ltd (T/A G Alusi, Invoice Ref: GA97726344959Y). This is an outstanding personal liability to be settled directly with the clinic.");
  body.appendParagraph("• Diagnostic tests total cost was £813.67, paid in full by AXA on 19 May 2026.");
  
  const transferSection = body.appendParagraph("How to Complete the Transfer");
  transferSection.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("• AXA Health Company Leavers Phone Number: 0800 028 2915 (Alternative: 0800 032 1965)");
  body.appendParagraph("• What to request: 'Transfer from Revolut corporate scheme (Group 96660) to a personal plan under Continuous Personal Terms (CPT) to preserve our MHD (Medical History Disregarded) status.'");
  body.appendParagraph("• Timeline: Must be completed within 30 days of leaving the scheme (by 24 June 2026) to guarantee MHD terms are transferred without new underwriting.");
  body.appendParagraph("• Alternative: You can log into the member portal (axahealth.co.uk/claim) and initiate a request via Live Chat, though a phone call may still be required to set up payment details.");
  
  doc.saveAndClose();
  
  // Move file to Workspace folder
  const file = DriveApp.getFileById(doc.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  
  const docUrl = doc.getUrl();
  
  // 3. Create the new task
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const taskResource = {
    title: "Call AXA to transfer group policy to personal plan",
    notes: "Review one pager and make the call to complete transfer: " + docUrl,
    due: "2026-05-31T23:59:59.000Z"
  };
  const taskResult = Tasks.Tasks.insert(taskResource, todoListId);
  
  return {
    success: true,
    completionResult: completionResult,
    docUrl: docUrl,
    docName: doc.getName(),
    newTaskId: taskResult.id
  };
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
    let sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.HABITS_LOG);
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
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
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.HABITS_LOG) || ss.getSheets()[0];
    if (!sheet) return 0;
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    
    const dates = data.slice(1)
      .filter(row => row[1] === habitName)
      .map(row => row[2])
      .sort((a, b) => new Date(b) - new Date(a));
      
    if (dates.length === 0) return 0;
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0,0,0,0);
    
    let lastLoggedDate = new Date(dates[0]);
    lastLoggedDate.setHours(0,0,0,0);
    
    const diffDays = Math.floor((currentDate - lastLoggedDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return 0; // Streak broken
    
    let checkDate = new Date(lastLoggedDate);
    const uniqueDates = [...new Set(dates)];
    
    for (let i = 0; i < uniqueDates.length; i++) {
      const d = new Date(uniqueDates[i]);
      d.setHours(0,0,0,0);
      if (d.getTime() === checkDate.getTime()) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  } catch (e) {
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
    const ss = getMasterSheet();
    const logSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG);
    let whatsappContext = "No recent WhatsApp context found.";
    
    if (logSheet) {
      const data = logSheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase().trim());
      const subjectIdx = headers.indexOf('subject');
      const senderIdx = headers.indexOf('sender');
      const summaryIdx = headers.indexOf('ai summary');
      const labelsIdx = headers.indexOf('final label set');
      
      const recentWifieChats = [];
      
      for (let i = data.length - 1; i >= Math.max(1, data.length - 100); i--) {
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
      const personaSs = getPersonaSheet();
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
  const ss = getPersonaSheet();
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
            updated = true;
          }
        }
      }
    }
    if (updated) {
      try {
        range.setValues(values);
      } catch (e) {
        for (let r = 0; r < values.length; r++) {
          for (let c = 0; c < values[r].length; c++) {
            try {
              sheet.getRange(r + 1, c + 1).setValue(values[r][c]);
            } catch (cellError) {
              // Ignore validation exceptions for specific cells
            }
          }
        }
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
  } catch(e) { console.error("Error emails: " + e.message); return []; }
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
  } catch(e) { console.error("Error cal: " + e.message); return []; }
}

function getDashboardTasks() { const startT = Date.now();
  const res = { tasks: [], recentTasks: [], workoutsTasks: [], workouts: [] };
  try {
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const openResponse = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, maxResults: 50 });
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const openTasks = openResponse.items || [];
    const filteredOpen = openTasks.filter(t => t.status !== 'completed' && (!t.due || new Date(t.due) <= todayEnd));
    res.tasks = filteredOpen.slice(0, 25).map(t => ({ id: t.id, title: t.title, due: t.due || null, url: 'https://mail.google.com/tasks/canvas' }));

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentResponse = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, updatedMin: thirtyDaysAgo.toISOString(), maxResults: 100 });
    const allRecent = recentResponse.items || [];
    const updatedTasks = allRecent.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    res.recentTasks = updatedTasks.slice(0, 25).map(t => ({ id: t.id, title: t.title, updated: t.updated, status: t.status, notesSnippet: (t.notes || "").substring(0, 50).replace(/\n/g, " ") }));

    const workoutKeywords = ["workout", "gym", "run", "swim", "lift", "cycle", "yoga", "training", "exercise", "cardio", "pilates", "boulder", "climb", "fitness"];
    res.workoutsTasks = allRecent.filter(t => workoutKeywords.some(kw => (t.title || "").toLowerCase().includes(kw))).map(t => ({ title: t.title, startTime: t.updated || new Date().toISOString(), endTime: t.updated || new Date().toISOString() }));

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const workoutEvents = CalendarApp.getDefaultCalendar().getEvents(sevenDaysAgo, sevenDaysFromNow);
    const calWorkouts = workoutEvents.filter(e => workoutKeywords.some(kw => (e.getTitle() || "").toLowerCase().includes(kw))).map(e => ({ title: e.getTitle(), startTime: e.getStartTime().toISOString(), endTime: e.getEndTime().toISOString() }));
    res.workouts = [...calWorkouts, ...res.workoutsTasks].sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 15);
  } catch(e) { console.error("Error tasks: " + e.message); }
  console.log("Docs load time: " + (Date.now() - startT) + "ms"); return res; }

function getDashboardFiles() {
  try {
    const fileList = Drive.Files.list({ q: "trashed=false and mimeType != 'application/vnd.google-apps.folder'", orderBy: "modifiedByMeTime desc", maxResults: 25, fields: "files(id, name, webViewLink, modifiedByMeTime, mimeType)" });
    return (fileList.files || []).map(f => ({ id: f.id, name: f.name, date: f.modifiedByMeTime, url: f.webViewLink, mimeType: f.mimeType }));
  } catch(e) { console.error("Error files: " + e.message); return []; }
}

function getDashboardClerkLogs() { const startT = Date.now();
  const res = { emails: [], notes: [], tasks: [] };
  try {
    // Hardcode to the provided master spreadsheet ID to ensure we find the logs
    const ss = getMasterSheet();
    const allSheets = ss.getSheets();
    
    const safeDate = (val) => {
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    };
    
    const notesLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.NOTES_LOG || s.getName().toLowerCase().includes('notes log') || s.getName().toLowerCase().includes('notes_log') || s.getName().toLowerCase() === 'files');
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
    
    const emailLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG || s.getName().toLowerCase().includes('email log') || s.getName().toLowerCase().includes('email_log') || s.getName().toLowerCase() === 'emails');
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
    
    const taskLogSheet = allSheets.find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.TASK_REVIEW || s.getName().toLowerCase().includes('task review') || s.getName().toLowerCase().includes('task_review') || s.getName().toLowerCase().includes('tasks'));
    if (taskLogSheet) {
      const lastRow = taskLogSheet.getLastRow();
      if (lastRow > 1) {
        const lastCol = Math.max(taskLogSheet.getLastColumn(), 1);
        const fetchCount = Math.min(500, lastRow - 1);
        const fetchStartRow = lastRow - fetchCount + 1;
        const data = taskLogSheet.getRange(fetchStartRow, 1, fetchCount, lastCol).getValues();
        res.tasks = data.filter(row => row.join('').trim().length > 0)
          .map(row => ({ date: safeDate(row[11] || row[0]), originalTitle: row[3] || "Untitled", due: row[12] || "", targetList: row[2] || row[1] || "", cleanedTitle: row[6] || row[5] || "", notes: row[8] || row[7] || "", status: row[10] || row[9] || "", taskId: row[23] || "" }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 25);
      }
    }
  } catch(e) { console.error("Error clerk: " + e.message); }
  console.log("Clerk logs load time: " + (Date.now() - startT) + "ms"); return res; }

function parseExecutionPlan(md) {
  const data = { bluf: "", frogs: { work: [], personal: [] }, top3: { work: [], personal: [] }, rest: { work: [], personal: [] }, alerts: [], triage: "" };
  let currentSection = "";
  let currentCategory = ""; // "work" or "personal"
  
  const lines = md.split('\n');
  for (let line of lines) {
    if (line.startsWith("**BLUF:**")) {
      data.bluf = line.replace("**BLUF:**", "").trim();
      continue;
    }
    if (line.match(/^#+\s/)) {
      if (line.toUpperCase().includes("EAT THE FROG")) currentSection = "frogs";
      else if (line.toUpperCase().includes("TOP 3")) currentSection = "top3";
      else if (line.toUpperCase().includes("REST OF TODAY")) currentSection = "rest";
      else if (line.toUpperCase().includes("BOTTLENECKS") || line.toUpperCase().includes("SYS ALERTS")) currentSection = "alerts";
      else if (line.toUpperCase().includes("TRIAGE")) currentSection = "triage";
      continue;
    }
    
    // Support emojis or bold
    if (line.match(/^\*\*Work:\*\*/i) || line.match(/^\*\*💼 Work:\*\*/i)) {
      currentCategory = "work";
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
        if (text && currentCategory && data[currentSection][currentCategory]) {
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
    const workspaceFolder = DriveApp.getFolderById(SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID);
    if (workspaceFolder) {
      const planFiles = workspaceFolder.getFilesByName("TS - Task Master > 1 Day Execution Plan.md");
      if (planFiles.hasNext()) {
        let plan = planFiles.next().getBlob().getDataAsString();
        res.executionPlan = plan;
        res.executionPlanData = parseExecutionPlan(plan);
      }
      
      try {
        if (SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID) {
          const v2 = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID);
          res.vantageReport = v2.getBlob().getDataAsString();
          let activeMinutes = 0;
          let sleepHours = 0;
          
          const tMatch = res.vantageReport.match(/Active Min[a-z]*[^\d\n]*(\d+)/i) || res.vantageReport.match(/Total Active\/Cardio Minutes:[^\d\n]*(\d+)/i);
          if (tMatch) activeMinutes = parseInt(tMatch[1], 10);
          
          const sMatch = res.vantageReport.match(/Avg Sleep[^\d\n]*(\d+(?:\.\d+)?)/i);
          if (sMatch) sleepHours = parseFloat(sMatch[1]);
          
          res.activeMinutes = activeMinutes;
          res.sleepHours = sleepHours;
        }
      } catch(e) { console.error("Error loading 2-day report: " + e.message); }
    }
    
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
    const completedTasksResponse = Tasks.Tasks.list(todoListId, { showCompleted: true, showHidden: true, maxResults: 100 });
    if (completedTasksResponse.items) {
       res.completedTasksCount = completedTasksResponse.items.filter(t => t.status === 'completed' && t.completed && t.completed >= todayStart).length;
    }
    const inboxThreads = GmailApp.search('label:00-manual-review', 0, 100);
    res.manualReviewCount = inboxThreads.length;
  } catch(e) { console.error("Error docs: " + e.message); }
  console.log("Docs load time: " + (Date.now() - startT) + "ms"); return res; }
// trigger push
 
// 
