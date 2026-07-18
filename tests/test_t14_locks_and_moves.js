const fs = require('fs');

function checkFileForRegex(filePath, regexesToFind, regexesToAvoid) {
  const content = fs.readFileSync(filePath, 'utf8');
  let passed = true;
  for (const r of regexesToFind) {
    if (!r.test(content)) {
      console.error(`Missing expected pattern ${r} in ${filePath}`);
      passed = false;
    }
  }
  for (const r of regexesToAvoid) {
    if (r.test(content)) {
      console.error(`Found forbidden pattern ${r} in ${filePath}`);
      passed = false;
    }
  }
  return passed;
}

console.log("Running T14 checks...");

let allPassed = true;

// 1. Task Engine
let passed = checkFileForRegex('./src/Code_TaskEngine.js', [
  /function runTaskMasterEngine\(\) {[\s\S]*?LockService\.getScriptLock\(\)/,
  /function hourlyReviewTriggerWrapper\(\) {[\s\S]*?LockService\.getScriptLock\(\)/,
  // Verify insert before delete patterns
  /Tasks\.Tasks\.insert[\s\S]*?if \((createdTask|movedParent|matchedMilestone).*?\.id\)/
], [
  /function hourlyReviewTriggerWrapper\(\) {[\s\S]*?runTaskMasterEngine\(\)/
]);
if (!passed) allPassed = false;

// 2. 7-Day Review
passed = checkFileForRegex('./src/Code_7DayReview.js', [
  /function weeklyReviewTriggerWrapper\(\) {[\s\S]*?LockService\.getScriptLock\(\)/
], [
  /function weeklyReviewTriggerWrapper\(\) {[\s\S]*?runTaskMasterEngine\(\)/
]);
if (!passed) allPassed = false;

// 3. 28-Day Review
passed = checkFileForRegex('./src/Code_28DayReview.js', [
  /function monthlyReviewTriggerWrapper\(\) {[\s\S]*?LockService\.getScriptLock\(\)/
], [
  /function monthlyReviewTriggerWrapper\(\) {[\s\S]*?runTaskMasterEngine\(\)/
]);
if (!passed) allPassed = false;

// 4. 84-Day Review
passed = checkFileForRegex('./src/Code_84DayReview.js', [
  /function quarterlyReviewTriggerWrapper\(\) {[\s\S]*?LockService\.getScriptLock\(\)/
], [
  /function quarterlyReviewTriggerWrapper\(\) {[\s\S]*?runTaskMasterEngine\(\)/
]);
if (!passed) allPassed = false;

if (allPassed) {
  console.log("All T14 tests passed!");
  process.exit(0);
} else {
  console.error("T14 tests failed!");
  process.exit(1);
}
