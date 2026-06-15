const fs = require('fs');
const path = require('path');
const vm = require('vm');

let tasksDb = {
  'importer-list': [],
  'todo-list': [],
  'to-be-deleted-list': []
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
    insert: (taskObj, listId) => { tasksDb[listId].push(taskObj); },
    remove: (listId, taskId) => { tasksDb[listId] = tasksDb[listId].filter(t => t.id !== taskId); },
    update: (taskObj, listId, taskId) => {
      const list = tasksDb[listId];
      const idx = list.findIndex(t => t.id === taskId);
      if (idx !== -1) list[idx] = taskObj;
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

// We simulate Gemini strictly following Task_Master_Prompt.md
const callGeminiMock = (payloadStr, modelName, systemInstruction, schema) => {
  return {
    taskUpdates: [
      {
        taskId: "task-1",
        routingTarget: "DELETE", // as instructed by Task_Master_Prompt.md
        estimatedDuration: "0m",
        alignedGoal: "Maintenance",
        category_path: "N/A",
        recommendedTitle: "Junk Task"
      }
    ]
  };
};

const sandbox = {
  SYSTEM_CONFIG: {
    TASKS: { IMPORTER_LIST_ID: 'importer-list', TODO_LIST_ID: 'todo-list', TO_BE_DELETED_LIST_ID: 'to-be-deleted-list' },
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
  getTaskMasterSystemPrompt: () => "mock prompt",
  getCalendarCapacity: () => [],
  getSystemGoals: () => [],
  getSystemTaxonomy: () => []
};

vm.createContext(sandbox);
const code = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
vm.runInContext(code, sandbox);

function runOracle() {
  tasksDb['importer-list'] = [
    { id: 'task-1', title: 'Junk Task', notes: '', status: 'needsAction' }
  ];
  tasksDb['todo-list'] = [];
  tasksDb['to-be-deleted-list'] = [];
  
  sandbox.runTaskMasterEngine();
  
  const task1 = tasksDb['to-be-deleted-list'].find(t => t.title.includes('Junk')) ||
                tasksDb['todo-list'].find(t => t.title.includes('Junk')) ||
                tasksDb['importer-list'].find(t => t.title.includes('Junk'));
  
  if (task1 && task1.title.includes("99 To be deleted")) {
    console.log("PASS: Task was correctly marked for deletion.");
  } else {
    const title = task1 ? task1.title : 'undefined';
    console.log(`FAIL: Task title is '${title}'. It was NOT marked for deletion.`);
    console.log(`Task is currently in ${tasksDb['to-be-deleted-list'].length > 0 ? 'to-be-deleted-list' : (tasksDb['todo-list'].length > 0 ? 'todo-list' : 'importer-list')}.`);
    process.exit(1);
  }
}

runOracle();
