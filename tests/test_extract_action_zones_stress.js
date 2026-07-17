const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load extractActionZones from the source file Code_TheClerk_Drive.js
const code = fs.readFileSync(path.join(__dirname, '../src/Code_TheClerk_Drive.js'), 'utf8');

const SYSTEM_CONFIG = {
  SECRETS: {
    GEMINI_API_KEY: 'mock-key',
    GEMINI_MODEL_FLASH_LITE: 'mock-model'
  },
  ROOTS: {
    MASTER_SHEET_ID: 'mock-sheet',
    DRIVE_RULES_SHEET_ID: 'mock-rules'
  },
  SHEETS: {
    DRIVE_LOG: 'mock-log',
    DRIVE_SESSION_LOG: 'mock-session',
    DRIVE_FILENAME_RULES: 'mock-filename',
    DRIVE_FOLDER_RULES: 'mock-folder'
  },
  DOCS: {
    CLERK_DRIVE_INSTRUCTIONS: 'mock-instructions',
    TAXONOMY_JSON_ID: 'mock-taxonomy',
    MASTER_ASSET_NAMING_PROTOCOL: 'mock-protocol'
  },
  DRIVE_FOLDERS: {
    STND_SOURCES: 'mock-sources',
    STND_DEST: 'mock-dest',
    REVIEW: 'mock-review'
  }
};

const MimeType = {
  GOOGLE_DOCS: 'application/vnd.google-apps.document',
  GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet'
};

