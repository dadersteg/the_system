/**
 * @file src/Code_TaskHarmonizer.js
 * @description Backend AI-powered Task Grooming, Pruning, and Harmonization Engine.
 * Replicates the /task_prune_and_harmonize Lead Operations Auditor protocol inside Google Apps Script.
 * 
 * Features:
 * - Scans active and 2099 backlog Google Tasks across task lists.
 * - Enforces strict 3-tier hierarchy: [Milestone] > Task > Sub-Task.
 * - Protects child tasks from false-duplicate flagging under shared milestones.
 * - Preserves ---SYSTEM_METADATA--- blocks in task notes untouched.
 * - Gemini 3.7 Flash structured output for Batches A, B, C, D.
 * - Safe quarantine execution (prefix '99 To be deleted ' + move out of active list).
 * 
 * @version 1.0.0
 * @last_modified 2026-08-19
 */

/**
 * Main RPC endpoint called from WebApp_Dashboard.html to run the task audit.
 * 
 * @param {Object} options - Scope options: { scope: 'active'|'backlog'|'full', targetListId: string|null }
 * @returns {Object} { success: boolean, summary: Object, batches: Object, error?: string }
 */
function runTaskHarmonizeAudit(options) {
  try {
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (e) {}
    }
    options = options || {};
    const scope = options.scope || 'full'; // 'active', 'backlog', 'full'
    const targetListId = options.targetListId || null;

    console.log(`[TaskHarmonizer] Starting Task Audit. Scope: ${scope}, TargetList: ${targetListId || 'ALL'}`);

    // 1. Fetch Task Lists and Tasks
    const taskData = fetchTasksForAudit(scope, targetListId);
    if (!taskData.tasks || taskData.tasks.length === 0) {
      return {
        success: true,
        summary: {
          totalTasksAnalyzed: 0,
          batchACount: 0,
          batchBCount: 0,
          batchCCount: 0,
          batchDCount: 0,
          executiveSummary: "No tasks found matching the selected scope."
        },
        batches: {
          batchA_Duplicates: [],
          batchB_Zombies: [],
          batchC_Taxonomy: [],
          batchD_Metadata: []
        }
      };
    }

    console.log(`[TaskHarmonizer] Ingested ${taskData.tasks.length} tasks for AI analysis.`);

    // 2. Perform AI Audit using Gemini 3.7 Flash
    const auditResult = performGeminiTaskAudit(taskData.tasks);
    if (auditResult.error) {
      console.error(`[TaskHarmonizer] Audit failed: ${auditResult.error}`);
      return { success: false, error: auditResult.error };
    }

    return {
      success: true,
      summary: auditResult.summary || {},
      batches: {
        batchA_Duplicates: auditResult.batchA_Duplicates || [],
        batchB_Zombies: auditResult.batchB_Zombies || [],
        batchC_Taxonomy: auditResult.batchC_Taxonomy || [],
        batchD_Metadata: auditResult.batchD_Metadata || []
      }
    };
  } catch (err) {
    console.error(`[TaskHarmonizer] Critical error in runTaskHarmonizeAudit: ${err.message}`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches tasks from Google Tasks API filtered by scope.
 * 
 * @param {string} scope - 'active', 'backlog', 'full'
 * @param {string|null} targetListId - Optional specific list ID
 * @returns {Object} { taskLists: Array, tasks: Array }
 */
function fetchTasksForAudit(scope, targetListId) {
  const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
  const rawLists = listsResponse.items || [];

  const taskLists = [];
  const allTasks = [];
  const now = new Date();
  const twentyEightDaysAhead = new Date(now.getTime() + (28 * 24 * 60 * 60 * 1000));

  for (const lst of rawLists) {
    const listTitleLower = (lst.title || '').toLowerCase();
    // Skip quarantine / deleted / completed archive lists from source scanning
    if (listTitleLower.includes('quarantine') || listTitleLower.includes('deleted') || listTitleLower.includes('completed')) {
      continue;
    }
    if (targetListId && lst.id !== targetListId) {
      continue;
    }

    taskLists.push({ id: lst.id, title: lst.title });

    let pageToken = null;
    do {
      const response = executeWithRetry(() => Tasks.Tasks.list(lst.id, {
        showCompleted: false,
        showHidden: false,
        showAssigned: true,
        maxResults: 100,
        pageToken: pageToken
      }));

      const items = response.items || [];
      for (const item of items) {
        if (!item.title || item.title.trim() === '') continue;

        let isBacklog = false;
        let isOverdue = false;
        let dueMillis = null;

        if (item.due) {
          const dueDate = new Date(item.due);
          dueMillis = dueDate.getTime();
          if (dueDate.getFullYear() >= 2090) {
            isBacklog = true;
          } else if (dueDate.getTime() < now.getTime() - (24 * 60 * 60 * 1000)) {
            isOverdue = true;
          }
        }

        // Scope filtering logic:
        // 'active': Not a 2099 backlog task, and either due within 28d or no due date / overdue
        // 'backlog': 2099 backlog tasks or overdue > 30 days
        // 'full': all open tasks
        let include = true;
        if (scope === 'active') {
          if (isBacklog) include = false;
          else if (dueMillis && dueMillis > twentyEightDaysAhead.getTime()) include = false;
        } else if (scope === 'backlog') {
          if (!isBacklog && (!isOverdue || (now.getTime() - dueMillis) < (30 * 24 * 60 * 60 * 1000))) {
            include = false;
          }
        }

        if (include) {
          allTasks.push({
            id: item.id,
            listId: lst.id,
            listTitle: lst.title,
            title: item.title,
            notes: item.notes || '',
            due: item.due || null,
            status: item.status || 'needsAction',
            updated: item.updated || null,
            parent: item.parent || null
          });
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  return { taskLists: taskLists, tasks: allTasks };
}

/**
 * Invokes Gemini 3.7 Flash with the Lead Operations Auditor prompt & structured schema.
 * 
 * @param {Array} tasks - Array of sanitized task objects
 * @returns {Object} Parsed JSON audit findings
 */
function performGeminiTaskAudit(tasks) {
  const modelName = (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.SECRETS && SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL)
    ? SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL
    : "gemini-3.7-flash";

  const systemInstruction = `You are the Lead Task Systems Architect & Operations Auditor for "The System" personal & professional executive framework.
Your mission is to perform a rigorous multi-dimensional audit of Google Tasks and synthesize four precise operational batches:
1. Batch A: Semantic Deduplication & Merging (Identical tasks, duplicate recurring schedules, redundant checklist items across lists).
2. Batch B: Zombie & Stale Task Pruning (Tasks overdue >30d, dead 2099 backlog tasks with completed milestones, unexecuted Q4 tasks >60d).
3. Batch C: Taxonomy & Hierarchy Realignment (Missing '[Milestone]' prefixes on epic containers, missing L3 taxonomy codes, orphaned sub-tasks floating as root tasks).
4. Batch D: Metadata & Note Format Standardization (Fixing corrupted SYS/Milestone/DA tags, due date mismatches, standardizing canonical note structure).

=== HIERARCHY & MILESTONE INDEPENDENCE RULES (CRITICAL) ===
- Strict 3-tier hierarchy: [Milestone] (Epic Container) > Task (Native child Google Task) > Sub-Task (Markdown checklist item '- [ ]' in notes).
- NEVER treat child tasks under a Milestone as duplicates of the Milestone itself!
- NEVER treat separate child tasks within a milestone as duplicates of each other simply because they share project scope, goal ID, or timeline (e.g., 'Plan 2027 Wedding Logistics' vs 'Review Makeup Artist Agreement' vs 'Book Venue' are distinct deliverables, NOT duplicates).
- True Duplicates Only in Batch A: Flag a task as duplicate ONLY if it has identical deliverables, redundant copy-pasted action items, or duplicate active recurring schedules.

=== METADATA & NOTE PRESERVATION RULES ===
- Tasks may contain a hidden system block: '---SYSTEM_METADATA---'. You MUST preserve this block and all text below it untouched in all proposed notes.
- Canonical Note Structure:
  <Original Description>

  [DEADLINE: YYYY-MM-DD] | [DURATION: X] | [GOAL: X]

  SYS: <System reasoning>
  Milestone: <Parent Milestone or None>
  DA: <Explicit user instruction>

=== ACTION TYPES ===
- 'MOVE_TO_QUARANTINE': For redundant duplicates (Batch A) or zombie tasks to be pruned (Batch B). The executor will prefix with '99 To be deleted ' and move them to 'Triage Quarantine'.
- 'UPDATE_TASK': For updating title (e.g. adding '[Milestone]'), correcting notes, or re-aligning due dates.
- 'MARK_COMPLETED': For tasks already confirmed as fulfilled or dead completed milestones.

Analyze the provided tasks thoroughly and return the structured JSON output adhering strictly to the response schema.`;

  // Format task payload concisely for prompt efficiency
  const taskPayload = tasks.map((t, idx) => {
    return {
      index: idx + 1,
      id: t.id,
      listId: t.listId,
      listTitle: t.listTitle,
      title: t.title,
      notes: t.notes ? t.notes.substring(0, 1000) : "",
      due: t.due,
      updated: t.updated
    };
  });

  const promptText = `Perform a full task ecosystem grooming audit on the following ${taskPayload.length} Google Tasks:\n\n` + JSON.stringify(taskPayload, null, 2);

  const schema = {
    type: "OBJECT",
    properties: {
      summary: {
        type: "OBJECT",
        properties: {
          totalTasksAnalyzed: { type: "INTEGER" },
          batchACount: { type: "INTEGER" },
          batchBCount: { type: "INTEGER" },
          batchCCount: { type: "INTEGER" },
          batchDCount: { type: "INTEGER" },
          executiveSummary: { type: "STRING" }
        },
        required: ["totalTasksAnalyzed", "batchACount", "batchBCount", "batchCCount", "batchDCount", "executiveSummary"]
      },
      batchA_Duplicates: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            survivorTaskId: { type: "STRING" },
            survivorTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["MOVE_TO_QUARANTINE", "UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "reasoning"]
        }
      },
      batchB_Zombies: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            daysOverdue: { type: "INTEGER" },
            action: { type: "STRING", enum: ["MOVE_TO_QUARANTINE", "MARK_COMPLETED", "UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "reasoning"]
        }
      },
      batchC_Taxonomy: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedMilestone: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "proposedTitle", "reasoning"]
        }
      },
      batchD_Metadata: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING" },
            listId: { type: "STRING" },
            listTitle: { type: "STRING" },
            originalTitle: { type: "STRING" },
            action: { type: "STRING", enum: ["UPDATE_TASK"] },
            proposedTitle: { type: "STRING" },
            proposedNotes: { type: "STRING" },
            proposedDue: { type: "STRING" },
            reasoning: { type: "STRING" }
          },
          required: ["taskId", "listId", "originalTitle", "action", "proposedNotes", "reasoning"]
        }
      }
    },
    required: ["summary", "batchA_Duplicates", "batchB_Zombies", "batchC_Taxonomy", "batchD_Metadata"]
  };

  const aiResult = callGemini(promptText, modelName, systemInstruction, schema, false);
  return aiResult;
}

