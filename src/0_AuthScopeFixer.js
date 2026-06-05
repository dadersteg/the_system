/**
 * @file src/0_AuthScopeFixer.js
 * @description Diagnostic script designed to verify and fix Google Apps Script authorization,
 * scope, and resource access issues across all integrations of The System.
 * 
 * Functions available in the Apps Script Editor dropdown:
 * 1. triggerAuthPrompt() - Instantly triggers Google's OAuth consent dialog for all scopes.
 * 2. checkEverything() - Performs a deep diagnostic check on all resource IDs and credentials.
 *
 * @version 1.1.0
 * @last_modified 2026-05-29
 */

/**
 * Lightweight trigger function. Run this first if you changed appsscript.json scopes
 * or need to force the Google OAuth consent popup without doing a deep check.
 * 
 * @returns {void}
 */
function triggerAuthPrompt() {
  console.log("======================================================================");
  console.log("TRIGGERING OAUTH PROMPTS FOR ALL PROJECT SERVICES...");
  console.log("======================================================================");
  
  try {
    // Touch Calendar
    CalendarApp.getDefaultCalendar();
    console.log(" -> [Calendar] Accessed.");
    
    // Touch Drive
    DriveApp.getRootFolder();
    console.log(" -> [Drive] Accessed.");
    
    // Touch Gmail
    GmailApp.getInboxUnreadCount();
    console.log(" -> [Gmail] Accessed.");
    
    // Touch Spreadsheets
    const sheet = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("Temp Auth Trigger");
    if (sheet.getName() === "Temp Auth Trigger") {
      DriveApp.getFileById(sheet.getId()).setTrashed(true);
    }
    console.log(" -> [Sheets] Accessed.");
    
    // Touch Documents
    const doc = DocumentApp.create("Temp Auth Trigger");
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    console.log(" -> [Docs] Accessed.");
    
    // Touch Tasks API (Advanced Service)
    Tasks.Tasklists.list();
    console.log(" -> [Tasks API] Accessed.");
    
    // Touch UrlFetch & OAuth tokeninfo
    UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + ScriptApp.getOAuthToken(), { muteHttpExceptions: true });
    console.log(" -> [UrlFetch / Tokeninfo] Accessed.");

    console.log("\n🎉 Authorization trigger complete. If you saw no pop-ups, all scopes are already fully authorized.");
  } catch (e) {
    console.error("Error during trigger check (this might be due to user rejecting prompt or service error): " + e.message);
  }
}

/**
 * Runs deep diagnostics on all OAuth scopes and resources defined in SYSTEM_CONFIG to identify
 * and resolve authorization, access, or scope issues.
 * 
 * @returns {void}
 */
