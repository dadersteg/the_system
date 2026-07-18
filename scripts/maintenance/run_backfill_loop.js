const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '.jules_backfill_state.json');
const REPO_DIR = '/Users/daniel/Developer/second_brain_db';
const SYSTEM_DIR = '/Users/daniel/Documents/AGY/the_system';

function getState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { status: 'IDLE' };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const state = getState();

console.log(`[Backfill Loop] Current state: ${state.status}`);

if (state.status === 'WAITING_FOR_PR') {
  console.log("[Backfill Loop] Checking for open Pull Requests from Jules...");
  try {
    const prsJson = execSync('gh pr list --state open --json number,title', { cwd: REPO_DIR, encoding: 'utf8' });
    const prs = JSON.parse(prsJson);
    
    let mergedAny = false;
    for (const pr of prs) {
      // Check if PR is from Jules
      if (pr.title.toLowerCase().includes("backfill") || pr.title.toLowerCase().includes("historical")) {
        console.log(`[Backfill Loop] Found Jules PR #${pr.number}: ${pr.title}`);
        
        try {
          console.log(`[Backfill Loop] Auto-merging PR #${pr.number} is DISABLED during remediation. Manual approval is required.`);
          // execSync(`gh pr merge ${pr.number} --squash --admin`, { cwd: REPO_DIR, stdio: 'inherit' });
          mergedAny = false;
          break; // Stop after finding one to prevent duplicate processing
        } catch (mergeErr) {
          console.error(`[Backfill Loop] Failed to merge PR #${pr.number}. It likely has conflicts. Closing it...`);
          try {
            execSync(`gh pr close ${pr.number}`, { cwd: REPO_DIR, stdio: 'inherit' });
          } catch (closeErr) {
            console.error(`[Backfill Loop] Failed to close PR #${pr.number}:`, closeErr.message);
          }
        }
      }
    }

    if (mergedAny) {
      console.log("[Backfill Loop] PR successfully merged! Pulling latest main...");
      execSync('git pull origin main', { cwd: REPO_DIR, stdio: 'inherit' });
      state.status = 'IDLE';
      saveState(state);
      
      // Also close any remaining duplicate PRs just to be clean
      for (const pr of prs) {
        if (!mergedAny && (pr.title.toLowerCase().includes("backfill") || pr.title.toLowerCase().includes("historical"))) {
             try { execSync(`gh pr close ${pr.number}`, { cwd: REPO_DIR }); } catch(e) {}
        }
      }
      
      console.log("[Backfill Loop] State reset to IDLE. The next cron run will trigger the next batch.");
    } else {
      console.log("[Backfill Loop] No open Jules backfill PRs found yet. Still waiting for Jules to finish synthesis...");
      process.exit(0);
    }
  } catch (err) {
    console.error("[Backfill Loop] Error checking/merging PRs:", err.message);
    process.exit(1);
  }
}

if (state.status === 'IDLE') {
  console.log("[Backfill Loop] Triggering the next batch via trigger_jules.js...");
  try {
    execSync('node scripts/maintenance/trigger_jules.js --chronicle-backfill', { 
      stdio: 'inherit',
      cwd: SYSTEM_DIR
    });
    
    // If it succeeds, update state
    state.status = 'WAITING_FOR_PR';
    saveState(state);
    console.log("[Backfill Loop] Successfully triggered Jules. State is now WAITING_FOR_PR.");
  } catch (err) {
    console.error("[Backfill Loop] Failed to trigger Jules batch:", err.message);
    // If it fails (e.g. 404 or missing creds), remain IDLE so it tries again next time
    process.exit(1);
  }
}