/**
 * RPC endpoint to execute a chunk of approved task actions.
 * 
 * @param {Array} actionsChunk - Array of action items approved by user
 * @returns {Object} { success: boolean, processedCount: number, errors: Array }
 */
function executeTaskHarmonizeBatch(actionsChunk) {
  if (!Array.isArray(actionsChunk) || actionsChunk.length === 0) {
    return { success: true, processedCount: 0, errors: [] };
  }

  console.log(`[TaskHarmonizer] Executing batch of ${actionsChunk.length} approved actions...`);

  let quarantineListId = null;
  const errors = [];
  let processedCount = 0;

  for (const actionItem of actionsChunk) {
    try {
      const taskId = actionItem.taskId;
      const listId = actionItem.listId;
      const action = actionItem.action || 'UPDATE_TASK';

      if (!taskId || !listId) {
        errors.push({ taskId: taskId || 'unknown', error: "Missing taskId or listId" });
        continue;
      }

      // Fetch latest task data from API
      let currentTask = null;
      try {
        currentTask = executeWithRetry(() => Tasks.Tasks.get(listId, taskId));
      } catch (getErr) {
        errors.push({ taskId: taskId, title: actionItem.originalTitle, error: `Task not found: ${getErr.message}` });
        continue;
      }

      if (action === 'MOVE_TO_QUARANTINE') {
        // Ensure Quarantine List exists
        if (!quarantineListId) {
          quarantineListId = getOrCreateQuarantineListId();
        }

        const rawTitle = actionItem.proposedTitle || currentTask.title || 'Untitled Task';
        const cleanTitle = rawTitle.replace(/^99\s+To\s+be\s+deleted\s+/i, '').trim();
        const quarantineTitle = `99 To be deleted ${cleanTitle}`;

        const newTaskBody = {
          title: quarantineTitle,
          notes: currentTask.notes || '',
          due: currentTask.due || null
        };

        // 1. Insert into quarantine list
        executeWithRetry(() => Tasks.Tasks.insert(newTaskBody, quarantineListId));

        // 2. Delete from source active list
        executeWithRetry(() => Tasks.Tasks.remove(listId, taskId));

        processedCount++;
        console.log(`[TaskHarmonizer] Moved task '${cleanTitle}' to Quarantine.`);

      } else if (action === 'MARK_COMPLETED') {
        executeWithRetry(() => Tasks.Tasks.patch({ status: 'completed' }, listId, taskId));
        processedCount++;
        console.log(`[TaskHarmonizer] Marked task '${currentTask.title}' as Completed.`);

      } else if (action === 'UPDATE_TASK') {
        const patchBody = {};

        if (actionItem.proposedTitle && actionItem.proposedTitle.trim() !== '') {
          patchBody.title = actionItem.proposedTitle.trim();
        }

        if (actionItem.proposedDue !== undefined) {
          patchBody.due = actionItem.proposedDue;
        }

        if (actionItem.proposedNotes !== undefined && actionItem.proposedNotes !== null) {
          let updatedNotes = actionItem.proposedNotes;

          // Preserve hidden system metadata block if present in original task
          const existingNotes = currentTask.notes || '';
          if (existingNotes.includes('---SYSTEM_METADATA---')) {
            const metaParts = existingNotes.split('---SYSTEM_METADATA---');
            const metaBlock = `\n\n---SYSTEM_METADATA---${metaParts[1]}`;
            if (!updatedNotes.includes('---SYSTEM_METADATA---')) {
              updatedNotes = updatedNotes.trim() + metaBlock;
            }
          }

          patchBody.notes = updatedNotes;
        }

        if (Object.keys(patchBody).length > 0) {
          executeWithRetry(() => Tasks.Tasks.patch(patchBody, listId, taskId));
          processedCount++;
          console.log(`[TaskHarmonizer] Patched task '${currentTask.title}'.`);
        }
      }
    } catch (taskErr) {
      console.error(`[TaskHarmonizer] Error processing action for task ${actionItem.taskId}: ${taskErr.message}`);
      errors.push({ taskId: actionItem.taskId, title: actionItem.originalTitle, error: taskErr.message });
    }
  }

  return {
    success: errors.length === 0,
    processedCount: processedCount,
    errors: errors
  };
}

/**
 * Finds or creates the 'Triage Quarantine' list.
 * 
 * @returns {string} Tasklist ID
 */
function getOrCreateQuarantineListId() {
  const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
  const lists = listsResponse.items || [];

  for (const lst of lists) {
    const t = (lst.title || '').toLowerCase();
    if (t === 'triage quarantine' || t === 'to be deleted') {
      return lst.id;
    }
  }

  // Create new list if not found
  console.log("[TaskHarmonizer] Creating new 'Triage Quarantine' list...");
  const newList = executeWithRetry(() => Tasks.Tasklists.insert({ title: 'Triage Quarantine' }));
  return newList.id;
}

/**
 * Helper to fetch all available task list names and IDs for UI selector.
 * 
 * @returns {Array} List of { id, title }
 */
function getHarmonizeTaskLists() {
  try {
    const listsResponse = executeWithRetry(() => Tasks.Tasklists.list({ maxResults: 100 }));
    const lists = listsResponse.items || [];
    return lists.map(l => ({ id: l.id, title: l.title }));
  } catch (e) {
    console.error(`[TaskHarmonizer] Failed to list tasklists: ${e.message}`);
    return [];
  }
}
