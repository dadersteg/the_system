const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file
let API_KEY = process.env.JULES_API_KEY;
if (!API_KEY) {
  try {
    const configContent = fs.readFileSync('/Users/daniel/.gemini/antigravity/mcp_config.json', 'utf-8');
    const config = JSON.parse(configContent);
    API_KEY = config.mcpServers.jules.env.JULES_API_KEY;
  } catch (e) {
    console.warn("Unable to read .env for JULES_API_KEY. Trying process.env.");
  }
}

if (!API_KEY) {
  console.error("CRITICAL: JULES_API_KEY is not defined.");
  process.exit(1);
}

const API_BASE = "https://jules.googleapis.com";
const REPOSITORY = "sources/github/dadersteg/the_system";

const sessions = [
  {
    title: "Codebase Cleanup & Documentation",
    prompt: "Perform a routine codebase cleanup and documentation sweep. Ensure JSDoc standards are met, remove unused variables, and standardize file headers."
  },
  {
    title: "Premium Micro-Design Polish (UI)",
    prompt: "Review UI/HTML/CSS elements for modern, premium micro-design polish, applying fluid transitions and high-quality color palettes where appropriate."
  },
  {
    title: "Daily Micro-Stability Check (Backend/Logic)",
    prompt: "Check the backend logic, error handling, and stability boundaries (try/catch) for robustness. Optimize single-function logic for stability."
  }
];

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Goog-Api-Key": API_KEY
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          resolve({ error: true, status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createSession(sessionDef) {
  const body = {
    prompt: sessionDef.prompt,
    title: sessionDef.title,
    sourceContext: {
      source: REPOSITORY,
      githubRepoContext: {
        startingBranch: "main"
      }
    },
    automationMode: "AUTO_CREATE_PR",
    requirePlanApproval: false
  };
  return await request("POST", "/v1alpha/sessions", body);
}

async function pruneOldSessions() {
  console.log("Fetching Jules sessions to prune...");
  let pageToken = "";
  let pendingSessions = [];
  
  do {
    const res = await request("GET", `/v1alpha/sessions?pageSize=50${pageToken ? '&pageToken='+pageToken : ''}`);
    if (res.error) {
      console.error("Failed to fetch sessions for pruning:", res);
      return;
    }
    
    const sessions = res.sessions || [];
    for (const s of sessions) {
      pendingSessions.push(s.name);
    }
    
    pageToken = res.nextPageToken;
  } while (pageToken);
  
  console.log(`Found ${pendingSessions.length} existing sessions to wipe clean.`);
  
  for (const name of pendingSessions) {
    console.log(`Attempting to prune ${name}...`);
    let cancelRes = await request("POST", `/v1alpha/${name}:cancel`);
    if (cancelRes.error) {
      let delRes = await request("DELETE", `/v1alpha/${name}`);
      if (delRes.error) {
        console.log(`  DELETE failed with ${delRes.status}: ${delRes.data}`);
      }
    }
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Initiating Jules Weekly Automation...`);
  
  await pruneOldSessions();
  
  for (const session of sessions) {
    console.log(`Creating session: "${session.title}"`);
    const res = await createSession(session);
    if (res.error) {
      console.error(`Failed to create session "${session.title}":`, res.status, res.data);
    } else {
      console.log(`Successfully created session ID: ${res.name}`);
    }
  }
  
  console.log(`[${new Date().toISOString()}] Jules Weekly Automation completed.`);
}

main().catch(console.error);
