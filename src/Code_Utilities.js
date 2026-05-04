/**
 * @file Code_Utilities.js
 * @description General utilities for maintaining and auditing the workspace. Provides directory mapping, archive resetting, taxonomy exporting, and AI utility functions.
 *
 * @version 1.0.1
 * @last_modified 2026-05-04
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added standardized documentation header, JSDoc descriptions for all functions, aggressive type checking, and error boundaries.
 */

/**
 * THE SYSTEM: GENERAL UTILITIES
 * Useful background scripts for maintaining and auditing the workspace.
 */

const UTIL_PROPS = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
const TARGET_FOLDER_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("WORKSPACE_FOLDER_ID") : null;
const MASTER_SHEET_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("MASTER_SHEET_ID") : null;

// ==========================================
// 1. DIRECTORY MAPPER (Google Drive)
// ==========================================

/**
 * Executes a folder mapping starting from the target workspace folder, logging the output to a specific sheet.
 * @returns {void}
 */
function executeFolderMapping() {
  if (!TARGET_FOLDER_ID) {
    console.error("executeFolderMapping failed: Missing Script Property WORKSPACE_FOLDER_ID");
    return;
  }
  if (!MASTER_SHEET_ID) {
    console.error("executeFolderMapping failed: Missing Script Property MASTER_SHEET_ID");
    return;
  }

  const MAPPER_GID = "536537641";

  try {
    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === MAPPER_GID);
    if (!sheet) {
      console.error(`executeFolderMapping failed: Could not find sheet with GID ${MAPPER_GID}`);
      return;
    }
    sheet.clearContents();

    const headers = ["Depth", "Structure", "Folder ID", "Absolute Path"];
    const outputData = [headers];

    const rootFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const rootName = rootFolder.getName();
    
    outputData.push([0, rootName, rootFolder.getId(), `/${rootName}`]);
    traverseAndLog(rootFolder, 1, `/${rootName}`, outputData);
    
    // Batch write to sheet
    sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    
    console.log(`Topology mapping complete. ${outputData.length - 1} nodes mapped.`);
  } catch (e) {
    console.error(`executeFolderMapping execution failed: ${e.message}`);
    try {
      const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
      const sheet = ss.getSheets().find(s => s.getSheetId().toString() === MAPPER_GID);
      if (sheet) {
        const headers = ["Depth", "Structure", "Folder ID", "Absolute Path"];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.appendRow(["ERROR", e.message, "", ""]);
      }
    } catch (innerError) {
      console.error(`executeFolderMapping failed to log error to sheet: ${innerError.message}`);
    }
  }
}

/**
 * Recursively traverses a folder structure and logs the paths.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - The parent folder to start traversing.
 * @param {number} depth - The current depth level of the traversal.
 * @param {string} currentPath - The string representing the current absolute path.
 * @param {Array<Array<string|number>>} outputData - The array collecting the mapped data.
 * @returns {void}
 */
