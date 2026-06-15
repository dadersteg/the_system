const { spawn } = require('child_process');

// Parse CLI arguments to determine task type
const args = process.argv.slice(2);
const taskType = args[0] || '--minor';

let promptPayload = "";
let automationMode = "NONE";
let title = "";

if (taskType === '--ui') {
  title = "Premium Micro-Design Polish (UI)";
  automationMode = "NONE";
  promptPayload = `**TASK: Premium Micro-Design Polish & Autonomous Deploy**
1. Select exactly ONE specific UI element in WebApp_Dashboard.html (e.g., a button's hover state, a card's padding/shadow, a navigation link's active state, or a tab's transition animation).
2. Modernize the selected element using custom desaturated colors, refined typography (Google Fonts), and smooth micro-animations/transitions (using cubic-bezier easing). Avoid plain default colors.
3. Ensure the polished element has a touch target of at least 44px on mobile viewports and scales fluidly.
4. **CRITICAL CONSTRAINT:** Do NOT make sweeping layout changes, restructure the DOM, or modify unrelated CSS rules. Surgical precision only.`;

} else if (taskType === '--major') {
  title = "Systematic Architectural Refactoring (Major)";
  automationMode = "AUTO_CREATE_PR";
  promptPayload = `**TASK: Systematic Architectural Refactoring**
1. Identify high-debt scripts within the repository (prioritizing those handling heavy data parsing or API fetching) or legacy monolithic functions exceeding 100 lines.
2. **Performance:** Convert nested O(n^2) loops into O(n) hash maps where applicable. Batch external API/Apps Script calls to prevent rate limits.
3. **Resilience & Readability:** Standardize variable naming (camelCase for JS, snake_case for Python). Break monolithic functions into smaller, single-responsibility helpers. Add try/catch bounds to external data fetches.
4. **Documentation:** Inject comprehensive JSDoc/Google-style docstrings for EVERY function modified, detailing inputs, outputs, and edge cases. Ensure compliance with jules.md header requirements.
5. Summarize the technical debt cleared and the architectural gains clearly in the resulting Pull Request description.`;

} else { // --minor
  title = "Daily Micro-Stability Check (Backend/Logic)";
  automationMode = "NONE";
  promptPayload = `**TASK: Daily Micro-Stability & Health Check**
1. Select exactly ONE recently modified script or specific logic block.
2. Perform a safe, micro-stability check. Improve its error handling (e.g., adding try/catch bounds), clean up any messy logic, or optimize a single performance bottleneck.
3. Ensure the file contains the strict @file, @version, and @changelog headers mandated by jules.md.
4. Scan for unused variables or commented-out legacy code blocks and remove them.
5. **CRITICAL CONSTRAINT:** Do NOT make sweeping architectural changes or break any existing functionality. Surgical precision only.`;
}

const JULES_API_KEY = "***REMOVED***";

const payload = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "jules_create_session",
    arguments: {
      source: "github/dadersteg/the_system",
      title: title,
      prompt: promptPayload,
      startingBranch: "main",
      automationMode: automationMode,
      requirePlanApproval: false
    }
  }
};

console.log(`Starting Jules MCP Subprocess for ${taskType}...`);
console.log(`Automation Mode: ${automationMode}`);

const mcpProcess = spawn('npx', ['-y', '@fre4x/jules'], {
  env: {
    ...process.env,
    JULES_API_KEY: JULES_API_KEY
  }
});

mcpProcess.stdout.on('data', (data) => {
  const responseStr = data.toString();
  const lines = responseStr.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 1 && parsed.result) {
        console.log("✅ Jules session created successfully!");
        console.log(JSON.stringify(parsed.result, null, 2));
        mcpProcess.kill();
        process.exit(0);
      } else if (parsed.id === 1 && parsed.error) {
        console.error("❌ Failed to create Jules session:");
        console.error(JSON.stringify(parsed.error, null, 2));
        mcpProcess.kill();
        process.exit(1);
      }
    } catch(e) {}
  }
});

mcpProcess.stderr.on('data', (data) => {
  console.error(`[Jules MCP STDERR]: ${data}`);
});

mcpProcess.on('close', (code) => {
  console.log(`Jules MCP process exited with code ${code}`);
});

const initPayload = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "trigger_jules_cron", version: "1.0.0" }
  }
};

mcpProcess.stdin.write(JSON.stringify(initPayload) + '\n');

setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }) + '\n');
  
  console.log("Sending payload...");
  mcpProcess.stdin.write(JSON.stringify(payload) + '\n');
}, 3000);

setTimeout(() => {
  console.error("Timeout waiting for Jules to respond. Killing process.");
  mcpProcess.kill();
  process.exit(1);
}, 30000);
