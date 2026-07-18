const fs = require('fs');

function testLogic(filePath, functionContextExtractor) {
    const code = fs.readFileSync(filePath, 'utf8');
    const snippet = functionContextExtractor(code);
    
    // We simulate a successful fetch that returned { candidates: [] }
    const wrapper = `
        let response = {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ candidates: [] })
        };
        let success = true;
        let attempt = 1;
        let maxRetries = 3;
        
        // Mock functions that might be called inside the snippet
        const Utilities = { sleep: () => {} };
        const console = { error: () => {}, log: () => {}, warn: () => {} };
        
        ${snippet}
    `;

    try {
        eval(wrapper);
        return true;
    } catch (e) {
        if (e instanceof TypeError && e.message.includes("undefined")) {
            return false;
        }
        if (e.message.includes("Empty candidates returned")) {
            return true;
        }
        throw e; // Unrelated error
    }
}

function runTests() {
    console.log("Running T18 Regression Test: Empty Candidates Array");
    let allPassed = true;

    // Code_TheClerk_Email.js
    const emailPassed = testLogic('src/Code_TheClerk_Email.js', (code) => {
        const start = code.indexOf('const json = JSON.parse(response.getContentText());');
        const end = code.indexOf('let cleanText = rawText.replace');
        if (start === -1) {
            // Check if it's the old version
            const oldStart = code.indexOf('const rawText = JSON.parse(response.getContentText())');
            if (oldStart !== -1) return code.substring(oldStart, code.indexOf('let cleanText', oldStart));
        }
        return code.substring(start, end);
    });
    console.log(`Code_TheClerk_Email.js: ${emailPassed ? 'PASS' : 'FAIL (Crashed)'}`);
    if (!emailPassed) allPassed = false;

    if (allPassed) {
        console.log("All guards are in place. Tests PASSED.");
        process.exit(0);
    } else {
        console.error("Missing guards found. Tests FAILED.");
        process.exit(1);
    }
}

runTests();