function checkEverything() {
  console.log("======================================================================");
  console.log("STARTING DIAGNOSTICS: Google OAuth Scopes & Resource Access Verifier");
  console.log("======================================================================");
  
  const results = {
    scopes: {},
    resources: {
      sheets: [],
      folders: [],
      docs: [],
      tasks: []
    },
    general: {}
  };

  // Helper to log test status
  function logResult(success, category, item, details) {
    const statusText = success ? "✅ SUCCESS" : "❌ FAILED";
    console.log(`[${statusText}] ${category} -> ${item}: ${details}`);
    return { success, item, details };
  }

  // ==================================================================
  // PART 1: TEST OAUTH SCOPES & SERVICE ACCESSIBILITY
  // ==================================================================
  
  console.log("\n--- Testing OAuth Scopes & Google Service APIs ---");

  // 1. Calendar Scope (https://www.googleapis.com/auth/calendar)
  try {
    const defaultCal = CalendarApp.getDefaultCalendar();
    results.scopes.calendar = logResult(true, "Scope", "Calendar", `Default Calendar: "${defaultCal.getName()}" (ID: ${defaultCal.getId()})`);
  } catch (e) {
    results.scopes.calendar = logResult(false, "Scope", "Calendar", e.message);
  }

  // 2. Drive Scope (https://www.googleapis.com/auth/drive)
  try {
    const root = DriveApp.getRootFolder();
    results.scopes.drive = logResult(true, "Scope", "Drive", `Access OK. Root folder: "${root.getName()}"`);
  } catch (e) {
    results.scopes.drive = logResult(false, "Scope", "Drive", e.message);
  }

  // 3. Gmail Scope (https://www.googleapis.com/auth/gmail.modify)
  try {
    const unreadCount = GmailApp.getInboxUnreadCount();
    results.scopes.gmail = logResult(true, "Scope", "Gmail", `Access OK. Unread messages in Inbox: ${unreadCount}`);
  } catch (e) {
    results.scopes.gmail = logResult(false, "Scope", "Gmail", e.message);
  }

  // 4. Spreadsheets Scope (https://www.googleapis.com/auth/spreadsheets)
  try {
    const tempSheet = SpreadsheetApp.getActiveSpreadsheet();
    if (tempSheet) {
      results.scopes.spreadsheets = logResult(true, "Scope", "Spreadsheets", `Access OK. Active Spreadsheet: "${tempSheet.getName()}"`);
    } else {
      const createdSheet = SpreadsheetApp.create("Temp Auth Test Spreadsheet");
      DriveApp.getFileById(createdSheet.getId()).setTrashed(true);
      results.scopes.spreadsheets = logResult(true, "Scope", "Spreadsheets", "Access OK. Temporary spreadsheet created and trashed successfully.");
    }
  } catch (e) {
    results.scopes.spreadsheets = logResult(false, "Scope", "Spreadsheets", e.message);
  }

  // 5. Tasks Scope (https://www.googleapis.com/auth/tasks)
  try {
    const taskLists = Tasks.Tasklists.list();
    const count = (taskLists.items || []).length;
    results.scopes.tasks = logResult(true, "Scope", "Tasks API", `Access OK. Found ${count} task list(s).`);
  } catch (e) {
    results.scopes.tasks = logResult(false, "Scope", "Tasks API", `Ensure Advanced Tasks Service is enabled. Error: ${e.message}`);
  }

  // 6. Documents Scope (https://www.googleapis.com/auth/documents)
  try {
    const tempDoc = DocumentApp.create("Temp Auth Test Document");
    const docId = tempDoc.getId();
    DriveApp.getFileById(docId).setTrashed(true); // Clean up
    results.scopes.documents = logResult(true, "Scope", "Documents", "Access OK. Temporary Document created and trashed successfully.");
  } catch (e) {
    results.scopes.documents = logResult(false, "Scope", "Documents", e.message);
  }

  // 7. Script External Request & Tokeninfo (https://www.googleapis.com/auth/script.external_request)
  try {
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + token, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const tokenInfo = JSON.parse(response.getContentText());
      const authorizedScopes = (tokenInfo.scope || "").split(" ");
      results.scopes.external_request = logResult(true, "Scope", "External Request & Tokeninfo", `Access OK. Token verified by Google OAuth server.`);
      
      console.log("\n--- Active Authorized Scopes in Current Session ---");
      authorizedScopes.forEach(s => console.log(` - ${s}`));
    } else {
      results.scopes.external_request = logResult(false, "Scope", "External Request", `HTTP Status ${response.getResponseCode()}: ${response.getContentText()}`);
    }
  } catch (e) {
    results.scopes.external_request = logResult(false, "Scope", "External Request", e.message);
  }

  // ==================================================================
  // PART 2: RESOURCE ACCESSIBILITY (IDs from SYSTEM_CONFIG)
  // ==================================================================
  
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG) {
    console.error("SYSTEM_CONFIG is not defined! Make sure Code_Config.js is included in your project.");
    return;
  }

  console.log("\n--- Verifying SYSTEM_CONFIG Resource Identifiers ---");

  // A. Check Sheets
  const sheetsToTest = [
    { name: "MASTER_SHEET_ID", id: SYSTEM_CONFIG.ROOTS?.MASTER_SHEET_ID },
    { name: "HABITS_SHEET_ID", id: SYSTEM_CONFIG.ROOTS?.HABITS_SHEET_ID },
    { name: "DRIVE_RULES_SHEET_ID", id: SYSTEM_CONFIG.ROOTS?.DRIVE_RULES_SHEET_ID }
  ];

  sheetsToTest.forEach(sheetInfo => {
    if (!sheetInfo.id) {
      results.resources.sheets.push(logResult(false, "Resource", `Sheet (${sheetInfo.name})`, "ID is empty or undefined in SYSTEM_CONFIG.ROOTS."));
      return;
    }
    try {
      const sheet = SpreadsheetApp.openById(sheetInfo.id);
      results.resources.sheets.push(logResult(true, "Resource", `Sheet (${sheetInfo.name})`, `Accessible. Title: "${sheet.getName()}" (ID: ${sheetInfo.id})`));
    } catch (e) {
      results.resources.sheets.push(logResult(false, "Resource", `Sheet (${sheetInfo.name})`, `Inaccessible (ID: ${sheetInfo.id}). Error: ${e.message}`));
    }
  });

  // B. Check Folders
  const foldersToTest = [
    { name: "WORKSPACE_FOLDER_ID", id: SYSTEM_CONFIG.ROOTS?.WORKSPACE_FOLDER_ID },
    { name: "STND_DEST", id: SYSTEM_CONFIG.DRIVE_FOLDERS?.STND_DEST },
    { name: "REVIEW", id: SYSTEM_CONFIG.DRIVE_FOLDERS?.REVIEW }
  ];

  if (Array.isArray(SYSTEM_CONFIG.DRIVE_FOLDERS?.STND_SOURCES)) {
    SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.forEach((id, index) => {
      foldersToTest.push({ name: `STND_SOURCES[${index}]`, id: id });
    });
  }

  if (Array.isArray(SYSTEM_CONFIG.CLERK_NOTES_FOLDERS?.ROUTE_MODE)) {
    SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.ROUTE_MODE.forEach((id, index) => {
      foldersToTest.push({ name: `CLERK_NOTES ROUTE_MODE[${index}]`, id: id });
    });
  }
  if (Array.isArray(SYSTEM_CONFIG.CLERK_NOTES_FOLDERS?.CLEAN_MODE)) {
    SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.CLEAN_MODE.forEach((id, index) => {
      foldersToTest.push({ name: `CLERK_NOTES CLEAN_MODE[${index}]`, id: id });
    });
  }

  foldersToTest.forEach(folderInfo => {
    if (!folderInfo.id) {
      results.resources.folders.push(logResult(false, "Resource", `Folder (${folderInfo.name})`, "ID is empty or undefined in SYSTEM_CONFIG."));
      return;
    }
    try {
      const folder = DriveApp.getFolderById(folderInfo.id);
      results.resources.folders.push(logResult(true, "Resource", `Folder (${folderInfo.name})`, `Accessible. Folder Name: "${folder.getName()}" (ID: ${folderInfo.id})`));
    } catch (e) {
      results.resources.folders.push(logResult(false, "Resource", `Folder (${folderInfo.name})`, `Inaccessible (ID: ${folderInfo.id}). Error: ${e.message}`));
    }
  });

  // C. Check Google Docs
  const docsToTest = [];
  if (SYSTEM_CONFIG.DOCS) {
    Object.keys(SYSTEM_CONFIG.DOCS).forEach(key => {
      docsToTest.push({ name: key, id: SYSTEM_CONFIG.DOCS[key] });
    });
  }

  docsToTest.forEach(docInfo => {
    if (!docInfo.id) {
      results.resources.docs.push(logResult(false, "Resource", `Doc (${docInfo.name})`, "ID is empty or undefined in SYSTEM_CONFIG.DOCS."));
      return;
    }
    try {
      let title = "";
      try {
        const doc = DocumentApp.openById(docInfo.id);
        title = `Google Doc: "${doc.getName()}"`;
      } catch (docErr) {
        const file = DriveApp.getFileById(docInfo.id);
        title = `Drive File: "${file.getName()}" (${file.getMimeType()})`;
      }
      results.resources.docs.push(logResult(true, "Resource", `Doc/File (${docInfo.name})`, `Accessible. ${title} (ID: ${docInfo.id})`));
    } catch (e) {
      results.resources.docs.push(logResult(false, "Resource", `Doc/File (${docInfo.name})`, `Inaccessible (ID: ${docInfo.id}). Error: ${e.message}`));
    }
  });

  // D. Check Task Lists
  const tasksToTest = [];
  if (SYSTEM_CONFIG.TASKS) {
    Object.keys(SYSTEM_CONFIG.TASKS).forEach(key => {
      if (key !== "TASK_MASTER_INDEX") {
        tasksToTest.push({ name: key, id: SYSTEM_CONFIG.TASKS[key] });
      }
    });
  }

  tasksToTest.forEach(taskInfo => {
    if (!taskInfo.id) {
      results.resources.tasks.push(logResult(false, "Resource", `TaskList (${taskInfo.name})`, "ID is empty or undefined in SYSTEM_CONFIG.TASKS."));
      return;
    }
    try {
      const taskList = Tasks.Tasklists.get(taskInfo.id);
      results.resources.tasks.push(logResult(true, "Resource", `TaskList (${taskInfo.name})`, `Accessible. Title: "${taskList.title}" (ID: ${taskInfo.id})`));
    } catch (e) {
      results.resources.tasks.push(logResult(false, "Resource", `TaskList (${taskInfo.name})`, `Inaccessible (ID: ${taskInfo.id}). Error: ${e.message}`));
    }
  });

  // E. Check Gemini API Key
  const geminiKey = SYSTEM_CONFIG.SECRETS?.GEMINI_API_KEY;
  if (!geminiKey) {
    results.general.gemini = logResult(false, "Secret", "GEMINI_API_KEY", "Not found in Script Properties!");
  } else {
    const masked = geminiKey.substring(0, 4) + "..." + geminiKey.substring(geminiKey.length - 4);
    results.general.gemini = logResult(true, "Secret", "GEMINI_API_KEY", `Configured in Script Properties (Muted: ${masked})`);
  }

  // ==================================================================
  // PART 3: DIAGNOSTIC SUMMARY
  // ==================================================================
  console.log("\n======================================================================");
  console.log("DIAGNOSTICS COMPLETE - SUMMARY REPORT");
  console.log("======================================================================");
  
  let totalTests = 0;
  let totalSuccess = 0;

  function countResults(arr) {
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        totalTests++;
        if (item.success) totalSuccess++;
      });
    } else if (typeof arr === 'object') {
      Object.keys(arr).forEach(k => {
        totalTests++;
        if (arr[k].success) totalSuccess++;
      });
    }
  }

  countResults(results.scopes);
  countResults(results.resources.sheets);
  countResults(results.resources.folders);
  countResults(results.resources.docs);
  countResults(results.resources.tasks);
  countResults(results.general);

  console.log(`Passed: ${totalSuccess} / ${totalTests} checks`);
  
  if (totalSuccess === totalTests) {
    console.log("🎉 ALL SYSTEMS GO! Authorization, scopes, and configuration references are 100% correct and accessible.");
  } else {
    const failedCount = totalTests - totalSuccess;
    console.warn(`⚠️ ALERT: ${failedCount} test(s) failed. Please review the log output above to resolve the specific access issues.`);
  }
  console.log("======================================================================");
}

