const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock Data
const mockTasksDir = path.join(__dirname, 'mock_tasks');
const mockFiles = fs.readdirSync(mockTasksDir).filter(f => f.endsWith('.json'));

const SYSTEM_CONFIG = {
  TASKS: { IMPORTER_LIST_ID: 'importer-list', TODO_LIST_ID: 'todo-list', RECURRING_LIST_ID: 'recurring-list' },
  DOCS: { TASK_MASTER_PROMPT_ID: 'doc-1', TASK_MASTER_DAILY_PROMPT_ID: 'doc-2', PERSONAL_GOALS_FILE_ID: 'doc-3', WORK_GOALS_FILE_ID: 'doc-4', TAXONOMY_JSON_ID: 'doc-5', CLERK_DRIVE_INSTRUCTIONS: 'doc-7' },
  ROOTS: { WORKSPACE_FOLDER_ID: 'folder-1', MASTER_SHEET_ID: 'sheet-1' },
  SECRETS: { GEMINI_MODEL_FLASH: 'gemini-1.5-flash', GEMINI_MODEL_PRO: 'gemini-1.5-pro', GEMINI_MODEL_2M_RETRO: 'gemini-1.5-pro', GEMINI_API_KEY: 'test-key' },
  GENERATED_OUTPUTS: { DAY_1_EXECUTION_PLAN: 'doc-6' }
};

let tasksDb = {
  'importer-list': [],
  'todo-list': []
};

let apiCalls = [];
let currentTestData = null;

const Tasks = {
  Tasks: {
    list: (listId, options) => {
      apiCalls.push({ action: 'list', listId });
      // Return clones to simulate API response
      return { items: (tasksDb[listId] || []).map(t => JSON.parse(JSON.stringify(t))) };
    },
    get: (listId, taskId) => {
      apiCalls.push({ action: 'get', listId, taskId });
      const found = (tasksDb[listId] || []).find(t => String(t.id) === String(taskId));
      return found ? JSON.parse(JSON.stringify(found)) : undefined;
    },
    patch: (patchObj, listId, taskId) => {
      apiCalls.push({ action: 'patch', listId, taskId, patchObj });
      const list = tasksDb[listId];
      if (list) {
        const idx = list.findIndex(t => String(t.id) === String(taskId));
        if (idx !== -1) {
           list[idx] = { ...list[idx], ...patchObj };
        }
      }
    },
    insert: (taskObj, listId) => {
      apiCalls.push({ action: 'insert', listId, taskObj });
      if (!tasksDb[listId]) tasksDb[listId] = [];
      const newTask = JSON.parse(JSON.stringify(taskObj));
      if (!newTask.id) newTask.id = Math.random().toString();
      tasksDb[listId].push(newTask);
      return newTask;
    },
    remove: (listId, taskId) => {
      apiCalls.push({ action: 'remove', listId, taskId });
      if (tasksDb[listId]) {
         tasksDb[listId] = tasksDb[listId].filter(t => String(t.id) !== String(taskId));
      }
    }
  },
  Tasklists: {
    list: (options) => {
      apiCalls.push({ action: 'list_tasklists', options });
      return {
        items: Object.keys(tasksDb).map(name => ({
          id: name,
          title: name === 'delete-list' ? 'To Be Deleted' : (name === 'quarantine-list' ? 'Triage Quarantine' : name)
        }))
      };
    },
    insert: (resource) => {
      apiCalls.push({ action: 'insert_tasklist', resource });
      const newId = resource.title.toLowerCase().replace(/\s+/g, '-') + '-list';
      tasksDb[newId] = [];
      return { id: newId, title: resource.title };
    }
  }
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: (ms) => true,
    releaseLock: () => {}
  })
};

const Utilities = {
  sleep: () => {},
  formatDate: (date, tz, fmt) => '2026-06-02',
  computeDigest: () => [1,2,3],
  DigestAlgorithm: { MD5: 'MD5' },
  base64Encode: () => 'hash123',
  formatString: (fmt, ...args) => {
    let i = 0;
    return fmt.replace(/%02d/g, () => String(args[i++]).padStart(2, '0'));
  }
};

const DriveApp = {
  getFileById: (id) => ({
    getBlob: () => ({ getDataAsString: () => 'Mocked Document Text' })
  }),
  getFolderById: () => ({
    getFilesByName: () => ({ hasNext: () => false }),
    createFile: () => ({ getUrl: () => 'mock-url' })
  })
};

