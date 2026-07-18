const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock Data
global.SYSTEM_CONFIG = {
  SECRETS: { GEMINI_API_KEY: 'test-key' }
};

let fetchCount = 0;
let fetchMockResponse = {
  getResponseCode: () => 200,
  getContentText: () => JSON.stringify({
    candidates: [{
      content: { parts: [{ text: "```json\n{ \"status\": \"SUCCESS\", \"trailing\": true, }\n```" }] }
    }]
  })
};

global.UrlFetchApp = {
  fetch: (url, options) => {
    fetchCount++;
    return fetchMockResponse;
  }
};
global.Utilities = { sleep: () => {} };
global.console = console;

const srcContent = fs.readFileSync(path.join(__dirname, '../src/Code_SystemCore.js'), 'utf8');
vm.runInThisContext(srcContent);

function runTest() {
  console.log("Running T26 callGemini consolidation test...");
  
  // 1. Test markdown strip + trailing comma repair
  const result = callGemini("test prompt", "gemini-model", "test instruction", null);
  
  if (result.error) {
    console.error("Test failed: callGemini returned error:", result.error);
    process.exit(1);
  }
  if (result.status !== "SUCCESS" || result.trailing !== true) {
    console.error("Test failed: JSON not parsed correctly. Got:", result);
    process.exit(1);
  }
  
  console.log("Test passed: callGemini successfully parsed markdown-fenced JSON with trailing comma.");
}

runTest();