function traverseAndLog(parentFolder, depth, currentPath, outputData) {
  if (!parentFolder || typeof parentFolder.getFolders !== 'function') {
    console.error("traverseAndLog failed: Invalid parentFolder provided.");
    return;
  }
  if (typeof depth !== 'number' || depth < 0) {
    console.error("traverseAndLog failed: Invalid depth provided.");
    return;
  }
  if (typeof currentPath !== 'string') {
    console.error("traverseAndLog failed: Invalid currentPath provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("traverseAndLog failed: Invalid outputData provided.");
    return;
  }

  try {
    const subfolders = parentFolder.getFolders();
    while (subfolders.hasNext()) {
      const folder = subfolders.next();
      const folderName = folder.getName();
      const absolutePath = `${currentPath}/${folderName}`;
      const prefix = "│   ".repeat(depth - 1) + "├── ";

      outputData.push([depth, prefix + folderName, folder.getId(), absolutePath]);
      traverseAndLog(folder, depth + 1, absolutePath, outputData);
    }
  } catch (e) {
    console.error(`traverseAndLog failed at path ${currentPath}: ${e.message}`);
  }
}

// ==========================================
// 2. ARCHIVE RESETTER
// ==========================================

/**
 * Scans for folders with a "[DONE]" prefix and removes the prefix, logging changes.
 * @returns {void}
 */
function executeDoneReset() {
  if (!TARGET_FOLDER_ID) {
    console.error("executeDoneReset failed: Missing Script Property WORKSPACE_FOLDER_ID");
    return;
  }
  if (!MASTER_SHEET_ID) {
    console.error("executeDoneReset failed: Missing Script Property MASTER_SHEET_ID");
    return;
  }

  const RESET_GID = "1835375017";
  let sheet = null;

  try {
    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    sheet = ss.getSheets().find(s => s.getSheetId().toString() === RESET_GID);
    if (!sheet) {
      console.error(`executeDoneReset failed: Could not find sheet with GID ${RESET_GID}`);
      return;
    }
    sheet.clearContents();

    const headers = ["Status", "Original Name", "Restored Name", "Folder ID"];
    const outputData = [headers];

    console.log("--- Reset Sequence Initiated ---");
    const rootFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    
    checkAndRename(rootFolder, outputData);
    traverseAndReset(rootFolder, outputData);
    
    // Batch write to sheet if mutations occurred
    if (outputData.length > 1) {
      sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      outputData.push(["NO ACTION", "No [DONE] folders found", "", ""]);
      sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    }
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    
    console.log(`--- Reset Sequence Complete. Mutations logged: ${outputData.length - 1} ---`);
  } catch (e) {
    console.error(`executeDoneReset execution failed: ${e.message}`);
    if (sheet) {
      try {
        sheet.appendRow(["FATAL ERROR", e.message, "", ""]);
      } catch (innerError) {
        console.error(`executeDoneReset failed to log error to sheet: ${innerError.message}`);
      }
    }
  }
}

/**
 * Recursively traverses folders to check and rename those with "[DONE]" prefix.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - The parent folder.
 * @param {Array<Array<string>>} outputData - The array collecting renamed folder info.
 * @returns {void}
 */
function traverseAndReset(parentFolder, outputData) {
  if (!parentFolder || typeof parentFolder.getFolders !== 'function') {
    console.error("traverseAndReset failed: Invalid parentFolder provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("traverseAndReset failed: Invalid outputData provided.");
    return;
  }

  try {
    const subfolders = parentFolder.getFolders();

    while (subfolders.hasNext()) {
      const folder = subfolders.next();
      traverseAndReset(folder, outputData);
      checkAndRename(folder, outputData);
    }
  } catch (e) {
    console.error(`traverseAndReset failed for a folder: ${e.message}`);
  }
}

/**
 * Checks if a folder name starts with "[DONE]" and renames it.
 * @param {GoogleAppsScript.Drive.Folder} folder - The folder to check.
 * @param {Array<Array<string>>} outputData - The log data array.
 * @returns {void}
 */
function checkAndRename(folder, outputData) {
  if (!folder || typeof folder.getName !== 'function' || typeof folder.setName !== 'function') {
    console.error("checkAndRename failed: Invalid folder provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("checkAndRename failed: Invalid outputData provided.");
    return;
  }

  try {
    const folderName = folder.getName();
    const regex = /^\[DONE\]\s*/;

    if (regex.test(folderName)) {
      const newName = folderName.replace(regex, "");
      folder.setName(newName);
      outputData.push(["RESTORED", folderName, newName, folder.getId()]);
    }
  } catch (e) {
    console.error(`checkAndRename failed: ${e.message}`);
  }
}

// ==========================================
// 3. WORKSPACE TAXONOMY EXPORTER
// ==========================================

/**
 * Exports the current workspace taxonomy (Gmail labels and Drive folders) to a Markdown file.
 * @returns {void}
 */
function exportWorkspaceTaxonomy() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("exportWorkspaceTaxonomy failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const EXPORT_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  if (!EXPORT_FOLDER_ID) {
    console.error("exportWorkspaceTaxonomy failed: Missing EXPORT_FOLDER_ID in SYSTEM_CONFIG.ROOTS");
    return;
  }

  let mdContent = "# The System: Workspace Actual Taxonomy\n\n";
  
  // 1. Fetch Gmail Labels
  mdContent += "## 1. Gmail Labels\n\n";
  try {
    const labels = GmailApp.getUserLabels();
    const labelNames = labels.map(l => l.getName()).sort();
    if (labelNames.length === 0) { mdContent += "*No custom labels found.*\n\n"; } 
    else { labelNames.forEach(name => { mdContent += `- ${name}\n`; }); mdContent += "\n"; }
  } catch (e) {
    console.error(`Error fetching Gmail Labels: ${e.message}`);
    mdContent += `Error fetching Gmail Labels: ${e.message}\n\n`;
  }
  
  // 2. Fetch Google Drive Folders (Depth-Limited)
  mdContent += "## 2. Google Drive Folders\n\n*Note: Limited to a depth of 4 and max 100 folders per query to prevent server timeouts.*\n\n";
  try {
    const MY_DRIVE_ID = DriveApp.getRootFolder().getId();
    const allFolders = { [MY_DRIVE_ID]: { id: MY_DRIVE_ID, name: "My Drive", parent: null, children: [] } }; 
    
    let pageToken = null;
    do {
      let response = null;
      for (let retries = 0; retries < 3; retries++) {
        try {
          response = Drive.Files.list({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners",
            fields: "nextPageToken, files(id, name, parents)",
            pageToken: pageToken,
            pageSize: 100
          });
          break;
        } catch (e) {
          if (retries === 2) throw e;
          Utilities.sleep(2000);
        }
      }
      
      const files = response.files || [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        allFolders[f.id] = { id: f.id, name: f.name, parent: (f.parents && f.parents.length > 0) ? f.parents[0] : null, children: [] };
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    for (const id in allFolders) {
      const folder = allFolders[id];
      if (folder.parent && allFolders[folder.parent]) { allFolders[folder.parent].children.push(folder); }
    }

    for (const id in allFolders) { allFolders[id].children.sort((a, b) => a.name.localeCompare(b.name)); }

    const MAX_DEPTH = 4;
    function printTree(folderId, depth, prefix) {
      if (depth > MAX_DEPTH) return;
      const folder = allFolders[folderId];
      if (!folder) return;
      for (let i = 0; i < folder.children.length; i++) {
        const child = folder.children[i];
        mdContent += `${prefix}- ${child.name}\n`;
        printTree(child.id, depth + 1, prefix + "  ");
      }
    }

    mdContent += "- My Drive\n";
    printTree(MY_DRIVE_ID, 1, "  ");
  } catch (e) {
    console.error(`Error fetching Drive Folders: ${e.message}`);
    mdContent += `Error fetching Drive Folders: ${e.message}\n`;
  }
  
  // 3. Save as Markdown File
  try {
    const fileName = "System_Workspace_Actuals.md";
    const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
    const q = "name = '" + fileName + "' and '" + EXPORT_FOLDER_ID + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
    
    if (existingFiles && existingFiles.length > 0) {
      Drive.Files.update({}, existingFiles[0].id, blob);
    } else {
      Drive.Files.create({ name: fileName, mimeType: 'text/plain', parents: [EXPORT_FOLDER_ID] }, blob);
    }
  } catch (e) {
    console.error("Error saving file to Drive: " + e.message);
  }
}

// ==========================================
// 4. SYSTEM ID MANIFEST EXPORTER
// ==========================================

/**
 * Exports the system IDs to a manifest JSON file.
 * @returns {void}
 */
function exportSystemManifest() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("exportSystemManifest failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;

  if (!SPREADSHEET_ID || !FOLDER_ID) {
    console.error("exportSystemManifest failed: Missing MASTER_SHEET_ID or WORKSPACE_FOLDER_ID in SYSTEM_CONFIG");
    return;
  }
  
  const manifest = {
    spreadsheet: {
      id: SPREADSHEET_ID,
      tabs: []
    },
    docs_folder: {
      id: FOLDER_ID,
      files: []
    },
    generatedAt: new Date().toISOString()
  };

  // 1. Map Spreadsheet Tabs
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    sheets.forEach(sheet => {
      manifest.spreadsheet.tabs.push({
        name: sheet.getName(),
        gid: sheet.getSheetId().toString()
      });
    });
  } catch (e) {
    console.error("Failed to map spreadsheet: " + e.message);
  }

  // 2. Map Drive Folder Files
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      manifest.docs_folder.files.push({
        name: file.getName(),
        id: file.getId(),
        mimeType: file.getMimeType()
      });
    }
  } catch (e) {
    console.error("Failed to map docs folder: " + e.message);
  }

  // 3. Save as JSON in the Target Folder
  const fileName = "System_ID_Manifest.json";
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const jsonBlob = Utilities.newBlob(JSON.stringify(manifest, null, 2), "application/json", fileName);
    
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setContent(jsonBlob.getDataAsString());
    } else {
      folder.createFile(jsonBlob);
    }
    console.log(`Successfully exported System ID Manifest to Drive.`);
  } catch (e) {
    console.error("Failed to write JSON manifest to Drive: " + e.message);
  }
}

