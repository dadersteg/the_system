/**
 * THE SYSTEM: GOOGLE TASK LIST EXPORTER
 * Fetches all Google Task lists and exports a JSON file to the main Drive workspace for agent context.
 */

function updateTaskList() {
  const lists = Tasks.Tasklists.list().items;
  if (!lists) return;
  
  const jsonOutput = lists.map(l => ({
    title: l.title,
    id: l.id,
    updated: l.updated
  }));

  const TARGET_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID; // Main Docs Workspace
  const fileName = "Actual_Google_Task_Lists.json";
  
  try {
    const targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
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

function PRINT_MY_TASK_LISTS() {
  const lists = Tasks.Tasklists.list().items;
  if (!lists) {
    console.log("No task lists found.");
    return;
  }
  console.log("=== YOUR TASK LIST IDS ===");
  lists.forEach(l => console.log(`Title: "${l.title}" --> ID: "${l.id}"`));
  console.log("==========================");
}
