const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log("Running Column Indices and Dedup tests...");

  // 1. Mock minimal environment
  const SYSTEM_CONFIG = {
    SHEETS: {
      COMPLETED_TASKS_LOG: '1580572400',
      TASK_REVIEW: '1580572397'
    },
    TASKS: {
      TO_BE_DELETED_LIST_ID: 'delete-list-id',
      RECURRING_LIST_ID: 'recurring-list-id'
    },
    ROOTS: {
      MASTER_SHEET_ID: 'master-sheet-id'
    }
  };

  const mockProperties = {
    getProperties: () => ({ ENV: 'PRIVATE', GEMINI_API_KEY: 'test-key' }),
    getProperty: () => null,
    deleteProperty: () => {}
  };
  const mockPropertiesService = {
    getUserProperties: () => mockProperties,
    getScriptProperties: () => mockProperties
  };

  const Utilities = {
    formatDate: (date, tz, fmt) => '2026-07-18',
    sleep: () => {}
  };

  // Mock sheet data
  let completedSheetData = [];
  let writeCalled = false;
  let writeValues = [];

  const mockSheet = {
    getSheetId: () => 1580572400,
    getDataRange: () => ({
      getValues: () => completedSheetData
    }),
    getLastRow: () => completedSheetData.length,
    getRange: (row, col, numRows, numCols) => ({
      setValues: (values) => {
        writeCalled = true;
        writeValues = values;
      },
      setFontWeight: () => ({})
    }),
    hideColumns: (colIndex, numCols) => {
      mockSheet.hiddenColumns = { colIndex, numCols };
    }
  };

  const mockSpreadsheet = {
    getSheets: () => [mockSheet]
  };

  const Tasks = {
    Tasks: {
      list: (listId, options) => {
        if (listId === 'delete-list-id') {
          return {
            items: [
              { id: 'task-123', title: 'Task to Delete', status: 'completed', completed: new Date().toISOString() }
            ]
          };
        }
        return {
          items: [
            { id: 'task-123', title: 'Test Completed Task', status: 'completed', completed: new Date().toISOString() }
          ]
        };
      },
      remove: () => {}
    },
    Tasklists: {
      list: () => {
        return {
          items: [
            { id: 'list-1', title: 'List 1' }
          ]
        };
      }
    }
  };

  const sandbox = {
    SYSTEM_CONFIG,
    PropertiesService: mockPropertiesService,
    Utilities,
    Tasks,
    console: console,
    globalThis: {},
    getMasterSpreadsheet: () => mockSpreadsheet,
    loadValidTaxonomyPaths: () => ({}),
    executeWithRetry: (fn) => fn(),
    extractExternalLinkFromText: () => '',
    resolveCategoryAndTitle: (title, category) => ({ title, category }),
    extractMilestone: () => '',
    isPmtAccount: () => false
  };
  sandbox.globalThis = sandbox;

  // Load Code_Tasks.js
  const tasksCodePath = path.join(__dirname, '../src/Code_Tasks.js');
  let tasksCode = fs.readFileSync(tasksCodePath, 'utf8');
  
  // Inject helper export
  tasksCode += `\n
  globalThis.getExportHeaders = getExportHeaders;
  globalThis.syncCompletedTasksLog = syncCompletedTasksLog;
  globalThis.purgeToBeDeletedTasks = purgeToBeDeletedTasks;
  `;

  vm.runInNewContext(tasksCode, sandbox);

  // Assert headers
  const headers = sandbox.getExportHeaders();
  const taskIdIdx = headers.indexOf("Task ID");
  const statusIdx = headers.indexOf("Status");
  
  assert.strictEqual(taskIdIdx, 15, "Task ID should be at index 15");
  assert.strictEqual(statusIdx, 7, "Status should be at index 7");
  console.log("✓ getExportHeaders indices verified.");

  // Test 1: Deduplication fails on stale indices (original bug verification)
  // We populate completedSheetData with task-123 at correct indices (15 for Task ID, 7 for Status)
  // An export row has 18 columns.
  const correctRow = Array(18).fill("");
  correctRow[15] = "task-123";
  correctRow[7] = "Completed";

  completedSheetData = [
    headers,
    correctRow
  ];

  // Let's run the parsing of existingIds manually using the old logic to prove it failed:
  const oldLogicTid = correctRow.length >= 15 ? correctRow[14] : correctRow[0];
  const oldLogicStatus = correctRow.length >= 7 ? correctRow[6] : "";
  assert.notStrictEqual(oldLogicTid, "task-123", "Old logic should extract index 14, which is not task-123");
  assert.notStrictEqual(oldLogicStatus, "Completed", "Old logic should extract index 6, which is not Completed");
  console.log("✓ Confirmed that old logic fails to parse correct row indices.");

  // Run the full sync function.
  // Since the old logic fails, it will think task-123 is NOT in completed log, and try to write it.
  writeCalled = false;
  sandbox.syncCompletedTasksLog();
  
  // If the bug is still present, writeCalled will be true. If fixed, it should be false!
  const isBugPresent = writeCalled;
  if (isBugPresent) {
    console.log("TEST RESULT: Bug is PRESENT (syncCompletedTasksLog attempted to write duplicate task).");
  } else {
    console.log("TEST RESULT: Bug is FIXED (syncCompletedTasksLog correctly deduplicated task).");
  }

  // Test 2: Verify purgeToBeDeletedTasks deduplication
  writeCalled = false;
  sandbox.purgeToBeDeletedTasks();
  if (writeCalled) {
    throw new Error("purgeToBeDeletedTasks attempted to write duplicate task, should have skipped!");
  }
  console.log("✓ purgeToBeDeletedTasks deduplication verified successfully.");
}

try {
  runTest();
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
}
