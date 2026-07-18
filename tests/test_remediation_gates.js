const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTest() {
  console.log("Running remediation gates test...");

  // 1. Verify deploy.yml does not trigger on push
  const deployYamlPath = path.join(__dirname, '../.github/workflows/deploy.yml');
  const deployYaml = fs.readFileSync(deployYamlPath, 'utf8');
  if (deployYaml.match(/\n\s*push:/)) {
    throw new Error("Test Failed: deploy.yml still triggers on push!");
  }
  console.log("✓ deploy.yml push trigger disabled.");

  // 2. Verify run_backfill_loop.js auto-merge is commented out
  const backfillPath = path.join(__dirname, '../scripts/maintenance/run_backfill_loop.js');
  const backfillContent = fs.readFileSync(backfillPath, 'utf8');
  if (!backfillContent.includes('// execSync(`gh pr merge') && !backfillContent.includes('//execSync(`gh pr merge')) {
    throw new Error("Test Failed: run_backfill_loop.js auto-merge command is not commented out!");
  }
  console.log("✓ run_backfill_loop.js auto-merge command commented out.");

  console.log("PASS: Remediation gates verified successfully.");
}

try {
  runTest();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
