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
    const allFolders = {}; 
    
    let pageToken = null;
    do {
      const response = Drive.Files.list({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners",
        fields: "nextPageToken, files(id, name, parents)",
        pageToken: pageToken,
        pageSize: 1000
      });
      
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
    const fileName = "System_Taxonomy_Export_" + new Date().getTime() + ".md";
    const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
    const resource = {
      name: fileName,
      mimeType: 'text/plain',
      parents: [TARGET_FOLDER_ID]
    };
    
    try {
      const file = Drive.Files.create(resource, blob);
      Logger.log("Saved directly to target folder.");
      Logger.log("File URL: https://drive.google.com/file/d/" + file.id);
    } catch (innerError) {
      // Fallback if the folder ID is restricted or fails
      Logger.log("Target folder failed, saving to Root Drive instead. Error: " + innerError.message);
      delete resource.parents; // Saves to root
      const file = Drive.Files.create(resource, blob);
      Logger.log("Export complete!");
      Logger.log("File URL: https://drive.google.com/file/d/" + file.id);
    }
  } catch (e) {
    Logger.log("Error saving file to Drive: " + e.message);
  }
}