// ==========================================
// 5. TEMPORARY SCRIPT: BACKFILL DATE COLUMNS
// ==========================================

/**
 * Backfills missing dates in the execution log spreadsheet.
 * @returns {void}
 */
function backfillDatesInLog() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("backfillDatesInLog failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  if (!SPREADSHEET_ID) {
    console.error("backfillDatesInLog failed: Missing MASTER_SHEET_ID in SYSTEM_CONFIG");
    return;
  }

  const LOG_GID = "2131515996";
  
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID);
    
    if (!sheet) {
      console.error("Execution Log not found.");
      return;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    let headerRowIdx = 0;
    if (data[0].findIndex(h => h && h.toString().trim().toLowerCase() === "link") === -1 && data.length > 1) {
      headerRowIdx = 1;
    }
    const headers = data[headerRowIdx];
    const linkCol = headers.findIndex(h => h && h.toString().trim().toLowerCase() === "link");
    const firstMsgCol = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes("first message"));
    const lastMsgCol = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes("last message"));

    if (linkCol === -1 || firstMsgCol === -1 || lastMsgCol === -1) {
      console.error("Required columns not found! Ensure 'Link', 'Received First Message', and 'Received Last Message' exist.");
      return;
    }

    let updates = 0;

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i];
      const link = row[linkCol];
      const firstMsgDate = row[firstMsgCol];
      const lastMsgDate = row[lastMsgCol];

      if ((!firstMsgDate || !lastMsgDate) && link) {
        const threadIdMatch = link.toString().match(/#all\/(.+)$/);
        if (threadIdMatch) {
          const threadId = threadIdMatch[1];
          try {
            const thread = GmailApp.getThreadById(threadId);
            if (thread) {
              const messages = thread.getMessages();
              if (messages.length > 0) {
                const firstMsg = Utilities.formatDate(messages[0].getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
                const lastMsg = Utilities.formatDate(messages[messages.length - 1].getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");

                sheet.getRange(i + 1, firstMsgCol + 1).setValue(firstMsg);
                sheet.getRange(i + 1, lastMsgCol + 1).setValue(lastMsg);
                updates++;
                Utilities.sleep(100);
              }
            }
          } catch (e) {
            console.error(`Error on row ${i + 1}: ${e.message}`);
          }
        }
      }
    }

    console.log(`Backfill complete. Updated ${updates} rows.`);
  } catch (e) {
    console.error(`backfillDatesInLog failed: ${e.message}`);
  }
}

