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
    const root = DriveApp.getRootFolder();
    const MAX_DEPTH = 4;
    let count = 0;
    
    function fetchFolders(folder, depth, prefix) {
      if (depth > MAX_DEPTH) return;
      if (count >= 200) return; 
      
      const folders = folder.getFolders();
      // Directly stream to avoid memory/sorting errors that cause "Server Error"
      while (folders.hasNext()) {
        if (count >= 200) break;
        const subFolder = folders.next();
        mdContent += `${prefix}- ${subFolder.getName()}\n`;
        count++;
        fetchFolders(subFolder, depth + 1, prefix + "  ");
      }
    }
    
    mdContent += "- My Drive\n";
    fetchFolders(root, 1, "  ");
    
    if (count >= 200) {
      mdContent += "\n*... (Truncated to 200 folders to prevent script timeout)*\n";
    }
    
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
