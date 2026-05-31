/**
 * THE SYSTEM: GMAIL LABEL EXPORTER
 * Fetches all Gmail labels, populates the Label Management sheet tab,
 * and exports a JSON file to the main Drive workspace for agent context.
 */

function updateLabelList() {
const ss = getMasterSpreadsheet();
  
  // Try to find the Label Management tab (GID from Clerk) or default to creating a new one
  const targetGid = 1007497112; 
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
