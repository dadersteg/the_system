/**
 * @file 10_Exporters.js
 * @description System Context Exporters, JSONL/CSV Tracker Logs, Gemini Model Catalog & Task List Inventory.
 */

// ==========================================
// SECTION 1: CONTEXT & TAXONOMY EXPORTERS
// ==========================================

/**
 * @file src/Code_ContextExporters.js
 * @description Context exporter utilities for exporting workspace taxonomy and system manifest.
 *
 * @version 1.0.0
 * @last_modified 2026-05-04
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial creation from split of Code_Utilities.js. Added standardized documentation header, JSDoc descriptions for all functions, aggressive type checking, and error boundaries.
 */

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
  let labelNames = [];
  try {
    const labels = GmailApp.getUserLabels();
    labelNames = labels.map(l => l.getName()).sort();
    console.log(`\n=======================================================`);
    console.log(`📥 CURRENT GMAIL LABELS (${labelNames.length}):`);
    console.log(`=======================================================`);
    if (labelNames.length === 0) {
      mdContent += "*No custom labels found.*\n\n";
      console.log("No custom Gmail labels found.");
    } else {
      labelNames.forEach(name => {
        mdContent += `- ${name}\n`;
        console.log(`- ${name}`);
      });
      mdContent += "\n";
    }
  } catch (e) {
    console.error(`Error fetching Gmail Labels: ${e.message}`);
    mdContent += `Error fetching Gmail Labels: ${e.message}\n\n`;
  }

  // 2. Fetch Google Drive Folders (Depth-Limited)
  mdContent += "## 2. Google Drive Folders\n\n*Note: Limited to a depth of 4 and max 100 folders per query to prevent server timeouts.*\n\n";
  console.log(`\n=======================================================`);
  console.log(`📁 CURRENT GOOGLE DRIVE FOLDERS:`);
  console.log(`=======================================================`);
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
        console.log(`${prefix}- ${child.name}`);
        printTree(child.id, depth + 1, prefix + "  ");
      }
    }

    mdContent += "- My Drive\n";
    console.log("- My Drive");
    printTree(MY_DRIVE_ID, 1, "  ");
  } catch (e) {
    console.error(`Error fetching Drive Folders: ${e.message}`);
    mdContent += `Error fetching Drive Folders: ${e.message}\n`;
  }

  // 3. Save as Markdown File
  try {
    const fileName = "System_Workspace_Actuals.md";
    const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
    const targetFolder = DriveApp.getFolderById(EXPORT_FOLDER_ID);

    const existing = targetFolder.getFilesByName(fileName);
    let fileId = "";
    if (existing.hasNext()) {
      const file = existing.next();
      file.setContent(blob.getDataAsString());
      fileId = file.getId();
      console.log(`\n✓ Updated existing Workspace Actuals: "${fileName}" (ID: ${fileId})`);
    } else {
      const file = targetFolder.createFile(blob);
      fileId = file.getId();
      console.log(`\n✨ Created new Workspace Actuals: "${fileName}" (ID: ${fileId})`);
    }
  } catch (e) {
    console.error("Error saving file to Drive: " + e.message);
  }
}

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
    const ss = getMasterSpreadsheet();
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

/**
 * Exports active work goals and habits from HABITS_SHEET_ID into a clean Markdown table in Drive.
 * @returns {string} File ID of the generated Markdown doc.
 */
function exportWorkGoalsToMarkdown() {
  const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
  if (!ssId) {
    console.error("exportWorkGoalsToMarkdown failed: Missing HABITS_SHEET_ID in SYSTEM_CONFIG.ROOTS");
    return "";
  }

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.warn("Goals sheet has no data rows.");
    return "";
  }

  const headers = data[0];
  const activeIdx = headers.indexOf("Active");
  
  let md = "# Principles, Goals, Methods and Habits (Work)\n\n";
  md += "| " + headers.join(" | ") + " |\n";
  md += "| " + headers.map(() => "---").join(" | ") + " |\n";

  let activeCount = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const isActive = activeIdx === -1 || row[activeIdx] === true || String(row[activeIdx]).toUpperCase() === "TRUE";
    if (isActive) {
      md += "| " + row.map(val => String(val).replace(/\|/g, "/").replace(/\n/g, " ").trim()).join(" | ") + " |\n";
      activeCount++;
    }
  }

  const fileName = "Principles, Goals, Methods and Habits (Work) - Output (Active).md";
  const blob = Utilities.newBlob(md, 'text/plain', fileName);
  const targetFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(targetFolderId);

  const existing = folder.getFilesByName(fileName);
  let fileId = "";
  if (existing.hasNext()) {
    const file = existing.next();
    file.setContent(blob.getDataAsString());
    fileId = file.getId();
    console.log(`✓ Updated existing Goals Markdown: "${fileName}" (ID: ${fileId})`);
  } else {
    const file = folder.createFile(blob);
    fileId = file.getId();
    console.log(`✨ Created new Goals Markdown: "${fileName}" (ID: ${fileId})`);
  }

  console.log(`\n=======================================================`);
  console.log(`📋 WORK_GOALS_FILE_ID: "${fileId}" (${activeCount} active goals exported)`);
  console.log(`=======================================================\n`);
  return fileId;
}