const CalendarApp = {
  getDefaultCalendar: () => ({
    getEvents: () => []
  })
};

const CacheService = {
  getScriptCache: () => ({
    get: () => null,
    put: () => {}
  })
};

const UrlFetchApp = {
  fetch: (url, options) => {
    apiCalls.push({ action: 'UrlFetchApp.fetch', url, options });
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: "Mocked AI Response" }]
          }
        }]
      })
    };
  }
};

let callGeminiMock = (payloadStr, modelName, systemInstruction, schema) => {
  apiCalls.push({ action: 'callGemini', modelName, payloadStr });
  
  if (schema && schema.properties && schema.properties.markdownReport) {
      return { markdownReport: "Mocked Markdown Report" };
  }

  if (currentTestData && currentTestData.ai_response) {
      return currentTestData.ai_response;
  }
  
  return { taskUpdates: [] };
};

const consoleMock = {
  log: (...args) => console.log('MockLog:', ...args),
  warn: (...args) => console.warn('MockWarn:', ...args),
  error: (...args) => console.error('MockError:', ...args)
};

const MimeType = { PLAIN_TEXT: 'text/plain' };

const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => ({
      appendRow: () => {}
    })
  }),
  openById: () => ({
    getSheetByName: (name) => ({
      appendRow: () => {}
    })
  })
};

const PropertiesService = {
  getUserProperties: () => ({
    getProperty: () => null
  }),
  getScriptProperties: () => ({
    getProperty: () => null
  })
};

// Setup Context
const sandbox = {
  SYSTEM_CONFIG,
  Tasks,
  Utilities,
  DriveApp,
  CalendarApp,
  CacheService,
  UrlFetchApp,
  MimeType,
  SpreadsheetApp,
  PropertiesService,
  LockService,
  console: consoleMock,
  callGemini: callGeminiMock,
  selectModelForPayload: () => 'gemini-1.5-pro',
  executeTimeboxing: () => {},
  processPromptText: (text) => text || "",
  IS_PMT_ENV: false
};

vm.createContext(sandbox);

const codeSystemCore = fs.readFileSync(path.join(__dirname, '../src/Code_SystemCore.js'), 'utf8');
vm.runInContext(codeSystemCore, sandbox);

// Re-assign mocked callGemini back to sandbox so that the test harness's mock is used instead of the real one
sandbox.callGemini = callGeminiMock;

const codeTaskEngine = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
vm.runInContext(codeTaskEngine, sandbox);

const processMockTask = (t) => {
   const notesArr = [];
   if (t.notes !== undefined) {
       notesArr.push(t.notes);
   } else {
       let meta = { duration: `${t.duration || 0}m` };
       if (t.important) notesArr.push("DA: Important");
       if (t.urgent) notesArr.push("DA: Urgent");
       notesArr.push("---SYSTEM_METADATA---");
       notesArr.push(JSON.stringify(meta));
   }
   return {
     id: String(t.id || Math.random()),
     title: t.title || "Task",
     notes: notesArr.join('\\n'),
     status: t.status || "needsAction",
     due: t.due || null
   };
};

