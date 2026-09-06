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
