const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log("Running Markdown Backup Mapping test...");

  let updatedContent = "";
  let createdContent = "";

  const Drive = {
    Files: {
      update: (metadata, fileId, blob) => {
        updatedContent = blob.getDataAsString();
      },
      create: (resource, blob) => {
        createdContent = blob.getDataAsString();
        return { id: 'new-file-id' };
      }
    }
  };

  const Utilities = {
    newBlob: (content, type, name) => ({
      getDataAsString: () => content
    })
  };

  const SYSTEM_CONFIG = {
    ROOTS: { WORKSPACE_FOLDER_ID: 'workspace-id' },
    GENERATED_OUTPUTS: { TASKS_EXPORT: null }, // Force create for test
    SHEETS: { TASK_REVIEW: '123' }
  };

  const sandbox = {
    SYSTEM_CONFIG,
    Drive,
    Utilities,
    console: console,
    globalThis: {},
    IS_PMT_ENV: false,
    parseTaskNotes: (notes) => ({ cleanNotes: notes || '' })
  };
  sandbox.globalThis = sandbox;

  const coreCodePath = path.join(__dirname, '../src/Code_SystemCore.js');
  let coreCode = fs.readFileSync(coreCodePath, 'utf8');

  // Load Code_Tasks.js
  const tasksCodePath = path.join(__dirname, '../src/Code_Tasks.js');
  let tasksCode = fs.readFileSync(tasksCodePath, 'utf8');

  tasksCode = coreCode + "\n" + tasksCode;
  
  // Inject helper export
  tasksCode += `\n
  globalThis.getExportHeaders = getExportHeaders;
  globalThis.exportTasksToMarkdownDrive = exportTasksToMarkdownDrive;
  `;

  vm.runInNewContext(tasksCode, sandbox);

  // Create a mock row using the proper headers format
  const headers = sandbox.getExportHeaders();
  const row = Array(headers.length).fill("");
  
  row[headers.indexOf("Task List")] = "My List";
  row[headers.indexOf("Task Title")] = "My Task";
  row[headers.indexOf("Notes")] = "Some notes here";
  row[headers.indexOf("Status")] = "completed";
  row[headers.indexOf("Due Date")] = "2026-10-31";

  sandbox.exportTasksToMarkdownDrive([row]);

  const output = createdContent;
  
  console.log("Output generated:\n" + output);
  
  assert.ok(output.includes("- [x] **My Task**"), "Status should be checked and title should be My Task");
  assert.ok(output.includes("(Due: 2026-10-31)"), "Due date should be 2026-10-31");
  assert.ok(output.includes("Notes:** Some notes here"), "Notes should be correctly mapped");
  
  console.log("✓ Markdown backup mapping fixed!");
}

try {
  runTest();
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
}
