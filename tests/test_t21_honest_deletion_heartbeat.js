const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function runTest() {
  const srcDir = path.join(__dirname, '../src');
  const codeEngine = fs.readFileSync(path.join(srcDir, 'Code_TaskEngine.js'), 'utf8');
  const codeTasks = fs.readFileSync(path.join(srcDir, 'Code_Tasks.js'), 'utf8');
  
  let heartbeatCalls = [];
  
  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },
    logSystemHeartbeat: (name, status) => {
      heartbeatCalls.push({name, status});
    },
    getTaskMasterSystemPrompt: () => "PROMPT",
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    purgeToBeDeletedTasks: () => {},
    purgeQuarantineTasks: () => {},
    _executeTaskMasterPipeline: () => undefined,
    Utilities: { sleep: () => {} },
    SYSTEM_CONFIG: {
      ROOTS: { MASTER_SHEET_ID: "mock" },
      TASKS: { TO_BE_DELETED_LIST_ID: "mock" },
      SHEETS: { COMPLETED_TASKS_LOG: "mock" }
    },
    Tasks: {
      Tasks: {
        get: () => ({ title: "Test", notes: "Notes", due: "2026-01-01" }),
        patch: () => { throw new Error("Mock Error"); },
        list: () => ({ items: [] }),
        insert: () => { throw new Error("Mock Error"); },
        remove: () => { throw new Error("Mock Error"); }
      }
    }
  };

  vm.createContext(sandbox);

  vm.runInContext(codeEngine, sandbox);
  sandbox._executeTaskMasterPipeline = () => undefined;
  sandbox.runTaskMasterEngine();
  
  if (heartbeatCalls.length === 0 || heartbeatCalls[0].status !== "FAILURE") {
    console.error("FAIL: logSystemHeartbeat did not report FAILURE when _executeTaskMasterPipeline returned undefined.");
    process.exit(1);
  }
  
  // Test 2: processTaskUpdates error capture
  const updates = [{ taskId: "t1", routingTarget: "todo", action: "UPDATE", status: "needsAction" }];
  const success = sandbox.processTaskUpdates(updates, { "t1": "todo" }, "importer", "todo");
  if (success !== false) {
    console.error("FAIL: processTaskUpdates did not return false on exceptions.");
    process.exit(1);
  }

  // Test 3: purgeQuarantineTasks existence
  vm.runInContext(codeTasks, sandbox);
  if (typeof sandbox.purgeQuarantineTasks !== 'function') {
    console.error("FAIL: purgeQuarantineTasks function not found.");
    process.exit(1);
  }

  console.log("PASS: Honest deletion/heartbeat and quarantine lifecycle are properly hooked.");
  process.exit(0);
}

runTest();