// ==========================================
// SECTION 2: TRACKER LOG EXPORTERS (JSONL & CSV)
// ==========================================

/**
 * @file src/Code_TrackerExporters.js
 * @description Exports the Email and Drive tracking logs to JSONL and CSV formats for LLM digestion.
 * Exports are placed in the configured WORKSPACE_FOLDER_ID.
 * @version 1.0.1
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added JSDoc docstrings, aggressive type checking, and standardized variable names.
 * - 1.0.0: Initial version.
 */

/**
 * Exports the Email and Drive tracking logs to JSONL and CSV formats.
 * It reads from the MASTER_SHEET_ID and saves the exports into the specified
 * WORKSPACE_FOLDER_ID or override export folder depending on the environment.
 *
 * @returns {void}
 */
function exportTrackers() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("exportTrackers failed: SYSTEM_CONFIG missing.");
    return;
  }

  const spreadsheetId = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  let exportFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  
  // For Private environment, override folder to the exports folder
  const isCeEnv = (getEnvProp("ENV") === "WORK");
  if (!isCeEnv) {
    exportFolderId = "1ylbggzC_eIJAMu-_AwPj7YJL1Z_uuoOJ"; // Exports folder for Private
  } else {
    exportFolderId = "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"; // Exports folder for CE
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // Export Email Log
  const emailLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
  if (emailLogSheet) {
    _exportLogData(emailLogSheet, "Email", exportFolderId);
  }

  // Export Drive Log
  const driveLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.DRIVE_LOG);
  if (driveLogSheet) {
    _exportLogData(driveLogSheet, "Drive", exportFolderId);
  }

  // Export Antigravity Log
  const antigravityLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.ANTIGRAVITY_LOG);
  if (antigravityLogSheet) {
    _exportLogData(antigravityLogSheet, "Antigravity", exportFolderId);
  }
}

/**
 * Processes a tracking log sheet and exports the data to Drive as JSONL and CSV.
 * It generates two variations for both formats: all data, and data from the last 14 days.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The Google Sheet object containing log data.
 * @param {string} typeName - The log type identifier, e.g., "Email" or "Drive".
 * @param {string} folderId - The Google Drive Folder ID to save the exports into.
 * @returns {void}
 */