// ==========================================
// 6. TEMPORARY SCRIPT: RECOVER MEMORY STATE
// ==========================================

/**
 * Recovers previously processed threads and saves them into the Script Properties.
 * @returns {void}
 */
function recoverMemoryState() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.STATE) {
    console.error("recoverMemoryState failed: SYSTEM_CONFIG or SYSTEM_CONFIG.STATE is undefined");
    return;
  }

  try {
    const props = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
    if (!props) {
      console.error("recoverMemoryState failed: PropertiesService is unavailable.");
      return;
    }

    const stateStr = SYSTEM_CONFIG.STATE.THREAD_STATE;
    const threadState = stateStr ? JSON.parse(stateStr) : {};

    const threads = GmailApp.search('label:"99 Label_Reviewed" newer_than:2d', 0, 100);

    let added = 0;
    threads.forEach(thread => {
      const messages = thread.getMessages();
      if (messages.length > 0) {
        const lastMsgId = messages[messages.length - 1].getId();
        if (!threadState[thread.getId()]) {
          threadState[thread.getId()] = lastMsgId;
          added++;
        }
      }
    });

    props.setProperty("THREAD_STATE", JSON.stringify(threadState));
    console.log(`Recovered memory for ${added} previously processed threads.`);
  } catch (e) {
    console.error(`recoverMemoryState failed: ${e.message}`);
  }
}

