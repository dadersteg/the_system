/**
 * THE SYSTEM: GENERAL UTILITIES
 * Useful background scripts for maintaining and auditing the workspace.
 */

const UTIL_PROPS = PropertiesService.getScriptProperties();
const TARGET_FOLDER_ID = UTIL_PROPS.getProperty("WORKSPACE_FOLDER_ID");
if (!TARGET_FOLDER_ID) throw new Error("Missing Script Property: WORKSPACE_FOLDER_ID");
const MASTER_SHEET_ID = UTIL_PROPS.getProperty("MASTER_SHEET_ID");

// ==========================================
// 1. DIRECTORY MAPPER (Google Drive)
// ==========================================
function executeFolderMapping() {
  const MAPPER_GID = "536537641";

  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === MAPPER_GID);
  if (!sheet) throw new Error(`Could not find sheet with GID ${MAPPER_GID}`);
  sheet.clearContents();

  const headers = ["Depth", "Structure", "Folder ID", "Absolute Path"];
  const outputData = [headers];

  try {
    const rootFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const rootName = rootFolder.getName();
    
    outputData.push([0, rootName, rootFolder.getId(), `/${rootName}`]);
    traverseAndLog(rootFolder, 1, `/${rootName}`, outputData);
    
    // Batch write to sheet
    sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    
    console.log(`Topology mapping complete. ${outputData.length - 1} nodes mapped.`);
  } catch (e) {
    console.error(`Execution failed: ${e.message}`);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.appendRow(["ERROR", e.message, "", ""]);
  }
}

function traverseAndLog(parentFolder, depth, currentPath, outputData) {
  const subfolders = parentFolder.getFolders();
  while (subfolders.hasNext()) {
    const folder = subfolders.next();
    const folderName = folder.getName();
    const absolutePath = `${currentPath}/${folderName}`;
    const prefix = "│   ".repeat(depth - 1) + "├── ";
    
    outputData.push([depth, prefix + folderName, folder.getId(), absolutePath]);
    traverseAndLog(folder, depth + 1, absolutePath, outputData);
  }
}

// ==========================================
// 2. ARCHIVE RESETTER
// ==========================================
function executeDoneReset() {
  const RESET_GID = "1835375017";
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === RESET_GID);
  if (!sheet) throw new Error(`Could not find sheet with GID ${RESET_GID}`);
  sheet.clearContents();

  const headers = ["Status", "Original Name", "Restored Name", "Folder ID"];
  const outputData = [headers];

  try {
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
    }
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    
    console.log(`--- Reset Sequence Complete. Mutations logged: ${outputData.length - 1} ---`);
  } catch (e) {
    console.error(`Execution failed: ${e.message}`);
    sheet.appendRow(["FATAL ERROR", e.message, "", ""]);
  }
}

function traverseAndReset(parentFolder, outputData) {
  const subfolders = parentFolder.getFolders();
  
  while (subfolders.hasNext()) {
    const folder = subfolders.next();
    traverseAndReset(folder, outputData);
    checkAndRename(folder, outputData);
  }
}

function checkAndRename(folder, outputData) {
  const folderName = folder.getName();
  const regex = /^\[DONE\]\s*/;
  
  if (regex.test(folderName)) {
    const newName = folderName.replace(regex, "");
    folder.setName(newName);
    outputData.push(["RESTORED", folderName, newName, folder.getId()]);
  }
}

// ==========================================
// 3. WORKSPACE TAXONOMY EXPORTER
// ==========================================
function exportWorkspaceTaxonomy() {
  let mdContent = "# The System: Workspace Actual Taxonomy\n\n";
  const EXPORT_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  
  // 1. Fetch Gmail Labels
  mdContent += "## 1. Gmail Labels\n\n";
  try {
    const labels = GmailApp.getUserLabels();
    const labelNames = labels.map(l => l.getName()).sort();
    if (labelNames.length === 0) { mdContent += "*No custom labels found.*\n\n"; } 
    else { labelNames.forEach(name => { mdContent += `- ${name}\n`; }); mdContent += "\n"; }
  } catch (e) { mdContent += `Error fetching Gmail Labels: ${e.message}\n\n`; }
  
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
  } catch (e) { mdContent += `Error fetching Drive Folders: ${e.message}\n`; }
  
  // 3. Save as Markdown File
  try {
    const fileName = "System_Workspace_Actuals.md";
    const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
    const q = "name = '" + fileName + "' and '" + TARGET_FOLDER_ID + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
    
    if (existingFiles && existingFiles.length > 0) {
      Drive.Files.update({}, existingFiles[0].id, blob);
    } else {
      Drive.Files.create({ name: fileName, mimeType: 'text/plain', parents: [TARGET_FOLDER_ID] }, blob);
    }
  } catch (e) { console.error("Error saving file to Drive: " + e.message); }
}

