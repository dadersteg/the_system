/**
 * THE SYSTEM: TAXONOMY EXPORTER
 */

function exportTaxonomy() {
  let mdContent = "# The System: Taxonomy Export\n\n";
  const TARGET_FOLDER_ID = "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc";
  
  // ==========================================
  // 1. Fetch Gmail Labels
  // ==========================================
  mdContent += "## 1. Gmail Labels\n\n";
  try {
    const labels = GmailApp.getUserLabels();
    const labelNames = labels.map(l => l.getName()).sort();
    
    if (labelNames.length === 0) {
      mdContent += "*No custom labels found.*\n\n";
    } else {
      labelNames.forEach(name => {
        mdContent += `- ${name}\n`;
      });
      mdContent += "\n";
    }
  } catch (e) {
    mdContent += `Error fetching Gmail Labels: ${e.message}\n\n`;
  }
  
  // ==========================================
  // 2. Fetch Google Drive Folders (Depth-Limited)
  // ==========================================
  mdContent += "## 2. Google Drive Folders\n\n";
  mdContent += "*Note: Limited to a depth of 3 and max 200 folders to prevent server timeouts.*\n\n";
  
  try {
    const MY_DRIVE_ID = DriveApp.getRootFolder().getId();
    const allFolders = {
      [MY_DRIVE_ID]: { id: MY_DRIVE_ID, name: "My Drive", parent: null, children: [] }
    }; 
    
    let pageToken = null;
    do {
      let response = null;
      for (let retries = 0; retries < 3; retries++) {
        try {
          response = Drive.Files.list({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners",
            fields: "nextPageToken, files(id, name, parents)",
            pageToken: pageToken,
            pageSize: 100 // Reduced from 1000 to prevent 'Empty response' from huge payloads
          });
          break; // success
        } catch (e) {
          if (retries === 2) throw e;
          Utilities.sleep(2000);
        }
      }
      
      const files = response.files || [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        allFolders[f.id] = { 
          id: f.id, 
          name: f.name, 
          parent: (f.parents && f.parents.length > 0) ? f.parents[0] : null, 
          children: [] 
        };
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    // Build children arrays
    for (const id in allFolders) {
      const folder = allFolders[id];
      if (folder.parent && allFolders[folder.parent]) {
        allFolders[folder.parent].children.push(folder);
      }
    }

    // Sort children alphabetically
    for (const id in allFolders) {
      allFolders[id].children.sort((a, b) => a.name.localeCompare(b.name));
    }

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
    mdContent += `Error fetching Drive Folders: ${e.message}\n`;
  }
  
  // ==========================================
  // 3. Save as Markdown File (Using Advanced Drive Service)
  // ==========================================
  try {
    const fileName = "System_Taxonomy_Export.md";
    const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
    
    try {
      const q = "name = '" + fileName + "' and '" + TARGET_FOLDER_ID + "' in parents and trashed = false";
      const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
      
      if (existingFiles && existingFiles.length > 0) {
        const fileId = existingFiles[0].id;
        const file = Drive.Files.update({}, fileId, blob);
        Logger.log("Updated existing file. URL: https://drive.google.com/file/d/" + file.id);
      } else {
        const resource = {
          name: fileName,
          mimeType: 'text/plain',
          parents: [TARGET_FOLDER_ID]
        };
        const file = Drive.Files.create(resource, blob);
        Logger.log("Created new file. URL: https://drive.google.com/file/d/" + file.id);
      }
    } catch (innerError) {
      Logger.log("Target folder failed, saving to Root Drive instead. Error: " + innerError.message);
      const resourceRoot = { name: fileName, mimeType: 'text/plain' };
      const file = Drive.Files.create(resourceRoot, blob);
      Logger.log("Export complete! URL: https://drive.google.com/file/d/" + file.id);
    }
  } catch (e) {
    Logger.log("Error saving file to Drive: " + e.message);
  }
}
