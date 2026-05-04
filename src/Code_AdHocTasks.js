/**
 * Ad-Hoc Task Creation Engine
 * Receives CLI inputs from Antigravity to create Google Tasks.
 */

function createAdHocTaskFromCLI(title, notes) {
  try {
    const newTask = {
      title: title,
      notes: notes || "Created autonomously by Antigravity Agent"
    };
    
    // '@default' is the Google Tasks API identifier for the primary/default list
    const targetListId = '@default';
    
    const createdTask = Tasks.Tasks.insert(newTask, targetListId);
    console.log(`Success: Task "${title}" created in default list. Task ID: ${createdTask.id}`);
  } catch (e) {
    console.log(`Failed to create task: ${e.message}`);
  }
}