// ==========================================
// 7. UTILITY: CLEAN UP EMAILS FOR RE-ASSESSMENT
// ==========================================

/**
 * Removes system labels from threads listed in a spreadsheet to re-process them.
 * @returns {void}
 */
function cleanLabelsFromSheetUrls() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("cleanLabelsFromSheetUrls failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  if (!SHEET_ID) {
    console.error("cleanLabelsFromSheetUrls failed: Missing MASTER_SHEET_ID in SYSTEM_CONFIG");
    return;
  }

  const CLEANUP_GID = '1593358623';
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CLEANUP_GID);

    if (!sheet) {
      console.error(`Cleanup sheet with GID ${CLEANUP_GID} not found.`);
      return;
    }
    
    const data = sheet.getDataRange().getValues();

    const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
    const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
    const tempDeleteLabel = GmailApp.getUserLabelByName("99 To be deleted");

    let count = 0;
    const BATCH_LIMIT = 100; // Process 100 per run to prevent timeout
    
    console.log(`Starting cleanup... Found ${data.length} total rows in the spreadsheet.`);

    for (let i = 0; i < data.length; i++) {
      if (count >= BATCH_LIMIT) {
        console.log(`\n⏸️ Hit batch limit of ${BATCH_LIMIT}. Run script again to continue.`);
        break;
      }
      
      const url = data[i][0] ? data[i][0].toString().trim() : "";
      const status = data[i][1] ? data[i][1].toString().trim() : "";
      
      if (url.includes("mail.google.com/mail/")) {
        if (status === "DONE") {
          continue;
        }

        const parts = url.split('/');
        let threadId = parts[parts.length - 1];
        threadId = threadId.split('?')[0];

        console.log(`\nProcessing Row ${i + 1}... Thread ID: ${threadId}`);

        try {
          const thread = GmailApp.getThreadById(threadId);
          if (thread) {
            if (processedLabel) thread.removeLabel(processedLabel);
            if (manualLabel) thread.removeLabel(manualLabel);
            if (tempDeleteLabel) thread.removeLabel(tempDeleteLabel);

            sheet.getRange(i + 1, 2).setValue("DONE");
            count++;
            console.log(`✅ Success: Removed labels from Thread ${threadId}. Marked DONE.`);
            Utilities.sleep(100);
          } else {
             sheet.getRange(i + 1, 2).setValue("ERROR: NOT FOUND");
             console.log(`❌ Error: Thread not found for Row ${i + 1}`);
          }
        } catch (e) {
          sheet.getRange(i + 1, 2).setValue(`ERROR: ${e.message}`);
          console.error(`❌ Failed for Row ${i + 1} - Error: ${e.message}`);
        }
      }
    }

    console.log(`\n🏁 Finished execution. Successfully processed ${count} threads this run.`);
  } catch (e) {
    console.error(`cleanLabelsFromSheetUrls failed: ${e.message}`);
  }
}

// ==========================================
// 8. ARCHITECT TOOL: DYNAMIC FOLDER SYNC
// ==========================================

/**
 * Syncs Drive folders from a stored JSON taxonomy.
 * @returns {void}
 */