// ==========================================
// 3. SYSTEM ID MANIFEST EXPORTER
// ==========================================
function exportSystemManifest() {
  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const TARGET_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  
  const manifest = {
    spreadsheet: {
      id: SPREADSHEET_ID,
      tabs: []
    },
    docs_folder: {
      id: TARGET_FOLDER_ID,
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
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
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
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
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
// 4. TEMPORARY SCRIPT: BACKFILL DATE COLUMNS
// ==========================================
function backfillDatesInLog() {
  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const LOG_GID = "2131515996";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID);
  
  if (!sheet) {
    console.error("Execution Log not found.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  let headerRowIdx = 0;
  if (data[0].findIndex(h => h.toString().trim().toLowerCase() === "link") === -1 && data.length > 1) {
    headerRowIdx = 1;
  }
  const headers = data[headerRowIdx];
  const linkCol = headers.findIndex(h => h.toString().trim().toLowerCase() === "link");
  const firstMsgCol = headers.findIndex(h => h.toString().trim().toLowerCase().includes("first message"));
  const lastMsgCol = headers.findIndex(h => h.toString().trim().toLowerCase().includes("last message"));
  
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
    
    // Only update if missing dates and we have a valid link
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
              Utilities.sleep(100); // Prevent API rate limits
            }
          }
        } catch (e) {
          console.error(`Error on row ${i + 1}: ${e.message}`);
        }
      }
    }
  }
  
  console.log(`Backfill complete. Updated ${updates} rows.`);
}

// ==========================================
// 5. TEMPORARY SCRIPT: RECOVER MEMORY STATE
// ==========================================
function recoverMemoryState() {
  const props = PropertiesService.getScriptProperties();
  const stateStr = SYSTEM_CONFIG.STATE.THREAD_STATE;
  const threadState = stateStr ? JSON.parse(stateStr) : {};
  
  // Find threads recently processed that have the flag
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
}

// ==========================================
// 6. UTILITY: CLEAN UP EMAILS FOR RE-ASSESSMENT
// ==========================================
function cleanLabelsFromSheetUrls() {
  const SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const CLEANUP_GID = '1593358623';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CLEANUP_GID);
  
  if (!sheet) {
    console.error("Cleanup sheet with GID 1593358623 not found.");
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
        // Silently skip to avoid spamming the log
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
          
          // Mark as done in column B
          sheet.getRange(i + 1, 2).setValue("DONE");
          count++;
          console.log(`✅ Success: Removed labels from Thread ${threadId}. Marked DONE.`);
          Utilities.sleep(100); // Small pause to prevent API rate limit
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
}

