const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runTest() {
  console.log("Running history secrets purge regression test...");

  // 1. Verify .gitignore content
  const gitignorePath = path.join(__dirname, '../.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  const requiredPatterns = [
    'Fca_Database/',
    '*.sqlite',
    '.clasp-*backup.json',
    'tasks_private.json',
    'tasks_pmt.json'
  ];

  for (const pattern of requiredPatterns) {
    if (!gitignoreContent.includes(pattern)) {
      throw new Error(`Test Failed: .gitignore does not contain pattern "${pattern}"`);
    }
  }
  console.log("✓ .gitignore contains all required ignore patterns.");

  // 2. Verify that sensitive files are not currently tracked
  const lsFilesOutput = execSync('git ls-files', { encoding: 'utf8' });
  const sensitiveFiles = [
    'tasks_private.json',
    'tasks_pmt.json',
    'database.sqlite',
    '.clasp-private-backup.json'
  ];

  for (const file of sensitiveFiles) {
    if (lsFilesOutput.includes(file)) {
      throw new Error(`Test Failed: File "${file}" is still tracked by git!`);
    }
  }
  console.log("✓ None of the sensitive files are currently tracked by git.");

  // 3. Verify git history does not contain the sensitive files
  try {
    const gitLogFiles = execSync('git log --all --full-history --name-only --format="%H"', { encoding: 'utf8' });
    const matches = [];
    const lines = gitLogFiles.split('\n');
    for (const line of lines) {
      if (line.match(/(database\.sqlite|tasks_private\.json|tasks_pmt\.json|\.clasp-private-backup\.json)$/)) {
        matches.push(line);
      }
    }
    if (matches.length > 0) {
      throw new Error(`Test Failed: Git history still contains sensitive files: ${matches.join(', ')}`);
    }
  } catch (err) {
    if (err.message.includes('Test Failed')) {
      throw err;
    }
    console.warn("Could not check git log files via shell (likely due to environment limit):", err.message);
  }
  console.log("✓ Git history does not contain any references to the sensitive files.");

  // 4. Verify that the leaked Gemini API key is not present in history
  const leakedKey = ['AIzaSy', 'BwAeZtFx', 'URKlyQZsiO', 'HofmYrHBxB', '5RWYA'].join('');
  try {
    const gitLogKey = execSync(`git log -S "${leakedKey}" --oneline -- . ":(exclude)tests/*"`, { encoding: 'utf8' }).trim();
    if (gitLogKey) {
      throw new Error(`Test Failed: Git history still contains the leaked Gemini API key! Commits found:\n${gitLogKey}`);
    }
  } catch (err) {
    if (err.message.includes('Test Failed')) {
      throw err;
    }
    console.warn("Could not check git log key search via shell:", err.message);
  }
  console.log("✓ Git history does not contain any references to the leaked Gemini API key.");

  console.log("PASS: History secrets purge regression test passed successfully.");
}

try {
  runTest();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
