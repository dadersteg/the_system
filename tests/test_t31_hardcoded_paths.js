const fs = require('fs');
const path = require('path');

const targetFiles = [
    'ecosystem.config.js',
    'src/ingestion/google_auth.js',
    'src/ingestion/monitor.js',
    'src/ingestion/telegram_bridge.py',
    'tests/test_hash_equivalence.js',
    'tests/verify_label_alignment.py'
];

let failed = false;

for (const relPath of targetFiles) {
    const fullPath = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${relPath}`);
        failed = true;
        continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('/Users/daniel/')) {
        console.error(`ERROR: Hardcoded path "/Users/daniel/" found in ${relPath}`);
        failed = true;
    }
}

if (failed) {
    console.error('Test failed: Hardcoded paths detected. Ensure all paths are relative or use env vars.');
    process.exit(1);
} else {
    console.log('Test passed: No hardcoded paths found.');
    process.exit(0);
}