async function runTests() {
  console.log("Starting tests...");
  let passed = 0;
  let failed = 0;

  for (const file of mockFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(mockTasksDir, file), 'utf8'));
    currentTestData = data;
    
    // reset state
    apiCalls = [];
    tasksDb['importer-list'] = [];
    tasksDb['todo-list'] = [];
    
    // Load tasks based on presence in JSON
    if (data.importer && Array.isArray(data.importer)) {
      data.importer.forEach(t => tasksDb['importer-list'].push(processMockTask(t)));
    } else if (data.input && Array.isArray(data.input.tasks)) {
      data.input.tasks.forEach(t => tasksDb['importer-list'].push(processMockTask(t)));
    } else if (Array.isArray(data.input)) {
      data.input.forEach(t => tasksDb['importer-list'].push(processMockTask(t)));
    }

    if (data.todo && Array.isArray(data.todo)) {
      data.todo.forEach(t => tasksDb['todo-list'].push(processMockTask(t)));
    }

    const hasNewFormatAssertions = data.expected_importer_count !== undefined ||
                                   data.expected_todo_count !== undefined ||
                                   data.expected_todo_items !== undefined ||
                                   data.expected_metadata !== undefined;

    const hasLegacyEisenhowerAssertions = data.expected && data.expected.eisenhower;

    try {
      sandbox.runTaskMasterEngine();
      
      let passedTest = true;
      let errors = [];

      if (hasNewFormatAssertions) {
          if (data.expected_importer_count !== undefined && tasksDb['importer-list'].length !== data.expected_importer_count) {
              passedTest = false;
              errors.push(`Expected importer count ${data.expected_importer_count}, got ${tasksDb['importer-list'].length}`);
          }
          if (data.expected_todo_count !== undefined && tasksDb['todo-list'].length !== data.expected_todo_count) {
              passedTest = false;
              errors.push(`Expected todo count ${data.expected_todo_count}, got ${tasksDb['todo-list'].length}`);
          }
          if (data.expected_todo_items) {
             data.expected_todo_items.forEach((item) => {
                 const found = tasksDb['todo-list'].find(t => t.title === item.title);
                 if (!found) {
                     passedTest = false;
                     errors.push(`Expected todo item '${item.title}' not found in todo-list`);
                 }
             });
          }
          if (data.expected_metadata) {
             for (const taskId in data.expected_metadata) {
                 const expectedMeta = data.expected_metadata[taskId];
                 
                 const task = tasksDb['todo-list'].find(t => String(t.id) === String(taskId)) 
                           || tasksDb['importer-list'].find(t => String(t.id) === String(taskId))
                           || tasksDb['todo-list'].find(t => typeof t.title === 'string' && t.title.includes(`${taskId}`)); // Fallback if ID was lost
                 
                 if (!task) {
                     passedTest = false;
                     errors.push(`Task ${taskId} not found for metadata assertion`);
                     continue;
                 }
                 const parts = (task.notes || "").split('---SYSTEM_METADATA---');
                 if (parts.length > 1) {
                     try {
                         const meta = JSON.parse(parts[1].trim());
                         for (const key in expectedMeta) {
                             if (meta[key] !== expectedMeta[key]) {
                                 passedTest = false;
                                 errors.push(`Task ${taskId} metadata mismatch for '${key}': expected ${expectedMeta[key]}, got ${meta[key]}`);
                             }
                         }
                     } catch (e) {
                         passedTest = false;
                         errors.push(`Task ${taskId} metadata parsing error`);
                     }
                 } else {
                     passedTest = false;
                     errors.push(`Task ${taskId} has no metadata section`);
                 }
             }
          }
          
          if (passedTest) {
             console.log(`PASS: ${file}`);
             passed++;
          } else {
             console.error(`FAIL: ${file}`);
             errors.forEach(e => console.error(`  - ${e}`));
             failed++;
          }
      } else if (hasLegacyEisenhowerAssertions) {
          // Assert that the importer list is empty because all items should have been routed
          // EXCEPTION: items routed to DELETE stay in the importer list and are renamed to start with "99 To be deleted "
          const remainingImporter = tasksDb['importer-list'].filter(t => !t.title.startsWith("99 To be deleted "));
          if (remainingImporter.length !== 0) {
              passedTest = false;
              errors.push(`Expected importer count 0 for legacy eisenhower test (ignoring deleted items), got ${tasksDb['importer-list'].length}`);
          }
          if (passedTest) {
              console.log(`PASS: ${file}`);
              passed++;
          } else {
              console.error(`FAIL: ${file}`);
              errors.forEach(e => console.error(`  - ${e}`));
              failed++;
          }
      } else {
          console.log(`PASS (No Assertions): ${file}`);
          passed++;
      }
    } catch (e) {
      console.error(`ERROR: ${file} threw an exception`, e);
      failed++;
    }
  }

  // Hourly Review test
  try {
     apiCalls = [];
     tasksDb['importer-list'] = [{ id: '1', title: 'Task1', notes: '' }];
     sandbox.runHourlyReview();
     const hasFetch = apiCalls.some(a => a.action === 'callGemini' || a.action === 'UrlFetchApp.fetch');
     if (hasFetch) {
         console.log("PASS: Hourly Review (Uses callGemini)");
         passed++;
     } else {
         console.error("FAIL: Hourly Review (Did not use callGemini or failed to run)");
         failed++;
     }
  } catch(e) {
     console.error("ERROR: runHourlyReview threw exception", e);
     failed++;
  }

  console.log(`\\nTests Complete: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests();