/**
 * Helper to update the WORKSPACE_FOLDER_ID UserProperty for the Work profile.
 * Run this function once from the dropdown in your Work Google Apps Script editor.
 */
function setWorkWorkspaceFolderProperty() {
  const workWorkspaceFolderId = "1Jb5PhZnrqsP3uoUE20Lv75eO4zySPyTr";
  try {
    const props = PropertiesService.getUserProperties();
    props.setProperty("WORKSPACE_FOLDER_ID", workWorkspaceFolderId);
    props.setProperty("IS_WORK_ACCOUNT", "true");
    console.log("======================================================================");
    console.log("SUCCESS: WORKSPACE_FOLDER_ID and IS_WORK_ACCOUNT properties configured!");
    console.log("WORKSPACE_FOLDER_ID: " + workWorkspaceFolderId);
    console.log("IS_WORK_ACCOUNT: true");
    console.log("======================================================================");
  } catch (e) {
    console.error("Failed to set properties: " + e.message);
  }
}

/**
 * Configures the Google Apps Script user properties for The Clerk Notes on the Work account.
 * Run this function once from the dropdown in your Work Google Apps Script editor.
 */
function setWorkClerkNotesProperties() {
  const properties = {
    "NOTES_ROUTE_MODE": "1dKBJ8w8B2-O06uh-5N9WhIoavj8uMzmM",
    "NOTES_CLEAN_MODE": "1dZuVjvnWwWTe4qwXKs6huK8qVKGR1WDT",
    "NOTES_RUNNING_DOCS": "1Q-ADivuGgaknMWbEFe-1QnS2v9c5K9FHdnPDifo0JDI",
    "NOTES_LOG_GID": "967747913"
  };
  try {
    const props = PropertiesService.getUserProperties();
    props.setProperties(properties);
    console.log("======================================================================");
    console.log("SUCCESS: Work Clerk Notes User Properties configured successfully!");
    console.log(JSON.stringify(properties, null, 2));
    console.log("======================================================================");
  } catch (e) {
    console.error("Failed to set Work Clerk Notes properties: " + e.message);
  }
}