function _exportLogData(sheet, typeName, folderId) {
  if (!sheet || typeof sheet.getDataRange !== 'function') {
    console.error(`_exportLogData failed: invalid sheet provided for ${typeName}`);
    return;
  }
  if (!typeName || typeof typeName !== 'string') {
    console.error(`_exportLogData failed: invalid typeName provided.`);
    return;
  }
  if (!folderId || typeof folderId !== 'string') {
    console.error(`_exportLogData failed: invalid folderId provided for ${typeName}`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headerRowIdx = data[0].findIndex(h => h && (h.toString().toLowerCase().includes('link') || h.toString().toLowerCase().includes('original name') || h.toString().toLowerCase().includes('convo id'))) === -1 && data.length > 1 ? 1 : 0;
  const headers = data[headerRowIdx].map(h => h.toString().trim().toLowerCase());
  
  let colMap;
  if (typeName === "Email") {
    colMap = {
      timestamp: headers.findIndex(h => h === "timestamp"),
      subject: headers.findIndex(h => h === "subject"),
      sender: headers.findIndex(h => h === "sender"),
      labels: headers.findIndex(h => h === "final label set"),
      summary: headers.findIndex(h => h === "ai summary"),
      actions: headers.findIndex(h => h === "ai action items"),
      link: headers.findIndex(h => h === "link"),
      status: headers.findIndex(h => h === "inbox status")
    };
  } else if (typeName === "Drive") {
    colMap = {
      timestamp: headers.findIndex(h => h === "timestamp"),
      originalName: headers.findIndex(h => h === "original name"),
      finalName: headers.findIndex(h => h === "final name"),
      summary: headers.findIndex(h => h === "summary"),
      targetPath: headers.findIndex(h => h === "target folder path"),
      url: headers.findIndex(h => h === "url"),
      status: headers.findIndex(h => h === "status"),
      mappedTask: headers.findIndex(h => h === "mapped task")
    };
  } else if (typeName === "Antigravity") {
    colMap = {
      timestamp: headers.findIndex(h => h === "date"), // The sheet uses "Date" for timestamp
      convoId: headers.findIndex(h => h === "convo id"),
      type: headers.findIndex(h => h === "type"),
      name: headers.findIndex(h => h === "name of convo"),
      created: headers.findIndex(h => h === "convo created date"),
      purpose: headers.findIndex(h => h === "purpose of convo"),
      summary: headers.findIndex(h => h === "summary of work last 24 hours")
    };
  } else {
    console.error(`_exportLogData failed: unknown typeName ${typeName}`);
    return;
  }

  const tsIndex = colMap.timestamp !== -1 ? colMap.timestamp : 0; // Default to first column if missing
  
  const allLinesJSONL = [];
  const allLinesCSV = [];
  const recentLinesJSONL = [];
  const recentLinesCSV = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);

  // Build CSV Headers
  const csvHeaders = Object.keys(colMap).map(k => `"${k}"`).join(",");
  allLinesCSV.push(csvHeaders);
  recentLinesCSV.push(csvHeaders);

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const rawDate = row[tsIndex];

    let rowDate = null;
    if (rawDate instanceof Date) rowDate = rawDate;
    else if (rawDate) rowDate = new Date(rawDate.toString());

    const entry = {};
    const csvValues = [];
    
    for (const [key, idx] of Object.entries(colMap)) {
      let val = idx !== -1 ? (row[idx] || "").toString() : "";
      if (key === "timestamp" && rowDate && !isNaN(rowDate)) {
        val = Utilities.formatDate(rowDate, "GMT", "yyyy-MM-dd HH:mm");
      }
      entry[key] = val;
      csvValues.push(`"${val.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
    }

    const jsonlStr = JSON.stringify(entry);
    const csvStr = csvValues.join(",");

    allLinesJSONL.push(jsonlStr);
    allLinesCSV.push(csvStr);

    if (rowDate && !isNaN(rowDate) && rowDate >= cutoffDate) {
      recentLinesJSONL.push(jsonlStr);
      recentLinesCSV.push(csvStr);
    }
  }

  _writeFileToDrive(`${typeName}_Tracker_All.jsonl`, allLinesJSONL.join("\n"), "text/plain", folderId);
  _writeFileToDrive(`${typeName}_Tracker_All.csv`, allLinesCSV.join("\n"), "text/csv", folderId);
  _writeFileToDrive(`${typeName}_Tracker_14d.jsonl`, recentLinesJSONL.join("\n"), "text/plain", folderId);
  _writeFileToDrive(`${typeName}_Tracker_14d.csv`, recentLinesCSV.join("\n"), "text/csv", folderId);
}

/**
 * Helper function to create or update a file in Google Drive.
 *
 * @param {string} fileName - The name of the file to be saved.
 * @param {string} content - The file content.
 * @param {string} mimeType - The MIME type of the file.
 * @param {string} folderId - The Google Drive Folder ID where the file should be located.
 * @returns {void}
 */
function _writeFileToDrive(fileName, content, mimeType, folderId) {
  if (!fileName || typeof fileName !== 'string') {
    console.error(`_writeFileToDrive failed: invalid fileName.`);
    return;
  }
  if (typeof content !== 'string') {
    console.error(`_writeFileToDrive failed: invalid content for file ${fileName}.`);
    return;
  }
  if (!mimeType || typeof mimeType !== 'string') {
    console.error(`_writeFileToDrive failed: invalid mimeType for file ${fileName}.`);
    return;
  }
  if (!folderId || typeof folderId !== 'string') {
    console.error(`_writeFileToDrive failed: invalid folderId for file ${fileName}.`);
    return;
  }

  try {
    const blob = Utilities.newBlob(content, mimeType, fileName);
    const q = "name = '" + fileName + "' and '" + folderId + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({ q: q, fields: "files(id)" }).files;

    if (existingFiles && existingFiles.length > 0) {
      Drive.Files.update({}, existingFiles[0].id, blob);
    } else {
      Drive.Files.create({ name: fileName, mimeType: mimeType, parents: [folderId] }, blob);
    }
    console.log(`_writeFileToDrive: Wrote ${fileName}`);
  } catch (e) {
    console.error(`_writeFileToDrive failed for ${fileName}: ${e.message}`);
  }
}


// ==========================================
// SECTION 3: GEMINI MODEL CATALOG SYNC
// ==========================================

/**
 * @file src/Code_ListModels.js
 * @description THE SYSTEM: GEMINI MODEL EXPORTER. Fetches available Gemini models from the API, populates the dedicated sheet tab, and exports to Google Drive as JSON.
 * @version 1.0.2
 * @last_modified 2026-06-25
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.2: Improved error handling, API key validation, and status code checking in getModelsForCLI().
 * - 1.0.1: Injected comprehensive JSDoc docstrings, standardized variable casing, and verified syntax.
 * - 1.0.0: Initial version.
 */

/**
 * Fetches available Gemini models from the generative language API, writes the results
 * into the configured Gemini Models spreadsheet, and exports a JSON backup to Google Drive.
 *
 * @returns {void}
 * @throws {Error} If the target sheet cannot be found or the API request fails.
 */
function updateModelList() {
  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("updateModelList: Missing Gemini API Key in Script Properties. Skipping.");
    return;
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  if (response.getResponseCode() !== 200) {
      console.error("Failed to fetch models: " + response.getContentText());
      return;
  }
  
  const json = JSON.parse(response.getContentText());
  const models = json.models || [];

  // Prepare Table Headers
  const tableData = [["Model ID (Copy this)", "Version", "Display Name", "Description", "Input Limit", "Output Limit", "Thinking"]];

  // Map JSON to Rows and Data
  const jsonOutput = models.map(model => {
    const modelId = model.name.replace("models/", "");
    
    tableData.push([
      modelId, 
      model.version || "N/A",
      model.displayName || "",
      model.description || "",
      model.inputTokenLimit || 0,
      model.outputTokenLimit || 0,
      model.thinking ? "Yes" : "No"
    ]);

    return {
      id: modelId,
      version: model.version || "N/A",
      displayName: model.displayName || "",
      description: model.description || "",
      inputLimit: model.inputTokenLimit || 0,
      outputLimit: model.outputTokenLimit || 0,
      thinking: model.thinking ? true : false
    };
  });

  // Write to Sheet (if tab exists in master spreadsheet)
  try {
    const ss = getMasterSpreadsheet();
    const targetGid = parseInt(SYSTEM_CONFIG.SHEETS.GEMINI_MODELS, 10);
    const sheets = ss.getSheets();
    let sheet = sheets.find(s => s.getSheetId() === targetGid);
    if (!sheet) {
      sheet = sheets.find(s => s.getName().toLowerCase().includes("gemini model"));
    }
    
    if (sheet) {
      sheet.clear();
      const range = sheet.getRange(1, 1, tableData.length, tableData[0].length);
      range.setValues(tableData);
      
      const headerRange = sheet.getRange(1, 1, 1, tableData[0].length);
      headerRange.setFontWeight("bold"); 
      headerRange.setBackground("#f3f3f3");
      
      sheet.autoResizeColumns(1, tableData[0].length);
      console.log(`Updated Gemini Models tab in spreadsheet.`);
    } else {
      console.log(`Gemini Models tab not present in current environment spreadsheet. Skipping sheet write.`);
    }
  } catch (errSheet) {
    console.warn(`Could not update Gemini Models sheet: ${errSheet.message}`);
  }
  
  // Export to Google Drive as Markdown & JSON
  try {
    const mdFileId = SYSTEM_CONFIG.DOCS.GEMINI_MODELS_MD_ID;
    const jsonFileId = SYSTEM_CONFIG.DOCS.GEMINI_MODELS_JSON_ID;
    
    // Construct Markdown content
    let mdString = "# Actual Gemini Models\n\n";
    mdString += "This document contains the latest technical specifications and context windows of the Gemini model ecosystem.\n\n";
    
    jsonOutput.forEach(model => {
      mdString += `## ${model.displayName || model.id}\n`;
      mdString += `- **ID**: \`${model.id}\`\n`;
      mdString += `- **Version**: ${model.version}\n`;
      mdString += `- **Description**: ${model.description}\n`;
      mdString += `- **Input Limit**: ${model.inputLimit} tokens\n`;
      mdString += `- **Output Limit**: ${model.outputLimit} tokens\n`;
      mdString += `- **Thinking Capabilities**: ${model.thinking ? 'Yes' : 'No'}\n\n`;
    });
    
    // Update Markdown document
    const mdFile = DriveApp.getFileById(mdFileId);
    mdFile.setContent(mdString);

    // Update JSON document
    const jsonStr = JSON.stringify(jsonOutput, null, 2);
    const jsonFile = DriveApp.getFileById(jsonFileId);
    jsonFile.setContent(jsonStr);
    
    console.log(`✨ Successfully updated ${models.length} models. Markdown ID: ${mdFile.getId()}, JSON ID: ${jsonFile.getId()}`);
  } catch (e) {
    console.error("Failed to write Models to Drive: " + e.message);
  }
}

