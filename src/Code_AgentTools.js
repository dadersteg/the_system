/**
 * @file src/Code_AgentTools.js
 * @description CLI-accessible utility functions for Antigravity agents (MacGyver, etc.)
 * These functions are designed to be called via `clasp run` to give agents
 * programmatic access to Google Tasks without using the browser.
 * (Note: Gmail, Drive, and Calendar tools have been deprecated in favor of MCP servers).
 *
 * @version 1.2.1
 * @last_modified 2026-06-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.2.1: Injected missing JSDoc docstrings and standardized variable naming.
 * - 1.2.0: Removed Gmail, Calendar, and Drive tools in favor of native MCP servers.
 * - 1.1.0: Added listTasksFromCLI for lightweight task queue extraction.
 * - 1.0.0: Initial creation with agent tools.
 */

// =============================================================================
// GOOGLE TASKS TOOLS
// =============================================================================

/**
 * Lists active tasks from Importer and ToDo lists.
 * Lightweight alternative to START_AI_TASK_MASTER — no Gemini analysis, no spreadsheet writes.
 * @param {string} listFilter - Optional: "importer", "todo", or "all" (default "all")
 * @returns {string} JSON string of active tasks
 */
function listTasksFromCLI(listFilter) {
  try {
    const filter = (listFilter || "all").toLowerCase();
    const listsToFetch = [];

    if (filter === "importer" || filter === "all") {
      listsToFetch.push({ id: SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID, name: "Importer" });
    }
    if (filter === "todo" || filter === "all") {
      listsToFetch.push({ id: SYSTEM_CONFIG.TASKS.TODO_LIST_ID, name: "ToDo" });
    }

    const results = [];

    listsToFetch.forEach(list => {
      let pageToken;
      do {
        try {
          const response = Tasks.Tasks.list(list.id, {
            showCompleted: false,
            showHidden: false, showAssigned: true,
            maxResults: 100,
            pageToken: pageToken
          });
          const items = response.items || [];
          items.forEach(t => {
            const entry = {
              list: list.name,
              title: t.title,
              status: t.status,
              due: t.due || null,
              notes: (t.notes || "").substring(0, 500),
              hasEmailLink: !!(t.links && t.links.find(l => l.type === "email")),
              taskId: t.id
            };
            results.push(entry);
          });
          pageToken = response.nextPageToken;
        } catch (e) {
          console.error(`Error reading list ${list.name}: ${e.message}`);
          pageToken = undefined;
        }
      } while (pageToken);
    });

    console.log(JSON.stringify(results, null, 2));
    return JSON.stringify(results);
  } catch (e) {
    console.log(`listTasksFromCLI failed: ${e.message}`);
    return JSON.stringify({ error: e.message });
  }
}

/**
 * Retrieves all Google Task lists and their associated tasks, formatted as a JSON string.
 * This is primarily used via CLI to extract the current state of task queues.
 *
 * @returns {string} A JSON string containing a map of task list titles to their IDs and arrays of task titles.
 *                   If an error occurs, returns a JSON string with an `error` property.
 */
function getAllTaskListsFromCLI() {
  try {
    const response = Tasks.Tasklists.list();
    const items = response.items || [];
    const lists = items
      .filter(l => !(l.title || "").toLowerCase().includes("quarantine"))
      .map(l => ({ id: l.id, title: l.title }));
    
    // Also fetch tasks from each list to see what's there
    const results = {};
    lists.forEach(l => {
      try {
        const tasksResponse = Tasks.Tasks.list(l.id, { showCompleted: false });
        results[l.title] = { id: l.id, tasks: (tasksResponse.items || []).map(t => t.title) };
      } catch(e) {
        results[l.title] = { id: l.id, error: e.message };
      }
    });
    return JSON.stringify(results, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

/**
 * Scans the centralized logging spreadsheet to extract and dump the 20 most recently
 * logged email task operations to the console. Helps monitor Agent email parsing activity.
 *
 * @returns {void}
 */
function dumpRecentEmailTasks() {
  const ss = getMasterSpreadsheet();
  const logGid = IS_PMT_ENV ? "2131515996" : "967747913";
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === logGid);
  if (!sheet) {
    console.log("Sheet not found");
    return;
  }
  const data = sheet.getDataRange().getValues();
  const recent = data.slice(-20);
  recent.forEach(row => {
    const ts = row[0];
    const subject = row[3];
    const actions = row[13];
    const synced = row[14];
    if (actions && actions.trim() !== "") {
      console.log(`[${ts}] Subject: ${subject} | Actions: ${actions} | Synced: ${synced}`);
    }
  });
}
