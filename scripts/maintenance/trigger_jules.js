const { spawn } = require('child_process');

// Parse CLI arguments to determine task type
const args = process.argv.slice(2);
const taskType = args[0] || '--micro-backend';

let promptPayload = "";
let automationMode = "AUTO_CREATE_PR";
let title = "";

if (taskType === '--micro-ui') {
  title = "Premium Micro-Design Polish (UI)";
  promptPayload = `**TASK: Premium Micro-Design Polish**
1. Select exactly ONE specific UI element in WebApp_Dashboard.html (e.g., a button's hover state, a card's padding/shadow, a navigation link's active state, or a tab's transition animation).
2. Modernize the selected element using custom desaturated colors, refined typography (Google Fonts), and smooth micro-animations/transitions (using cubic-bezier easing). Avoid plain default colors.
3. Ensure the polished element has a touch target of at least 44px on mobile viewports and scales fluidly.`;

} else if (taskType === '--micro-cleanup') {
  title = "Codebase Cleanup & Documentation";
  promptPayload = `**TASK: Codebase Cleanup & Documentation**
1. Select exactly ONE recently modified script or logic block.
2. Inject comprehensive JSDoc/Google-style docstrings for the functions. Ensure compliance with jules.md.
3. Scan for and strictly remove unused variables, orphaned imports, or commented-out legacy code blocks.
4. Standardize variable naming (camelCase for JS, snake_case for Python).`;

} else if (taskType === '--major') {
  title = "Systematic Architectural Refactoring (Major)";
  promptPayload = `**TASK: Systematic Architectural Refactoring**
1. Identify high-debt scripts within the repository or legacy monolithic functions exceeding 100 lines (including core logic like executeTriageEngine).
2. **Performance:** Convert nested O(n^2) loops into O(n) hash maps where applicable. Batch external API/Apps Script calls to prevent rate limits.
3. **Resilience & Readability:** Standardize variable naming. Break monolithic functions into smaller helpers. Add try/catch bounds.
4. **CRITICAL SAFETY & DATA PARITY:** When refactoring core logic or photo syncs, you MUST NOT drop data columns or ignore payload fields. Ensure 100% data parity before and after optimization.
5. **OPT OUT CAUSE:** If the codebase is already highly optimized and you cannot find any legitimate, meaningful architectural improvements to make, you must explicitly opt out. Do not invent problems to solve. If you opt out, make zero changes and state 'No major refactoring needed at this time.'
6. Summarize the technical debt cleared and the architectural gains clearly in the resulting Pull Request description.`;

} else { // --micro-backend
  title = "Daily Micro-Stability Check (Backend/Logic)";
  promptPayload = `**TASK: Daily Micro-Stability & Health Check**
1. Select exactly ONE recently modified script or specific logic block.
2. Perform a safe, micro-stability check. Improve its error handling, clean up messy logic, or optimize a single performance bottleneck.
3. Do NOT make sweeping architectural changes or break any existing functionality. Surgical precision only.`;
}

const JULES_API_KEY = process.env.JULES_API_KEY || "";

console.log(`Starting Jules Native Fetch for ${taskType}...`);
console.log(`Automation Mode: ${automationMode}`);

async function triggerJules() {
  try {
    const response = await fetch("https://jules.googleapis.com/v1alpha/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": JULES_API_KEY
      },
      body: JSON.stringify({
        title: title,
        prompt: promptPayload,
        sourceContext: {
          source: "sources/github/dadersteg/the_system",
          githubRepoContext: {
            startingBranch: "main"
          }
        },
        automationMode: automationMode,
        requirePlanApproval: false
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("❌ Failed to create Jules session:");
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✅ Jules session created successfully!");
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);

  } catch (err) {
    console.error("❌ Network or Execution Error:", err);
    process.exit(1);
  }
}

triggerJules();
