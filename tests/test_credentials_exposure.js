const fs = require('fs');
const path = require('path');

function runTest() {
  console.log("Running credentials exposure test...");

  // 1. Verify scripts/utils/test_prompt3.py doesn't have the hardcoded key
  const scriptPath = path.join(__dirname, '../scripts/utils/test_prompt3.py');
  const content = fs.readFileSync(scriptPath, 'utf8');
  
  if (content.includes('REDACTED_GEMINI_API_KEY') || content.match(/['"]AIzaSy[A-Za-z0-9_-]{33}['"]/)) {
    throw new Error("Test Failed: Hardcoded Gemini API key found in test_prompt3.py!");
  }
  console.log("✓ No hardcoded Gemini API key in test_prompt3.py.");

  console.log("PASS: Credentials exposure test passed successfully.");
}

try {
  runTest();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
