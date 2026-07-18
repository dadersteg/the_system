const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  const srcDir = path.join(__dirname, '../src');
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
  
  const sandbox = {
    console: console,
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: function(funcName) {
        this.lastFunc = funcName;
        return this;
      },
      timeBased: function() { return this; },
      everyMinutes: function() { return this; },
      everyHours: function() { return this; },
      everyDays: function() { return this; },
      atHour: function() { return this; },
      create: function() {
        if (!sandbox[this.lastFunc]) {
           sandbox.registeredMissingFunctions.push(this.lastFunc);
        }
      }
    },
    SYSTEM_CONFIG: { ROOTS: {} },
    IS_PMT_ENV: false,
    registeredMissingFunctions: []
  };

  vm.createContext(sandbox);

  // Load all JS files into the sandbox
  for (const file of files) {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    try {
      vm.runInContext(code, sandbox);
    } catch (e) {
      // Ignore execution errors during load, we just want function definitions
    }
  }

  // Run setupSystemTriggers
  if (typeof sandbox.setupSystemTriggers === 'function') {
    sandbox.setupSystemTriggers();
  } else {
    console.error("setupSystemTriggers not found");
    process.exit(1);
  }

  if (sandbox.registeredMissingFunctions.length > 0) {
    console.error("FAIL: The following triggers are registered but the functions do not exist:");
    console.error(sandbox.registeredMissingFunctions.join(", "));
    process.exit(1);
  }

  console.log("PASS: All registered triggers point to existing functions.");
  process.exit(0);
}

runTest();
