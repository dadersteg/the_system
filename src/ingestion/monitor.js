/**
 * 🕵️‍♂️ Ingestion Bridge System Monitor
 * Checks the status of whatsapp-bridge, telegram-bridge, and messenger-bridge.
 * Sends email alerts via the Ingestion Bridge Apps Script webhook when a process goes offline.
 *
 * Runs continuously in a PM2 loop (e.g. every 15 minutes).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./google_auth');

// ─── Configuration ──────────────────────────────────────────────────────────
const GMAIL_USER = process.env.GMAIL_USER || 'adersteg.daniel@gmail.com';
const WEBAPP_URL = process.env.WEBAPP_URL;
const STATE_FILE = path.join(__dirname, 'monitor_state.json');
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

const MONITORED_PROCESSES = [
    'beeper-bridge',
    'telegram-bridge'
];

if (!WEBAPP_URL) {
    console.error('❌ WEBAPP_URL not set in .env. Exiting.');
    process.exit(1);
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (err) {
        console.error('Failed to load state file:', err.message);
    }
    return {};
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.error('Failed to save state file:', err.message);
    }
}

async function sendAlertEmail(subject, body) {
    console.log(`Sending alert: "${subject}"...`);
    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: subject,
        body: body,
        name: "System Monitor",
        b64: false
    };

    try {
        const accessToken = await getAccessToken();
        const response = await fetch(WEBAPP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            console.log(`Alert sent successfully.`);
        } else {
            console.error(`Failed to send alert via webhook:`, result.error);
        }
    } catch (error) {
        console.error(`Failed to trigger alert webhook:`, error.message);
    }
}

function getPM2Processes() {
    try {
        const output = execSync('pm2 jlist', { encoding: 'utf-8', env: process.env });
        return JSON.parse(output);
    } catch (err) {
        console.error('Error running "pm2 jlist":', err.message);
        return null;
    }
}

// ─── Core Monitor Logic ───────────────────────────────────────────────────

async function checkBridges() {
    console.log(`\n[${new Date().toLocaleTimeString('en-GB')}] Running health checks...`);
    
    const processes = getPM2Processes();
    if (!processes) {
        console.error('Could not fetch process list. Skipping check.');
        return;
    }

    const state = loadState();
    let stateChanged = false;

    for (const name of MONITORED_PROCESSES) {
        const proc = processes.find(p => p.name === name);
        const isOnline = proc && proc.pm2_env && proc.pm2_env.status === 'online';
        const currentStatus = isOnline ? 'online' : (proc ? proc.pm2_env.status : 'missing');
        const previousStatus = state[name] || 'online'; // Assume online initially if no state

        console.log(`- ${name}: ${currentStatus.toUpperCase()} (was: ${previousStatus.toUpperCase()})`);

        if (currentStatus !== 'online') {
            const restartKey = name + '_restarts';
            state[restartKey] = state[restartKey] || 0;
            
            if (previousStatus === 'online') {
                state[name] = 'offline';
                stateChanged = true;
            }

            if (state[restartKey] < 2) {
                state[restartKey] += 1;
                stateChanged = true;
                console.log(`Auto-restarting ${name} (${state[restartKey]}/2)...`);
                try {
                    execSync(`pm2 restart ${name}`);
                    await sendAlertEmail(`🔄 [System Monitor] Auto-restarting Bridge: ${name}`, `The bridge "${name}" went offline. Attempting auto-restart (${state[restartKey]}/2)...`);
                } catch (e) {
                    console.error(`Failed to restart ${name}: ${e.message}`);
                }
            } else if (state[restartKey] === 2) {
                state[restartKey] += 1; // Prevent duplicate emails
                stateChanged = true;
                const downtime = new Date().toLocaleString('en-GB');
                const restartsInfo = proc ? proc.pm2_env.restart_time : 'N/A';
                const subject = `⚠️ [System Monitor] Bridge Offline: ${name} (Auto-restart failed)`;
                const body = `The ingestion bridge "${name}" went offline and auto-restarts have failed.\n\n` +
                             `Status: ${currentStatus.toUpperCase()}\n` +
                             `Time: ${downtime}\n` +
                             `PM2 Restarts: ${restartsInfo}\n\n` +
                             `Please check the logs on the server: pm2 logs ${name}`;
                await sendAlertEmail(subject, body);
            }
        } 
        else if (currentStatus === 'online') {
            const restartKey = name + '_restarts';
            if (previousStatus === 'offline' || state[restartKey] > 0) {
                state[name] = 'online';
                state[restartKey] = 0;
                stateChanged = true;
                const subject = `✅ [System Monitor] Bridge Recovered: ${name}`;
                const body = `The ingestion bridge "${name}" has successfully recovered and is back online.`;
                await sendAlertEmail(subject, body);
            } else if (state[name] !== 'online') {
                state[name] = 'online';
                stateChanged = true;
            }
        }
    }

    // Check Cron Scripts and Daemons based on output/heartbeat files
    const cronChecks = [
        { name: 'telegram-bridge (heartbeat)', file: path.join(__dirname, '../../logs/telegram_bridge_heartbeat.txt'), maxAgeMs: 5 * 60 * 1000 },
        { name: 'task-sync', file: path.join(__dirname, '../../auth/Google Tasks (Combined).md'), maxAgeMs: 30 * 60 * 1000 },
        // { name: 'beeper-bridge (heartbeat)', file: path.join(__dirname, '../../logs/beeper_bridge_heartbeat.txt'), maxAgeMs: 5 * 60 * 1000 },
        // { name: 'github-sync', file: path.join(__dirname, '../../logs/github_sync_out.log'), maxAgeMs: 24 * 60 * 60 * 1000 },
        { name: 'sheet-sync-maintenance', file: path.join(__dirname, '../../logs/sheet_sync_maintenance_out.log'), maxAgeMs: 2 * 60 * 60 * 1000 },
        { name: 'check-bridges-daily', file: path.join(__dirname, '../../logs/check_bridges_daily_out.log'), maxAgeMs: 25 * 60 * 60 * 1000 },
        { name: 'antigravity-cloud-backfill', file: path.join(__dirname, '../../logs/antigravity_cloud_backfill_out.log'), maxAgeMs: 25 * 60 * 60 * 1000 },
        { name: 'local-gemini-weekly-sync', file: path.join(__dirname, '../../logs/local_gemini_weekly_sync_out.log'), maxAgeMs: 8 * 24 * 60 * 60 * 1000 }
    ];

    for (const check of cronChecks) {
        try {
            const stats = fs.statSync(check.file);
            const ageMs = Date.now() - stats.mtimeMs;
            const previousStatus = state[check.name] || 'online';

            if (ageMs > check.maxAgeMs) {
                const restartKey = check.name + '_restarts';
                state[restartKey] = state[restartKey] || 0;

                if (previousStatus === 'online') {
                    state[check.name] = 'offline';
                    stateChanged = true;
                }

                if (state[restartKey] < 2) {
                    state[restartKey] += 1;
                    stateChanged = true;
                    const pm2Name = check.name.split(' ')[0];
                    console.log(`Auto-restarting cron ${pm2Name} (${state[restartKey]}/2)...`);
                    try {
                        execSync(`pm2 restart ${pm2Name}`);
                        await sendAlertEmail(`🔄 [System Monitor] Auto-restarting Cron: ${check.name}`, `The cron job "${check.name}" stalled. Attempting auto-restart (${state[restartKey]}/2)...`);
                    } catch (e) {
                        console.error(`Failed to restart cron ${pm2Name}: ${e.message}`);
                    }
                } else if (state[restartKey] === 2) {
                    state[restartKey] += 1;
                    stateChanged = true;
                    await sendAlertEmail(
                        `⚠️ [System Monitor] Cron Stalled: ${check.name} (Auto-restart failed)`,
                        `The cron job "${check.name}" appears to be stalled and auto-restarts failed.\n` +
                        `Its output file (${check.file}) has not been updated in ${Math.round(ageMs / 60000)} minutes.`
                    );
                }
            } else {
                const restartKey = check.name + '_restarts';
                if (previousStatus === 'offline' || state[restartKey] > 0) {
                    state[check.name] = 'online';
                    state[restartKey] = 0;
                    stateChanged = true;
                    await sendAlertEmail(
                        `✅ [System Monitor] Cron Recovered: ${check.name}`,
                        `The cron job "${check.name}" is successfully running again.`
                    );
                }
            }
        } catch (err) {
            console.error(`Failed to stat ${check.file}: ${err.message}`);
        }
    }

    // Check Task Master Engine Heartbeats (Dual-Layer Architecture)
    try {
        const { getPrivateAccessToken } = require('./google_auth');
        const token = await getPrivateAccessToken();
        const sheetIds = [
            { env: 'Private', id: '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY' }
        ];

        for (const sheet of sheetIds) {
            const stateKey = `TaskMasterEngine-${sheet.env}`;
            const restartKey = stateKey + '_restarts';
            const previousStatus = state[stateKey] || 'online';
            state[restartKey] = state[restartKey] || 0;

            let isHealthy = false;
            let healthReason = '';
            let lastActivityAgeMs = Infinity;

            // ─── Layer 1: Primary Local Antigravity Engine Lease (System_Status Tab) ───
            try {
                const statusUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/System_Status!A1:F7?access_token=${token}`;
                const statusRes = await fetch(statusUrl);
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const rows = statusData.values || [];
                    let leaseTimeIso = null;
                    for (const row of rows) {
                        if ((row[0] === 'TASK_MASTER' || row[0] === 'ALL') && row[1]) {
                            leaseTimeIso = row[1];
                            break;
                        }
                    }
                    if (leaseTimeIso) {
                        const leaseTime = new Date(leaseTimeIso).getTime();
                        if (!isNaN(leaseTime)) {
                            const leaseAgeMs = Date.now() - leaseTime;
                            lastActivityAgeMs = leaseAgeMs;
                            // Antigravity Ultra sweeps every 3 mins. 45 min buffer gives ample tolerance for idle periods.
                            if (leaseAgeMs <= 45 * 60 * 1000) {
                                isHealthy = true;
                                healthReason = `Local Mac mini Antigravity engine active (lease touched ${Math.round(leaseAgeMs / 60000)}m ago)`;
                            }
                        }
                    }
                }
            } catch (leaseErr) {
                console.warn(`[System Monitor] Note: Could not check System_Status tab: ${leaseErr.message}`);
            }

            // ─── Layer 2: Secondary Cloud Safety Net (5 Import - Session Stats Log) ───
            if (!isHealthy) {
                try {
                    const statsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/5 Import - Session Stats Log!A:C?access_token=${token}`;
                    const statsRes = await fetch(statsUrl);
                    if (statsRes.ok) {
                        const data = await statsRes.json();
                        const rows = data.values || [];
                        const tmRows = rows.filter(r => r[1] === 'TaskMasterEngine' && r[2] === 'SUCCESS');
                        if (tmRows.length > 0) {
                            const lastRow = tmRows[tmRows.length - 1];
                            let dateStr = lastRow[0];
                            const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
                            if (match) {
                                dateStr = `${match[3]}-${match[2]}-${match[1]}${match[4]}`;
                            }
                            const lastTime = new Date(dateStr).getTime();
                            if (!isNaN(lastTime)) {
                                const ageMs = Date.now() - lastTime;
                                if (ageMs < lastActivityAgeMs) {
                                    lastActivityAgeMs = ageMs;
                                }
                                // Apps Script cloud safety net runs every 4 hours (240 min). 270m (4.5h) buffer.
                                if (ageMs <= 270 * 60 * 1000) {
                                    isHealthy = true;
                                    healthReason = `Cloud Apps Script safety net healthy (last run ${Math.round(ageMs / 60000)}m ago)`;
                                }
                            }
                        }
                    }
                } catch (statsErr) {
                    console.error(`[System Monitor] Error checking Session Stats Log: ${statsErr.message}`);
                }
            }

            // ─── State Evaluation & Alerting ───
            if (isHealthy) {
                if (previousStatus === 'offline' || state[restartKey] > 0) {
                    state[stateKey] = 'online';
                    state[restartKey] = 0;
                    stateChanged = true;
                    console.log(`[System Monitor] ${stateKey} is ONLINE: ${healthReason}`);
                    await sendAlertEmail(
                        `✅ [System Monitor] Task Master Recovered: ${sheet.env}`,
                        `The Task Master pipeline in the ${sheet.env} environment is online and healthy.\n\nStatus: ${healthReason}`
                    );
                }
            } else {
                if (previousStatus === 'online') {
                    state[stateKey] = 'offline';
                    stateChanged = true;
                }

                if (state[restartKey] === 0) {
                    state[restartKey] = 1;
                    stateChanged = true;
                    const elapsedMins = lastActivityAgeMs !== Infinity ? Math.round(lastActivityAgeMs / 60000) : 'unknown';
                    console.warn(`[System Monitor] ${stateKey} is STALLED! Last activity was ${elapsedMins}m ago.`);
                    await sendAlertEmail(
                        `⚠️ [System Monitor] Task Master Stalled: ${sheet.env}`,
                        `Both the local Mac mini Antigravity engine (>45m) and the Cloud Apps Script safety net (>4.5h) have reported no successful runs.\n\n` +
                        `No active heartbeat lease or successful execution in the last ${elapsedMins} minutes.\n` +
                        `Please verify that the Antigravity daemon is running on the Mac mini or check Google Cloud Apps Script execution logs.`
                    );
                }
            }
        }
    } catch (err) {
        console.error(`Error checking Task Master heartbeats: ${err.message}`);
    }

    if (stateChanged) {
        saveState(state);
    }
    console.log('Health check completed.');
}

// ─── Main Runner ──────────────────────────────────────────────────────────

async function run() {
    try {
        await checkBridges();
    } catch (e) {
        console.error('Error in monitor run loop:', e);
    }
    
    // Schedule next run
    setTimeout(run, CHECK_INTERVAL_MS);
}

console.log(`Starting Ingestion Bridge System Monitor (interval: ${CHECK_INTERVAL_MS / 60000} mins)...`);
// Delay the initial run by 15 seconds to allow other PM2 apps to finish restarting
setTimeout(run, 15000);
