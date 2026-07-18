const fs = require('fs');
const path = require('path');

function testHygiene() {
  let passed = true;

  const codeTasksStr = fs.readFileSync(path.join(__dirname, '../src/Code_Tasks.js'), 'utf8');
  if (codeTasksStr.includes("CELLSION V6.1")) {
    console.error("FAIL: Code_Tasks.js still contains 'CELLSION V6.1'");
    passed = false;
  }
  if (codeTasksStr.includes("26-column export structure")) {
    console.error("FAIL: Code_Tasks.js still contains '26-column export structure'");
    passed = false;
  }

  const codeDashboardStr = fs.readFileSync(path.join(__dirname, '../src/Code_Dashboard.js'), 'utf8');
  if (codeDashboardStr.includes("Wait, let's collect sheets to delete")) {
    console.error("FAIL: Code_Dashboard.js still contains stream-of-consciousness comment");
    passed = false;
  }

  const codeTaskEngineStr = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
  if (codeTaskEngineStr.includes("?key=")) {
    console.error("FAIL: Code_TaskEngine.js still contains '?key='");
    passed = false;
  }
  
  if (codeTaskEngineStr.includes("only runs at 8, 12, 16, 20")) {
    console.error("FAIL: Code_TaskEngine.js still contains 'only runs at 8, 12, 16, 20'");
    passed = false;
  }

  const rootFiles = fs.readdirSync(path.join(__dirname, '../'));
  if (rootFiles.includes('rules.agy') || rootFiles.includes('rules_agy.md')) {
    console.error("FAIL: rules.agy or rules_agy.md still exists in root directory");
    passed = false;
  }
  if (rootFiles.includes('TS - Task Master > 7 Day Roadmap (Private).md') || rootFiles.includes('TS - Task Master > 1 Day Execution Plan (Private).md')) {
    console.error("FAIL: Duplicate roadmap files still exist in root directory");
    passed = false;
  }

  if (passed) {
    console.log("PASS: All T37 hygiene checks passed.");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testHygiene();