function syncDriveFoldersFromTaxonomy() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.STATE) {
    console.error("syncDriveFoldersFromTaxonomy failed: SYSTEM_CONFIG or SYSTEM_CONFIG.STATE is undefined");
    return;
  }

  try {
    const PROPS = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
    if (!PROPS) {
      console.error("syncDriveFoldersFromTaxonomy failed: PropertiesService is unavailable.");
      return;
    }

    const BATCH_SIZE = 10;
    const TARGET_DEPTH = 4;
    
    const files = DriveApp.getFilesByName("LOS_Taxonomy.json");
    if (!files.hasNext()) {
      console.error("LOS_Taxonomy.json not found. Please run syncTaxonomyToSheet() first.");
      return;
    }
    
    const taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
    if (!Array.isArray(taxonomy)) {
      console.error("syncDriveFoldersFromTaxonomy failed: Parsed taxonomy is not an array.");
      return;
    }

    const root = DriveApp.getRootFolder();

    let startIndex = parseInt(SYSTEM_CONFIG.STATE.TAXONOMY_SYNC_INDEX, 10);
    if (isNaN(startIndex) || startIndex >= taxonomy.length) {
      console.log("Sync already completed in a previous run. Resetting index to 0.");
      startIndex = 0;
    }

    const createdFolders = [];
    const folderCache = { "root": root.getId() };

    function getOrCreatePath(rootNode, folderNames) {
      let currentFolderId = folderCache["root"];
      let currentPathStr = "";
      
      const loopLimit = Math.min(folderNames.length, TARGET_DEPTH);
      
      for (let i = 0; i < loopLimit; i++) {
        const part = folderNames[i];
        if (!part) continue;

        currentPathStr += "/" + part;

        if (folderCache[currentPathStr]) {
          currentFolderId = folderCache[currentPathStr];
          continue;
        }

        const currentFolder = DriveApp.getFolderById(currentFolderId);
        const folders = currentFolder.getFoldersByName(part);

        let nextFolder;
        if (folders.hasNext()) {
          nextFolder = folders.next();
        } else {
          nextFolder = currentFolder.createFolder(part);
          createdFolders.push(currentPathStr);
          console.log(`[ACTION] Created new directory: ${part} at ${currentPathStr}`);
        }

        currentFolderId = nextFolder.getId();
        folderCache[currentPathStr] = currentFolderId;
      }
    }

    console.log(`Starting Taxonomy Folder Sync (Batch: ${startIndex} to ${startIndex + BATCH_SIZE - 1})...`);
    
    let checkedCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < taxonomy.length; i++) {
      if (checkedCount >= BATCH_SIZE) break;

      endIndex = i;
      const item = taxonomy[i];
      
      if (item && item["L4 Name"]) {
        const folderNames = [];
        if (item["L1 Code"]) folderNames.push(`${item["L1 Code"]} ${item["L1 Name"] ? item["L1 Name"].trim() : ""}`);
        if (item["L2 Code"]) folderNames.push(`${item["L2 Code"]} ${item["L2 Name"] ? item["L2 Name"].trim() : ""}`);
        if (item["L3 Code"]) folderNames.push(`${item["L3 Code"]} ${item["L3 Name"] ? item["L3 Name"].trim() : ""}`);
        folderNames.push(item["L4 Name"].trim());

        console.log(`[CHECKING] /${folderNames.slice(0, TARGET_DEPTH).join('/')}`);
        getOrCreatePath(root, folderNames);
        checkedCount++;
      }
    }

    const newStartIndex = endIndex + 1;
    if (newStartIndex >= taxonomy.length) {
      PROPS.deleteProperty("TAXONOMY_SYNC_INDEX");
      console.log("\n[COMPLETE] Taxonomy sync has reached the end of the JSON file.");
    } else {
      PROPS.setProperty("TAXONOMY_SYNC_INDEX", newStartIndex.toString());
    }

    console.log(`\n================ SYNC SUMMARY ================`);
    console.log(`Context Paths Checked : ${checkedCount}`);
    console.log(`New Folders Created   : ${createdFolders.length}`);
    console.log(`Next Run Starts At    : Index ${newStartIndex} / ${taxonomy.length}`);

    if (createdFolders.length > 0) {
      console.log(`\n--- Detailed Creation Log ---`);
      createdFolders.forEach(p => console.log(` + ${p}`));
    }
    console.log(`==============================================\n`);
  } catch (e) {
    console.error(`syncDriveFoldersFromTaxonomy failed: ${e.message}`);
  }
}

// ==========================================
// 9. TEMPORARY SCRIPT: FIND RECENTLY CREATED FOLDERS
// ==========================================

/**
 * Searches Google Drive for folders created in the last 24 hours and logs them.
 * @returns {void}
 */
