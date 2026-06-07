/**
 * THE SYSTEM: GMAIL LABEL EXPORTER
 * Fetches all Gmail labels, populates the Label Management sheet tab,
 * and exports a JSON file to the main Drive workspace for agent context.
 */

function updateLabelList() {
const ss = getMasterSpreadsheet();
  
  // Try to find the Label Management tab (GID from Clerk) or default to creating a new one
  const targetGid = parseInt(SYSTEM_CONFIG.SHEETS.LABEL_MANAGEMENT, 10); 
  const sheets = ss.getSheets();
  
  // ES6 Refactoring: Use find instead of iterative loop
  let sheet = sheets.find(s => s.getSheetId() === targetGid) || ss.insertSheet("Actual Gmail Labels");

  // 1. Fetch Labels
  const labels = GmailApp.getUserLabels();
  // Sort alphabetically
  labels.sort((a, b) => a.getName().localeCompare(b.getName()));

  const tableData = [["Label Name", "Label Content", "Unread Count", "Total Threads"]];
  
  // ES6 Refactoring: Map over labels to build the JSON and Table Data cleanly
  const jsonOutput = labels.map(l => {
    const name = l.getName();
    const parts = name.split("/");
    const leaf = parts[parts.length - 1];
    const unreadCount = l.getUnreadCount();
    const threadCount = l.getThreads().length;

    tableData.push([name, leaf, unreadCount, threadCount]);

    return {
      name: name,
      leaf: leaf,
      unread_count: unreadCount
    };
  });

  // 2. Write to Spreadsheet
  sheet.clear();
  const range = sheet.getRange(1, 1, tableData.length, tableData[0].length);
  range.setValues(tableData);
  
  // Format Headers
  const headerRange = sheet.getRange(1, 1, 1, tableData[0].length);
  headerRange.setFontWeight("bold"); 
  headerRange.setBackground("#f3f3f3");
  
  sheet.autoResizeColumns(1, tableData[0].length);
  
  // 3. Export to Google Drive as JSON
  const TARGET_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID; // Main Docs Workspace
  const fileName = "Actual_Gmail_Labels.json";
  
  try {
    const targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const jsonBlob = Utilities.newBlob(JSON.stringify(jsonOutput, null, 2), "application/json", fileName);
    
    const existingFiles = targetFolder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setContent(jsonBlob.getDataAsString());
    } else {
      targetFolder.createFile(jsonBlob);
    }
    console.log(`Successfully exported ${labels.length} labels to Drive and Sheet.`);
  } catch (e) {
    console.error("Failed to write JSON to Drive: " + e.message);
  }
}

/**
 * Cleans up legacy/messed up labels starting with '02 Work/01 Employment/' and
 * creates the correct flat WOS Gmail labels if missing.
 */
function cleanAndCreateGmailLabels() {
  const isWork = isWorkAccount();
  
  console.log(`Starting Gmail Labels cleanup and alignment for ${isWork ? "Work" : "Private"} profile...`);
  const labels = GmailApp.getUserLabels();
  
  // 1. Delete legacy/messed up labels
  labels.forEach(l => {
    const name = l.getName();
    if (name === "02 Work" || name.indexOf("02 Work/") === 0) {
      console.log(`[ACTION] Deleting legacy label: ${name}`);
      try {
        l.deleteLabel();
      } catch(e) {
        console.error(`Failed to delete label ${name}: ${e.message}`);
      }
    }
  });
  
  // 2. Fetch the taxonomy JSON dynamically
  const taxonomyFilename = isWork ? "PMTOS_Taxonomy.json" : "LOS_Taxonomy.json";
  const files = DriveApp.getFilesByName(taxonomyFilename);
  if (!files.hasNext()) {
    console.error(taxonomyFilename + " not found. Please run syncTaxonomyToSheet() first.");
    return;
  }
  
  let taxonomy;
  try {
    taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
  } catch (e) {
    console.error(`Failed to parse ${taxonomyFilename}: ${e.message}`);
    return;
  }
  
  const validLabels = new Set();
  
  taxonomy.forEach(item => {
    if (item && item["Drive Path"]) {
      const parts = item["Drive Path"].split("/").map(s => s.trim()).filter(Boolean);
      const firstPart = parts[0] || "";
      
      // Ignore system triage (00) and system operational (99) tags
      if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System") {
        return;
      }
      
      // Build nested labels for all levels automatically
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? currentPath + "/" + parts[i] : parts[i];
        validLabels.add(currentPath);
      }
    }
  });
  
  // 3. Create the valid labels if missing
  validLabels.forEach(name => {
    let existing = GmailApp.getUserLabelByName(name);
    if (!existing) {
      console.log(`[ACTION] Creating label: ${name}`);
      try {
        GmailApp.createLabel(name);
      } catch(e) {
        console.error(`Failed to create label ${name}: ${e.message}`);
      }
    }
  });
  
  console.log("Gmail labels cleanup and alignment complete.");
}

