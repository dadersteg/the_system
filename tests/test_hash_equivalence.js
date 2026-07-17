const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Define Utilities for the JS file
const Utilities = {
  DigestAlgorithm: { MD5: 'MD5' },
  computeDigest: (algo, text) => {
    return crypto.createHash('md5').update(text, 'utf8').digest();
  },
  base64Encode: (bytes) => {
    return Buffer.from(bytes).toString('base64');
  }
};

// Load getStandardizedTaskHash function from src/Code_TaskEngine.js
const codeTaskEngine = fs.readFileSync('/Users/daniel/Documents/AGY/the_system/src/Code_TaskEngine.js', 'utf8');

// Use VM to load the function
const vm = require('vm');
const sandbox = { Utilities };
vm.createContext(sandbox);
vm.runInContext(codeTaskEngine, sandbox);
const getStandardizedTaskHash = sandbox.getStandardizedTaskHash;

if (typeof getStandardizedTaskHash !== 'function') {
  console.error("Error: getStandardizedTaskHash is not defined in src/Code_TaskEngine.js");
  process.exit(1);
}

// 5 Complex Test Cases
const testCases = [
  {
    name: "Case 1: Standard task with tags in title and notes, SYS lines, and metadata block",
    title: "[DEADLINE: 2026-07-20] | Do the task",
    notes: "SYS: some system comment\n[DEADLINE: 2026-07-20] | [DURATION: 1h] | [GOAL: Task Goal]\nDA: User comment here\n---SYSTEM_METADATA---\n{\"ai_hash\": \"abc\", \"user_constraint\": \"xyz\"}",
    due: "2026-07-20",
    status: "needsAction",
    stripTitleTags: true
  },
  {
    name: "Case 2: Task with title tags that should NOT be stripped",
    title: "[DEADLINE: 2026-07-20] | Do the task",
    notes: "Some notes\nSYS: system comment",
    due: "2026-07-20",
    status: "needsAction",
    stripTitleTags: false
  },
  {
    name: "Case 3: Multiple whitespaces, newlines, and tabs inside all fields",
    title: "  Do    \t  the   task  ",
    notes: "Line 1\n  \n\t   Line 2",
    due: "  2026-07-20  ",
    status: "  needsAction  ",
    stripTitleTags: true
  },
  {
    name: "Case 4: User comments that contain metadata tags",
    title: "Task title",
    notes: "DA: Do this task [GOAL: Goal 1]",
    due: "2026-07-20",
    status: "needsAction",
    stripTitleTags: true
  },
  {
    name: "Case 5: Status/Due missing or null/undefined, notes containing only system-generated lines",
    title: "Task 5",
    notes: "SYS: system comment 1\n[DEADLINE: 2026-07-20]\nSYS: system comment 2",
    due: null,
    status: undefined,
    stripTitleTags: true
  }
];

// Compute JS Hashes
const jsHashes = testCases.map(tc => {
  return getStandardizedTaskHash(tc.title, tc.notes, tc.due, tc.status, tc.stripTitleTags);
});

// Compute Python Hashes by running the Python helper script
const tempJsonPath = path.join(__dirname, 'temp_test_cases.json');
fs.writeFileSync(tempJsonPath, JSON.stringify(testCases, null, 2));

let pythonHashes;
try {
  const pythonOutput = execSync(`python3 ${path.join(__dirname, 'test_hash_helper.py')} < ${tempJsonPath}`).toString();
  pythonHashes = JSON.parse(pythonOutput);
} catch (e) {
  console.error("Error executing Python helper script:", e.message);
  fs.unlinkSync(tempJsonPath);
  process.exit(1);
}

fs.unlinkSync(tempJsonPath);

console.log("=== HASH EQUIVALENCE UNIT TEST RESULTS ===");
let allPassed = true;
testCases.forEach((tc, idx) => {
  const js = jsHashes[idx];
  const py = pythonHashes[idx];
  const passed = (js === py);
  console.log(`\nTest Case ${idx + 1}: ${tc.name}`);
  console.log(`  JS Hash:     ${js}`);
  console.log(`  Python Hash: ${py}`);
  console.log(`  Result:      ${passed ? "PASS" : "FAIL"}`);
  if (!passed) allPassed = false;
});

console.log("\n-----------------------------------------");
if (allPassed) {
  console.log("SUCCESS: All 5 complex hash test cases are IDENTICAL in JS and Python!");
  process.exit(0);
} else {
  console.error("FAILURE: Hash mismatch detected between JS and Python!");
  process.exit(1);
}