const sandbox = { 
  console, 
  SYSTEM_CONFIG,
  MimeType
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const extractActionZones = sandbox.extractActionZones;

console.log("Starting Empirical Stress Tests for extractActionZones...");

const results = [];

function test(name, input, expectedFn) {
    let output;
    let error = null;
    try {
        output = extractActionZones(input);
    } catch (e) {
        error = e;
        output = `THREW ERROR: ${e.name}: ${e.message}`;
    }
    const passed = expectedFn(output, error);
    results.push({ name, input: String(input).substring(0, 100), output, passed });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
    console.log(`  Input (truncated): ${JSON.stringify(String(input).substring(0, 150))}`);
    console.log(`  Output: ${JSON.stringify(output)}`);
    console.log(`  ---`);
}

// 1. Extreme Inputs: Empty/Null/Undefined/Non-strings
test("Null input", null, (out) => out === "None");
test("Undefined input", undefined, (out) => out === "None");
test("Number input", 12345, (out) => out === "None");
test("Boolean input", true, (out) => out === "None");
test("Empty string", "", (out) => out === "None");
test("Whitespace only", "  \n  \n  ", (out) => out === "None");

// 2. Huge strings
const hugeSingleLine = "a".repeat(100000);
test("Huge single line (no headers)", hugeSingleLine, (out) => out === "None");

const hugeSingleLineWithHeader = "a".repeat(50000) + "\nNext steps\n" + "b".repeat(50000);
test("Huge text with valid header", hugeSingleLineWithHeader, (out) => {
    return out.startsWith("--- NEXT STEPS ---") && out.includes("b".repeat(50000));
});

// 3. Weird Unicode and Bullets
test("Non-standard bullet formats", 
`Next Steps
✓ First task
● Second task
★ Third task
- [ ] Checklist task`, (out) => {
    return out.includes("✓ First task") && out.includes("● Second task") && out.includes("★ Third task") && out.includes("- [ ] Checklist task");
});

test("Unicode RTL characters and non-breaking spaces", 
`Next Steps
Arabic task \u200F\u0645\u0647\u0645\u0629
Non-breaking\u00A0space\u00A0task`, (out) => {
    return out.includes("Arabic task") && out.includes("Non-breaking\u00A0space\u00A0task");
});

// 4. Mismatched Braces & Markdown Formatting on Headers
test("Markdown bold target header", 
`**Next Steps**
- task 1`, (out) => {
    // clean should strip "**" because normalizeHeader replaces non-letters with spaces
    // "**next steps**" -> "  next steps  " -> clean: "next steps" (length 10, words <= 4)
    // Should successfully match!
    return out.includes("--- **NEXT STEPS** ---") && out.includes("- task 1");
});

test("Target header in brackets/braces", 
`[Decisions]
- dec 1`, (out) => {
    // "[decisions]" -> " decisions " -> clean: "decisions"
    // Should match!
    return out.includes("--- [DECISIONS] ---") && out.includes("- dec 1");
});

test("Target header in mismatched braces", 
`{Next Steps)
- task 1`, (out) => {
    return out.includes("--- {NEXT STEPS) ---") && out.includes("- task 1");
});

// 5. Target Headers mixed into sentences
test("Header prefix in a long sentence (length < 50)",
`Next steps for the deployment tomorrow
- Deploy build`, (out) => {
    // Line: "Next steps for the deployment tomorrow" (length 38)
    // clean: "next steps for the deployment tomorrow" (length 38, split length = 6 words)
    // Wait! Length 38 is NOT < 35, and words (6) is NOT <= 4.
    // So the short header check fails.
    // But does fallback match?
    // fallback: if (!isTargetHeader && !inTargetSection) { isTargetHeader = clean.startsWith("next steps ") ... }
    // Since clean starts with "next steps ", isTargetHeader becomes true!
    // Since line length (38) is < 50, it pushes "--- NEXT STEPS FOR THE DEPLOYMENT TOMORROW ---" and continues.
    // So it should successfully extract this!
    return out.includes("--- NEXT STEPS FOR THE DEPLOYMENT TOMORROW ---") && out.includes("- Deploy build");
});

test("Header prefix in a long sentence (length >= 50)",
`Next steps to complete the API documentation migration
- Finish docs`, (out) => {
    // Line length is 54 (>= 50).
    // isTargetHeader matches via fallback because it starts with "next steps ".
    // Since line.length >= 50, it pushes "--- NEXT STEPS ---" but DOES NOT CONTINUE!
    // This is the bug where it double-captures the header line because there is no continue inside the else branch!
    // Let's verify that the output does NOT contain the header line itself as a captured item.
    const expectedHeader = "--- NEXT STEPS ---";
    const expectedLine = "Next steps to complete the API documentation migration";
    return out.includes(expectedHeader) && !out.includes(expectedLine) && out.includes("- Finish docs");
});

test("Header mixed in middle of sentence (length < 50)",
`Our decisions and next steps are critical.
- task 1`, (out) => {
    // Line: "Our decisions and next steps are critical." has no colon, so it should not trigger entry.
    return out === "None";
});

test("Exit header in middle of sentence (e.g. read agenda, write notes)",
`Next steps
- Update the discussion notes after the call
- Review meeting agenda`, (out) => {
    // Let's check:
    // Line: "Update the discussion notes after the call"
    // clean: "update the discussion notes after the call" (length 42, >= 35) -> no exit header check.
    // Line: "Review meeting agenda"
    // clean: "review meeting agenda" (length 21, < 35, split count: 3)
    // Does clean ("review meeting agenda") match exitHeaders?
    // h = "agenda".
    // does clean === "meeting " + h?
    // "review meeting agenda" === "meeting agenda" -> false.
    // So "Review meeting agenda" does not trigger exit header.
    // Let's see if both tasks are present.
    return out.includes("- Update the discussion notes after the call") && out.includes("- Review meeting agenda");
});

test("Exit header matching sub-bullet",
`Next steps
- Discussion notes`, (out) => {
    // Line: "- Discussion notes" starts with list bullet and doesn't have colon/bold/etc, so it should not exit.
    return out.includes("- Discussion notes");
});

test("Middle-of-sentence trigger (length >= 50)",
`We will draft the timeline and decisions for the project.
- Task 1`, (out) => {
    // Line has no colon, so it should not trigger entry.
    return out === "None";
});

test("Short inline trigger (length < 50)",
`Please list decisions and actions.
- Task A`, (out) => {
    // Line has no colon, so it should not trigger entry.
    return out === "None";
});

test("Tricky non-header containing exit words",
`Next steps
- Write the summary
- Check attendees list
- Finish notes`, (out) => {
    return out.includes("- Write the summary") && out.includes("- Check attendees list") && out.includes("- Finish notes");
});

test("Premature exit via meeting summary line",
`Next steps
- Make sure meeting summary is shared with the board.
- Send invoice.`, (out) => {
    return out.includes("- Make sure meeting summary is shared with the board.") && out.includes("- Send invoice.");
});

test("Premature exit via short meeting summary bullet",
`Next steps
- Meeting summary
- Send invoice.`, (out) => {
    // "- Meeting summary" is a list bullet line and doesn't have colon/bold/etc, so it should not exit.
    return out.includes("- Meeting summary") && out.includes("- Send invoice.");
});


console.log("\nSummary of results:");
let failedCount = 0;
results.forEach(r => {
    if (!r.passed) {
        failedCount++;
        console.log(`❌ ${r.name}`);
    } else {
        console.log(`✅ ${r.name}`);
    }
});

console.log(`\nFailed tests: ${failedCount} / ${results.length}`);
process.exit(failedCount > 0 ? 1 : 0);
