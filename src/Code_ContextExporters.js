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