/**
 * Prepends the standard instruction header to the Work Running Notes Google Doc.
 * Run this function once from the dropdown in your Work Google Apps Script editor.
 */
function setupWorkClerkRunningNotesDoc() {
  const docId = "1Q-ADivuGgaknMWbEFe-1QnS2v9c5K9FHdnPDifo0JDI";
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const text = body.getText();
    
    if (!text.includes("WORK RUNNING NOTES")) {
      const instructions = 
        "# WORK RUNNING NOTES\n" +
        "Instructions: Append new meeting notes or scratchpad items at the very bottom of this document. " +
        "The Clerk will automatically sweep the document, clean your notes into structured markdown, " +
        "extract actionable tasks to your Work tasks backlog, and append a new '--- PROCESSED [Timestamp] ---' " +
        "divider. Do not modify text above the latest processed divider.\n\n" +
        "--- PROCESSED Initialized ---\n\n";
        
      body.insertParagraph(0, instructions.trim() + "\n\n");
      console.log("======================================================================");
      console.log("SUCCESS: Prepended instructions to the Running Notes doc (ID: " + docId + ")");
      console.log("======================================================================");
    } else {
      console.log("Instructions already present in the Running Notes doc.");
    }
  } catch (e) {
    console.error("Failed to update Running Notes doc: " + e.message);
  }
}

/**
 * Automates the insertion of the new Work Profile API Key into Script Properties.
 * Run this function once from the dropdown in your Work Google Apps Script editor.
 */
function setWorkGeminiAPIKey() {
  const newApiKey = "REPLACE_WITH_YOUR_KEY";
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("GEMINI_API_KEY", newApiKey);
    console.log("======================================================================");
    console.log("SUCCESS: Work Profile GEMINI_API_KEY configured securely in the cloud!");
    console.log("======================================================================");
  } catch (e) {
    console.error("Failed to set GEMINI_API_KEY: " + e.message);
  }
}