function findRecentlyCreatedFolders() {
  console.log("Scanning Drive for folders created in the last 24 hours...");
  
  try {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const timeString = yesterday.toISOString();

    const query = `mimeType = 'application/vnd.google-apps.folder' and createdTime > '${timeString}' and trashed = false`;

    let pageToken = null;
    let count = 0;
    
    do {
      const response = Drive.Files.list({
        q: query,
        fields: "nextPageToken, files(id, name, createdTime, parents)",
        pageToken: pageToken,
        pageSize: 100
      });
      
      const files = response.files || [];
      files.forEach(file => {
        console.log(`Found: "${file.name}" | Created: ${file.createdTime} | ID: ${file.id}`);
        count++;
      });
      
      pageToken = response.nextPageToken;
    } while (pageToken);
    
    console.log(`\nScan complete. Found ${count} recently created folders.`);
  } catch (e) {
    console.error("Error searching Drive. (Ensure Drive API v3 is enabled in Advanced Services): " + e.message);
    
    try {
      console.log("Attempting fallback search with DriveApp...");
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const timeString = yesterday.toISOString();

      const folders = DriveApp.searchFolders(`createdTime > '${timeString}'`);
      let fallbackCount = 0;
      while(folders.hasNext()) {
        const f = folders.next();
        console.log(`Found: "${f.getName()}" | Created: ${f.getDateCreated()}`);
        fallbackCount++;
      }
      console.log(`Fallback scan complete. Found ${fallbackCount} folders.`);
    } catch (innerError) {
      console.error(`Fallback scan failed: ${innerError.message}`);
    }
  }
}

// ==========================================
// 10. SYSTEM TRIGGERS (CRON JOBS)
// ==========================================

/**
 * Programmatically clears all existing triggers and provisions the master schedule.
 * Run this function once from the Apps Script editor to lock in the automated pipelines.
 * @returns {void}
 */
function setupSystemTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    
    console.log(`Found ${triggers.length} existing triggers. Wiping slate clean...`);
    for (let i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
    
    // 1. The Clerk (Email) - Every 10 Minutes
    ScriptApp.newTrigger("runTheClerkEmailOngoing")
      .timeBased()
      .everyMinutes(10)
      .create();

    // 2. The Clerk (Drive Ongoing) - Every 1 Minute
    ScriptApp.newTrigger("runTheClerkDriveOngoing")
      .timeBased()
      .everyMinutes(1)
      .create();

    // 3. Task Execution Pipeline (Harmonizer) - Every 15 Minutes
    ScriptApp.newTrigger("runTaskExecutionPipeline")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 3b. Bi-Directional Task Export - Every 15 Minutes
    ScriptApp.newTrigger("extractTasksWithConversationDetails")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 3c. Bi-Directional Task Import (Spreadsheet to Tasks) - Every 15 Minutes
    ScriptApp.newTrigger("syncRevisionsToTasks")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 4. Task Master Engine (D.5-D.7) - Every 1 Hour
    ScriptApp.newTrigger("runTaskMasterEngine")
      .timeBased()
      .everyHours(1)
      .create();

    // 4. Manual Revisions Sync (Email) - Every 1 Hour
    ScriptApp.newTrigger("applyManualRevisionsEmail")
      .timeBased()
      .everyHours(1)
      .create();

    // 5. Manual Revisions Sync (Drive) - Every 1 Hour
    ScriptApp.newTrigger("applyManualRevisionsDrive")
      .timeBased()
      .everyHours(1)
      .create();

    // 6. The Clerk (Drive Retro) - Every 2 Hours (Slow Burn)
    ScriptApp.newTrigger("runTheClerkDriveRetro")
      .timeBased()
      .everyHours(2)
      .create();

    console.log("SUCCESS: All system triggers have been provisioned according to the master schedule.");
  } catch (e) {
    console.error(`setupSystemTriggers failed: ${e.message}`);
  }
}

// ==========================================
// 11. CENTRALIZED AI UTILITY (GEMINI)
// ==========================================

/**
 * Calls the Gemini AI API with the specified prompt and system instructions.
 * @param {string} promptText - The prompt to send to Gemini.
 * @param {string} modelName - The Gemini model to use.
 * @param {string} systemInstruction - The system instruction or context.
 * @param {Object} [schema] - An optional schema to force JSON formatting.
 * @returns {Object} The parsed JSON response from Gemini, or an error object.
 */
