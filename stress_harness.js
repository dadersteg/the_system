const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'src/Code_TaskEngine.js'), 'utf8');

let logs = [];
const sandbox = {
  console: {
    log: (...args) => logs.push(['log', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
    error: (...args) => logs.push(['error', ...args])
  },
  Tasks: {
    Tasks: {
      get: (l, t) => ({ id: t, notes: '---SYSTEM_METADATA---\n{}', title: 'T' }),
      patch: () => {},
      insert: () => {},
      remove: () => {}
    }
  },
  Utilities: {
    sleep: () => {},
    base64Encode: () => 'hash',
    computeDigest: () => [],
    DigestAlgorithm: { MD5: 'MD5' }
  }
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const weirdUpdates = [
  null,
  undefined,
  "hello",
  123,
  [],
  [1, 2, 3],
  {},
  { taskId: 123 },
  { taskId: "abc", routingTarget: 123 },
  { taskId: "abc", routingTarget: "SCHEDULE", estimatedDuration: [] },
  { taskId: "abc", routingTarget: "SCHEDULE", recommendedDeadline: new Date() },
  () => {}
];

const taskIdMap = { "abc": "list1", "123": "list1" };

try {
  sandbox.processTaskUpdates(weirdUpdates, taskIdMap, "importer", "todo");
  console.log("PASS - Did not crash");
  console.log(logs);
} catch (e) {
  console.error("FAIL - Crashed", e);
}