/**
 * Fetches available Gemini models from the generative language API for CLI usage.
 *
 * @returns {Array<string>|string} An array of model names on success, or an error message string on failure.
 */
function getModelsForCLI() {
  try {
    const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
    if (!apiKey) {
      return "Error: Missing Gemini API Key in Script Properties.";
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});

    if (response.getResponseCode() !== 200) {
      return "Error: API Request failed with status " + response.getResponseCode() + ". Details: " + response.getContentText();
    }

    const data = JSON.parse(response.getContentText());
    if (data && data.models) {
      return data.models.map(m => m.name);
    }

    return "Error: Malformed API response structure.";
  } catch (error) {
    return "Error executing getModelsForCLI: " + error.message;
  }
}


// ==========================================
// SECTION 4: TASK LIST EXPORTERS
// ==========================================

/**
 * @file src/Code_ListTaskLists.js
 * @description Fetches all Google Task lists and exports a JSON file to the main Drive workspace for agent context. Includes a utility to print lists to the console.
 *
 * @version 1.0.1
 * @last_modified 2026-06-15
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added standardized JSDoc headers, fixed variable casing (camelCase), and removed legacy/unneeded code.
 * - 1.0.0: Initial creation.
 */

/**
 * Fetches all Google Task lists and exports them as a JSON file to the configured workspace root folder.
 * This file acts as agent context for mapping list titles to IDs.
 *
 * @returns {void}
 */