// ==========================================
// 7. ARCHITECT TOOL: DYNAMIC FOLDER SYNC
// ==========================================
function syncDriveFoldersFromTaxonomy() {
  const UTIL_PROPS = PropertiesService.getScriptProperties();
  const BATCH_SIZE = 10; // Number of L4 items to process per run
  const TARGET_DEPTH = 4; // Max depth to create (4 = L1-L4. Change to 3 to only create up to L3)
  
  const files = DriveApp.getFilesByName("LOS_Taxonomy.json");
  if (!files.hasNext()) throw new Error("LOS_Taxonomy.json not found. Please run syncTaxonomyToSheet() first.");
  
  const taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
  const root = DriveApp.getRootFolder();
  
  // Retrieve batch state
  let startIndex = parseInt(SYSTEM_CONFIG.STATE.TAXONOMY_SYNC_INDEX, 10);
  if (startIndex >= taxonomy.length) {
    console.log("Sync already completed in a previous run. Resetting index to 0.");
    startIndex = 0;
  }

  const createdFolders = [];
  
  // IN-MEMORY CACHE: Prevents redundant API calls for parent folders we've already found/created
  // We store the ID to fetch it instantly via DriveApp.getFolderById()
  const folderCache = { "root": root.getId() };

  function getOrCreatePath(rootNode, folderNames) {
    let currentFolderId = folderCache["root"];
    let currentPathStr = "";
    
    // Respect the depth limit
    const loopLimit = Math.min(folderNames.length, TARGET_DEPTH);
    
    for (let i = 0; i < loopLimit; i++) {
      const part = folderNames[i];
      if (!part) continue;
      
      currentPathStr += "/" + part;
      
      if (folderCache[currentPathStr]) {
        currentFolderId = folderCache[currentPathStr];
        continue; // Instantly skip if we already resolved this path in memory
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
    
    if (item["L4 Name"]) {
      const folderNames = [];
      if (item["L1 Code"]) folderNames.push(`${item["L1 Code"]} ${item["L1 Name"].trim()}`);
      if (item["L2 Code"]) folderNames.push(`${item["L2 Code"]} ${item["L2 Name"].trim()}`);
      if (item["L3 Code"]) folderNames.push(`${item["L3 Code"]} ${item["L3 Name"].trim()}`);
      folderNames.push(item["L4 Name"].trim());
      
      console.log(`[CHECKING] /${folderNames.slice(0, TARGET_DEPTH).join('/')}`);
      getOrCreatePath(root, folderNames);
      checkedCount++;
    }
  }

  const newStartIndex = endIndex + 1;
  if (newStartIndex >= taxonomy.length) {
    UTIL_PROPS.deleteProperty("TAXONOMY_SYNC_INDEX");
    console.log("\n[COMPLETE] Taxonomy sync has reached the end of the JSON file.");
  } else {
    UTIL_PROPS.setProperty("TAXONOMY_SYNC_INDEX", newStartIndex.toString());
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
}

// ==========================================
// 8. TEMPORARY SCRIPT: FIND RECENTLY CREATED FOLDERS
// ==========================================
function findRecentlyCreatedFolders() {
  console.log("Scanning Drive for folders created in the last 24 hours...");
  
  // Get time 24 hours ago in ISO format
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);
  const timeString = yesterday.toISOString();
  
  // Search query for folders created after that time
  const query = `mimeType = 'application/vnd.google-apps.folder' and createdTime > '${timeString}' and trashed = false`;
  
  try {
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
    
    // Fallback using DriveApp if Drive API is not enabled
    console.log("Attempting fallback search with DriveApp...");
    const folders = DriveApp.searchFolders(`createdTime > '${timeString}'`);
    let fallbackCount = 0;
    while(folders.hasNext()) {
      const f = folders.next();
      console.log(`Found: "${f.getName()}" | Created: ${f.getDateCreated()}`);
      fallbackCount++;
    }
    console.log(`Fallback scan complete. Found ${fallbackCount} folders.`);
  }
}

// ==========================================
// 9. SYSTEM TRIGGERS (CRON JOBS)
// ==========================================

/**
 * Programmatically clears all existing triggers and provisions the master schedule.
 * Run this function once from the Apps Script editor to lock in the automated pipelines.
 */
function setupSystemTriggers() {
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
}

// ==========================================
// 10. CENTRALIZED AI UTILITY (GEMINI)
// ==========================================
function callGemini(promptText, modelName, systemInstruction, schema) {
  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) return { error: "Missing GEMINI_API_KEY" };
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1
    }
  };
  
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
        const resultText = json.candidates[0].content.parts[0].text;
        return JSON.parse(resultText);
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
// 11. TESTING & SETUP UTILITIES
// ==========================================

/**
 * Run this function once from the Apps Script editor to get all your Task List IDs.
 * Check the Execution Log to copy your BACKLOG_LIST_ID and TO_BE_DELETED_LIST_ID.
 */
function getMyTaskListIds() {
  const lists = Tasks.Tasklists.list().items;
  console.log("=== YOUR GOOGLE TASK LIST IDs ===");
  lists.forEach(list => {
    console.log(`${list.title}: ${list.id}`);
  });
  console.log("=================================");
}

/**
 * Safe Dry-Run for Task Master. 
 * Extracts data, hits the Gemini API, and updates the Markdown One-Pager, 
 * but skips moving or updating any real Google Tasks.
 */
function testTaskMasterDryRun() {
  console.log("Starting DRY RUN of Task Master...");
  const now = new Date();
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
  if (!aiResponse) return;
  
  console.log("=== AI RECOMMENDED TASK UPDATES (SKIPPED) ===");
  console.log(JSON.stringify(aiResponse.taskUpdates, null, 2));
  
  console.log("=== ONE-PAGER PRIORITY OUTPUT ===");
  console.log(aiResponse.onePagerMarkdown);
  
  updateOnePagerMarkdown(aiResponse.onePagerMarkdown);
  console.log("Dry run complete. Check Google Drive for the One-Pager.");
}