function callGemini(promptText, modelName, systemInstruction, schema) {
  if (typeof promptText !== 'string' || !promptText.trim()) {
    return { error: "callGemini failed: Invalid promptText provided." };
  }
  if (typeof modelName !== 'string' || !modelName.trim()) {
    return { error: "callGemini failed: Invalid modelName provided." };
  }
  if (typeof systemInstruction !== 'string') {
    return { error: "callGemini failed: Invalid systemInstruction provided." };
  }

  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.SECRETS) {
    return { error: "callGemini failed: SYSTEM_CONFIG or SYSTEM_CONFIG.SECRETS is undefined." };
  }

  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) return { error: "Missing GEMINI_API_KEY" };
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  if (schema) {
    payload.generationConfig.responseSchema = schema;
  }
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  let delay = 2000;
  for (let i = 0; i < 4; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode === 200) {
        const json = JSON.parse(response.getContentText());
        if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts.length > 0) {
          const resultText = json.candidates[0].content.parts[0].text;
          return JSON.parse(resultText);
        } else {
          return { error: "callGemini response payload is missing candidate parts." };
        }
      } else if (statusCode === 429 || statusCode >= 500) {
        Utilities.sleep(delay);
        delay *= 2;
      } else {
        return { error: `HTTP ${statusCode}: ${response.getContentText()}` };
      }
    } catch(e) {
      if (i === 3) return { error: e.message };
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return { error: "Exhausted retries due to 429/500 errors" };
}

// ==========================================
// 12. TESTING & SETUP UTILITIES
// ==========================================

/**
 * Retrieves and logs the IDs for all Google Task lists.
 * @returns {void}
 */
function getMyTaskListIds() {
  try {
    const listsResponse = Tasks.Tasklists.list();
    if (listsResponse && listsResponse.items) {
      console.log("=== YOUR GOOGLE TASK LIST IDs ===");
      listsResponse.items.forEach(list => {
        console.log(`${list.title}: ${list.id}`);
      });
      console.log("=================================");
    } else {
      console.error("getMyTaskListIds failed: No items found or Tasks API unavailable.");
    }
  } catch (e) {
    console.error(`getMyTaskListIds failed: ${e.message}`);
  }
}

/**
 * Runs a safe dry-run for Task Master, extracting data and hitting Gemini without modifying real Google Tasks.
 * @returns {void}
 */
function testTaskMasterDryRun() {
  try {
    console.log("Starting DRY RUN of Task Master...");
    const now = new Date();

    if (typeof extractCalendarCapacity !== 'function' ||
        typeof extractTasksBacklog !== 'function' ||
        typeof getSystemGoals !== 'function' ||
        typeof callTaskMasterAI !== 'function' ||
        typeof updateOnePagerMarkdown !== 'function') {
      console.error("testTaskMasterDryRun failed: Required global functions are not defined.");
      return;
    }

    const capacityData = extractCalendarCapacity(now);
    const taskData = extractTasksBacklog();
    const goalsData = getSystemGoals();

    const payload = {
      currentTime: now.toISOString(),
      goals: goalsData,
      capacity: capacityData,
      tasks: taskData
    };

    console.log("Fetching AI recommendations...");
    const aiResponse = callTaskMasterAI(payload);
    if (!aiResponse) {
      console.error("testTaskMasterDryRun: AI response is empty.");
      return;
    }

    console.log("=== AI RECOMMENDED TASK UPDATES (SKIPPED) ===");
    console.log(JSON.stringify(aiResponse.taskUpdates || {}, null, 2));

    console.log("=== ONE-PAGER PRIORITY OUTPUT ===");
    console.log(aiResponse.onePagerMarkdown || "");

    if (aiResponse.onePagerMarkdown) {
      updateOnePagerMarkdown(aiResponse.onePagerMarkdown);
      console.log("Dry run complete. Check Google Drive for the One-Pager.");
    } else {
      console.error("testTaskMasterDryRun: onePagerMarkdown is missing from the response.");
    }
  } catch (e) {
    console.error(`testTaskMasterDryRun failed: ${e.message}`);
  }
}
