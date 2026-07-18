const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log("Running T34 Quota Loops Regression Test...");

  let apiCalls = [];
  
  // Mock Gmail Advanced Service
  const Gmail = {
    Users: {
      Labels: {
        list: (userId) => {
          apiCalls.push("Gmail.Users.Labels.list");
          return {
            labels: [
              { id: 'label-1', name: 'INBOX' },
              { id: 'label-2', name: 'SENT' }
            ]
          };
        },
        get: (userId, labelId) => {
          apiCalls.push(`Gmail.Users.Labels.get(${labelId})`);
          return { threadsTotal: 42 };
        }
      }
    }
  };

  // Mock GmailApp
  const GmailApp = {
    getUserLabels: () => [
      { getName: () => 'INBOX', getUnreadCount: () => 5, getThreads: () => [] },
      { getName: () => 'SENT', getUnreadCount: () => 0, getThreads: () => [] }
    ],
    getThreadById: (id) => {
      apiCalls.push(`GmailApp.getThreadById(${id})`);
      return {
        getId: () => id,
        getMessages: () => []
      };
    }
  };

  // Mock Tasks Advanced Service
  let tasksListCallCount = 0;
  const Tasks = {
    Tasks: {
      list: (listId, options) => {
        tasksListCallCount++;
        apiCalls.push(`Tasks.Tasks.list(${options.pageToken || 'page-1'})`);
        if (!options.pageToken) {
           return { items: [{ id: 'm1', title: '[Milestone] Existing' }], nextPageToken: 'page-2' };
        } else {
           return { items: [{ id: 'm2', title: '[Milestone] Another' }], nextPageToken: null };
        }
      },
      insert: (resource, listId) => {
        apiCalls.push(`Tasks.Tasks.insert(${resource.title})`);
        return { id: 'new-m', title: resource.title };
      },
      patch: () => {},
      move: () => {}
    }
  };
  
  const Utilities = { sleep: () => {} };

  const sandbox = {
    Gmail,
    GmailApp,
    Tasks,
    Utilities,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    executeWithRetry: (fn) => fn()
  };
  
  // 1. Test Code_ListLabels.js
  const labelsCode = fs.readFileSync(path.join(__dirname, '../src/Code_ListLabels.js'), 'utf8');
  vm.runInNewContext(labelsCode + "\n\nupdateLabelList();", sandbox);
  
  assert.ok(apiCalls.includes("Gmail.Users.Labels.list"), "Should fetch label list from Advanced API");
  assert.ok(apiCalls.includes("Gmail.Users.Labels.get(label-1)"), "Should fetch label-1 specifically");
  assert.ok(apiCalls.includes("Gmail.Users.Labels.get(label-2)"), "Should fetch label-2 specifically");
  
  // 2. Test Code_Tasks.js (bulkFetchGmailThreads)
  const tasksCode = fs.readFileSync(path.join(__dirname, '../src/Code_Tasks.js'), 'utf8');
  vm.runInNewContext(tasksCode, sandbox);
  sandbox.bulkFetchGmailThreads(["thread-1", "thread-2"]);
  
  assert.ok(apiCalls.includes("GmailApp.getThreadById(thread-1)"), "Should fetch thread-1 explicitly");
  assert.ok(apiCalls.includes("GmailApp.getThreadById(thread-2)"), "Should fetch thread-2 explicitly");

  // 3. Test Code_TaskEngine.js (processTaskUpdates paginated fetch)
  const taskEngineCode = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
  const systemCoreCode = fs.readFileSync(path.join(__dirname, '../src/Code_SystemCore.js'), 'utf8');
  
  const engineSandbox = {
     ...sandbox,
     SYSTEM_CONFIG: { TASKS: { TO_BE_DELETED_LIST_ID: 'del', AI_REVIEW_LIST_ID: 'rev' } },
     getStandardizedTaskHash: () => "hash",
     getOrCreateTriageQuarantineListId: () => "q",
     parseTaskNotes: () => ({ cleanNotes: "" })
  };
  
  vm.runInNewContext(systemCoreCode + "\n" + taskEngineCode, engineSandbox);
  
  const updates = [
     { taskId: '1', recommendedMilestone: '[Milestone] Existing', routingTarget: 'SCHEDULE' },
     { taskId: '2', recommendedMilestone: '[Milestone] Existing', routingTarget: 'SCHEDULE' }
  ];
  
  engineSandbox.processTaskUpdates(updates, {}, "importer", "todo");
  
  // Assert that Tasks.list was only called twice (for the two pages) despite there being 2 updates!
  // If the O(N^2) loop was still there, it would fetch both pages twice (4 calls).
  assert.strictEqual(tasksListCallCount, 2, "Tasks API should only be paginated once, then cached");
  
  console.log("✓ T34 Quota Loops tests passed!");
}

try {
  runTest();
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
}
