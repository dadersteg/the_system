const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log("Running GID separation tests...");
  
  // Load Code_Config.js and append exports
  const configPath = path.join(__dirname, '../src/Code_Config.js');
  let configContent = fs.readFileSync(configPath, 'utf8');
  configContent += "\nglobalThis.SYSTEM_CONFIG = SYSTEM_CONFIG;\nglobalThis.IS_PMT_ENV = IS_PMT_ENV;";
  
  // Create a minimal mock environment
  const mockProperties = {
    getProperties: () => ({ ENV: 'PRIVATE', GEMINI_API_KEY: 'test-key' })
  };
  const mockPropertiesService = {
    getUserProperties: () => mockProperties,
    getScriptProperties: () => mockProperties
  };
  
  const sandbox = {
    PropertiesService: mockPropertiesService,
    console: console,
    globalThis: {}
  };
  sandbox.globalThis = sandbox;
  
  vm.runInNewContext(configContent, sandbox);
  
  const systemConfig = sandbox.SYSTEM_CONFIG;
  assert.ok(systemConfig, "SYSTEM_CONFIG is defined");
  assert.ok(systemConfig.SHEETS, "SYSTEM_CONFIG.SHEETS is defined");
  
  const taskReviewGid = systemConfig.SHEETS.TASK_REVIEW;
  const completedLogGid = systemConfig.SHEETS.COMPLETED_TASKS_LOG;
  const aliasWhitelistGid = systemConfig.SHEETS.ALIAS_WHITELIST;
  const emailRulesReceiverGid = systemConfig.SHEETS.EMAIL_RULES_RECEIVER;
  
  console.log(`TASK_REVIEW GID: ${taskReviewGid}`);
  console.log(`COMPLETED_TASKS_LOG GID: ${completedLogGid}`);
  console.log(`ALIAS_WHITELIST GID: ${aliasWhitelistGid}`);
  console.log(`EMAIL_RULES_RECEIVER GID: ${emailRulesReceiverGid}`);
  
  // Assert GIDs are separate
  assert.strictEqual(taskReviewGid, "1580572397", "TASK_REVIEW GID should remain 1580572397");
  assert.strictEqual(completedLogGid, "1580572400", "COMPLETED_TASKS_LOG GID should be 1580572400");
  assert.notStrictEqual(taskReviewGid, completedLogGid, "TASK_REVIEW GID and COMPLETED_TASKS_LOG GID must be different!");
  
  assert.strictEqual(aliasWhitelistGid, "1799689202", "ALIAS_WHITELIST GID should remain 1799689202");
  assert.strictEqual(emailRulesReceiverGid, "1799689203", "EMAIL_RULES_RECEIVER GID should be 1799689203");
  assert.notStrictEqual(aliasWhitelistGid, emailRulesReceiverGid, "ALIAS_WHITELIST GID and EMAIL_RULES_RECEIVER GID must be different!");
  
  console.log("✓ GID configuration separation verified successfully.");
}

try {
  runTest();
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
}
