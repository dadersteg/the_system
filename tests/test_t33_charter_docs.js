const fs = require('fs');
const path = require('path');

function runTest() {
  console.log("Running T33 charter docs reconciliation test...");

  const rootProjectMd = path.join(__dirname, '../PROJECT.md');
  const docsProjectMd = path.join(__dirname, '../docs/PROJECT.md');
  const readmeMd = path.join(__dirname, '../README.md');

  let failed = false;

  // 1. Verify PROJECT.md is deleted
  if (fs.existsSync(rootProjectMd)) {
    console.error("Test Failed: root PROJECT.md still exists.");
    failed = true;
  } else {
    console.log("✓ root PROJECT.md is removed.");
  }

  // 2. Verify docs/PROJECT.md is deleted
  if (fs.existsSync(docsProjectMd)) {
    console.error("Test Failed: docs/PROJECT.md still exists.");
    failed = true;
  } else {
    console.log("✓ docs/PROJECT.md is removed.");
  }

  // 3. Verify README.md exists (single source of truth)
  if (!fs.existsSync(readmeMd)) {
    console.error("Test Failed: README.md is missing!");
    failed = true;
  } else {
    console.log("✓ README.md exists.");
  }

  if (failed) {
    throw new Error("Test failed. Multiple charter documents exist, causing I9/D-series conflict.");
  }

  console.log("PASS: Project charter documents reconciled successfully.");
}

try {
  runTest();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
