const fs = require('fs');
const path = require('path');
const vm = require('vm');

let apiCalls = [];
let tasksDb = {
  'importer-list': [],
  'todo-list': []
};

const Tasks = {
  Tasks: {
    list: (listId) => ({ items: tasksDb[listId] || [] }),
    get: (listId, taskId) => (tasksDb[listId] || []).find(t => t.id === taskId),
    patch: (patchObj, listId, taskId) => {
      const list = tasksDb[listId];
      const idx = list.findIndex(t => t.id === taskId);
      if (idx !== -1) list[idx] = { ...list[idx], ...patchObj };
    },
    insert: (taskObj, listId) => {
      tasksDb[listId].push(taskObj);
    },
    remove: (listId, taskId) => {
      tasksDb[listId] = tasksDb[listId].filter(t => t.id !== taskId);
    }
  }
};

const Utilities = {
  sleep: () => {},
  formatDate: () => '2026-06-02',
  computeDigest: () => [1,2,3],
  DigestAlgorithm: { MD5: 'MD5' },
  base64Encode: () => 'hash123'
};

const consoleMock = {
  log: () => {},
  warn: () => {},
  error: () => {}
};

// We will inject an AI response
let aiResponseToInject = null;
const callGeminiMock = (payloadStr) => {
  return aiResponseToInject;
};

const sandbox = {
  SYSTEM_CONFIG: {
    TASKS: { IMPORTER_LIST_ID: 'importer-list', TODO_LIST_ID: 'todo-list' },
    DOCS: { TASK_MASTER_PROMPT_ID: '1', TAXONOMY_JSON_ID: '1', PERSONAL_GOALS_FILE_ID: '1', WORK_GOALS_FILE_ID: '1' },
    ROOTS: {}, SECRETS: {}
  },
  Tasks, Utilities,
  DriveApp: { getFileById: () => ({ getBlob: () => ({ getDataAsString: () => 'text' }) }) },
  CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => [] }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  console: consoleMock,
  callGemini: callGeminiMock,
  selectModelForPayload: () => 'gemini',
  logSystemHeartbeat: () => {},
  processPromptText: (t) => t || ""
};

vm.createContext(sandbox);
const codeSystemCore = fs.readFileSync(path.join(__dirname, '../src/Code_SystemCore.js'), 'utf8');
const codeTaskEngine = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
const code = codeSystemCore + "\n" + codeTaskEngine;
vm.runInContext(code, sandbox);

function runStressTest() {
  console.log("Running adversarial stress tests on Code_TaskEngine.js...");
  let failed = 0;
  
  const testCases = [
    {
      name: "Hallucinated types (numbers and objects where strings expected)",
      aiResult: {
        taskUpdates: [
          {
            taskId: 123, // should be string
            routingTarget: { target: "SCHEDULE" }, // should be string
            recommendedDeadline: 20260601, // number
            estimatedDuration: ["30m"], // array
            alignedGoal: null, 
            category_path: 1, // number
            recommendedTitle: true // boolean
          },
          {
            taskId: "task-2",
            routingTarget: "SCHEDULE",
            recommendedDeadline: "2026-06-02",
            estimatedDuration: "1h",
            alignedGoal: "GOAL-2",
            category_path: "Category > Sub",
            recommendedTitle: "Valid Task"
          }
        ]
      }
    },
    {
      name: "Empty and null fields",
      aiResult: {
        taskUpdates: [
          {
            taskId: "task-1",
            routingTarget: null,
            estimatedDuration: null,
            alignedGoal: undefined,
            category_path: "",
            recommendedTitle: null
          }
        ]
      }
    },
    {
      name: "Missing taskUpdates array completely",
      aiResult: {
        someOtherKey: []
      }
    },
    {
      name: "taskUpdates is a string",
      aiResult: {
        taskUpdates: "I hallucinated this string instead of an array"
      }
    }
  ];
  
  for (const tc of testCases) {
    tasksDb['importer-list'] = [
      { id: '123', title: 'Task A', notes: 'text', status: 'needsAction' },
      { id: 'task-1', title: 'Task B', notes: 'text', status: 'needsAction' },
      { id: 'task-2', title: 'Task C', notes: 'text', status: 'needsAction' }
    ];
    tasksDb['todo-list'] = [];
    aiResponseToInject = tc.aiResult;
    
    try {
      sandbox.runTaskMasterEngine();
      console.log(`PASS: ${tc.name} did not crash`);
    } catch (e) {
      console.error(`FAIL: ${tc.name} threw exception: ${e.message}`);
      failed++;
    }
  }
  
  if (failed > 0) {
    console.error("Adversarial stress test FAILED.");
    process.exit(1);
  } else {
    console.log("Adversarial stress test PASSED.");
    process.exit(0);
  }
}

runStressTest();