function updateTaskList() {
  const rawLists = Tasks.Tasklists.list().items || [];
  const lists = rawLists.filter(l => !(l.title || "").toLowerCase().includes("quarantine"));
  if (lists.length === 0) return;
  
  const jsonOutput = lists.map(l => ({
    title: l.title,
    id: l.id,
    updated: l.updated
  }));

  const targetFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID; // Main Docs Workspace
  const fileName = "Actual_Google_Task_Lists.json";
  
  try {
    const targetFolder = DriveApp.getFolderById(targetFolderId);
    const jsonBlob = Utilities.newBlob(JSON.stringify(jsonOutput, null, 2), "application/json", fileName);
    
    const existingFiles = targetFolder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setContent(jsonBlob.getDataAsString());
    } else {
      targetFolder.createFile(jsonBlob);
    }
    console.log(`Successfully exported ${lists.length} task lists to Drive.`);
  } catch (e) {
    console.error("Failed to write JSON to Drive: " + e.message);
  }
}

/**
 * Utility function to print all available task lists and their respective IDs to the Apps Script execution log.
 * Useful for manual inspection and debugging.
 *
 * @returns {void}
 */
function printMyTaskLists() {
  const lists = Tasks.Tasklists.list().items;
  if (!lists) {
    console.log("No task lists found.");
    return;
  }
  console.log("=== YOUR TASK LIST IDS ===");
  lists.forEach(l => console.log(`Title: "${l.title}" --> ID: "${l.id}"`));
  console.log("==========================");
}

