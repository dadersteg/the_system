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
