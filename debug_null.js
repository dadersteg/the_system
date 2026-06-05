const fs = require('fs');
const vm = require('vm');
const sandbox = {
  console: {
    log: (...args) => console.log('LOG:', ...args),
    warn: (...args) => console.log('WARN:', ...args),
    error: (...args) => console.log('ERROR:', ...args)
  },
  Tasks: {
    Tasks: {
      get: () => { throw new Error("Boom"); }
    }
  },
  Utilities: { sleep: () => {} },
  JSON: JSON
};
vm.createContext(sandbox);
const code = `
  const updates = [{ taskId: '1', routingTarget: 'SCHEDULE' }, null];
  const taskIdMap = { '1': 'list1' };
  updates.forEach(u => {
    if (!u || typeof u !== 'object') {
       console.warn("Invalid task update object: ", JSON.stringify(u));
       return;
    }
    try {
      if (typeof u.taskId !== 'string') return;
      const listId = taskIdMap[u.taskId];
      const task = Tasks.Tasks.get(listId, u.taskId);
    } catch (e) {
      console.error("Failed to update task: " + u.taskId, e.message);
    }
  });
`;
vm.runInContext(code, sandbox);
