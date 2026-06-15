const { spawn } = require('child_process');

// Prompt instructions for the daily automated maintenance
const prompt = `Perform daily maintenance on this repository.
1. Scan all modified .js and .py files in the last 24 hours to ensure they have the strict @file, @version, and @changelog headers mandated by jules.md.
2. Scan for unused variables or commented-out legacy code blocks in the src/ directory and remove them.
3. Identify any functions exceeding 100 lines and propose/execute abstractions if it improves readability without altering logic.
4. Enforce strict formatting constraints (e.g., standard indentation, removing trailing whitespaces).`;

const JULES_API_KEY = "***REMOVED***"; // Extracted from local config

const payload = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "jules_create_session",
    arguments: {
      source: "github/dadersteg/the_system",
      title: "Daily Autonomous Maintenance",
      prompt: prompt,
      startingBranch: "main",
      automationMode: "NONE", // Direct commit to main, no PR
      requirePlanApproval: false
    }
  }
};

console.log("Starting Jules MCP Subprocess...");
const mcpProcess = spawn('npx', ['-y', '@fre4x/jules'], {
  env: {
    ...process.env,
    JULES_API_KEY: JULES_API_KEY
  }
});

mcpProcess.stdout.on('data', (data) => {
  const responseStr = data.toString();
  
  // Try parsing JSON lines
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
    } catch(e) {
      // Ignore non-json logs
    }
  }
});

mcpProcess.stderr.on('data', (data) => {
  console.error(`[Jules MCP STDERR]: ${data}`);
});

mcpProcess.on('close', (code) => {
  console.log(`Jules MCP process exited with code ${code}`);
});

// 1. Send initialization payload
const initPayload = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "trigger_jules_cron",
      version: "1.0.0"
    }
  }
};

mcpProcess.stdin.write(JSON.stringify(initPayload) + '\n');

// 2. Wait for initialization, then send initialized notification and the actual tool call
setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }) + '\n');
  
  console.log("Sending jules_create_session request...");
  mcpProcess.stdin.write(JSON.stringify(payload) + '\n');
}, 3000);

// Timeout fallback just in case it hangs
setTimeout(() => {
  console.error("Timeout waiting for Jules to respond. Killing process.");
  mcpProcess.kill();
  process.exit(1);
}, 30000);
