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
    'telegram-bridge',
    'antigravity-bridge'
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

        if (currentStatus !== 'online' && previousStatus === 'online') {
            // Process went offline
            state[name] = 'offline';
            stateChanged = true;

            const downtime = new Date().toLocaleString('en-GB');
            const restarts = proc ? proc.pm2_env.restart_time : 'N/A';
            const subject = `⚠️ [System Monitor] Bridge Offline: ${name}`;
            const body = `The ingestion bridge "${name}" went offline.\n\n` +
                         `Status: ${currentStatus.toUpperCase()}\n` +
                         `Time: ${downtime}\n` +
                         `PM2 Restarts: ${restarts}\n\n` +
                         `Please check the logs on the server: pm2 logs ${name}`;

            await sendAlertEmail(subject, body);
        } 
        else if (currentStatus === 'online' && previousStatus === 'offline') {
            // Process recovered
            state[name] = 'online';
            stateChanged = true;

            const subject = `✅ [System Monitor] Bridge Recovered: ${name}`;
            const body = `The ingestion bridge "${name}" has successfully recovered and is back online.`;

            await sendAlertEmail(subject, body);
        }
        else if (currentStatus === 'online') {
            // Ensure state matches current online state
            if (state[name] !== 'online') {
                state[name] = 'online';
                stateChanged = true;
            }
        }
    }

    // Check Cron Scripts and Daemons based on output/heartbeat files
    const cronChecks = [
        { name: 'telegram-bridge (heartbeat)', file: '/Users/daniel/Documents/AGY/the_system/logs/telegram_bridge_heartbeat.txt', maxAgeMs: 5 * 60 * 1000 },
        { name: 'task-sync', file: path.join(__dirname, '../../auth/Google Tasks (Combined).md'), maxAgeMs: 30 * 60 * 1000 },
        { name: 'github-sync', file: '/Users/daniel/Documents/AGY/the_system/logs/github_sync_out.log', maxAgeMs: 24 * 60 * 60 * 1000 },
        { name: 'sheet-sync-maintenance', file: '/Users/daniel/Documents/AGY/the_system/logs/sheet_sync_maintenance_out.log', maxAgeMs: 2 * 60 * 60 * 1000 },
        { name: 'check-bridges-daily', file: '/Users/daniel/Documents/AGY/the_system/logs/check_bridges_daily_out.log', maxAgeMs: 25 * 60 * 60 * 1000 },
        { name: 'trigger-jules-backend', file: '/Users/daniel/Documents/AGY/the_system/logs/trigger_jules_backend_out.log', maxAgeMs: 25 * 60 * 60 * 1000 },
        { name: 'trigger-jules-ui', file: '/Users/daniel/Documents/AGY/the_system/logs/trigger_jules_ui_out.log', maxAgeMs: 25 * 60 * 60 * 1000 },
        { name: 'trigger-jules-cleanup', file: '/Users/daniel/Documents/AGY/the_system/logs/trigger_jules_cleanup_out.log', maxAgeMs: 25 * 60 * 60 * 1000 }
    ];

    for (const check of cronChecks) {
        try {
            const stats = fs.statSync(check.file);
            const ageMs = Date.now() - stats.mtimeMs;
            const previousStatus = state[check.name] || 'online';

            if (ageMs > check.maxAgeMs) {
                if (previousStatus === 'online') {
                    state[check.name] = 'offline';
                    stateChanged = true;
                    await sendAlertEmail(
                        `⚠️ [System Monitor] Cron Stalled: ${check.name}`,
                        `The cron job "${check.name}" appears to be stalled.\n` +
                        `Its output file (${check.file}) has not been updated in ${Math.round(ageMs / 60000)} minutes.`
                    );
                }
            } else if (previousStatus === 'offline') {
                state[check.name] = 'online';
                stateChanged = true;
                await sendAlertEmail(
                    `✅ [System Monitor] Cron Recovered: ${check.name}`,
                    `The cron job "${check.name}" is successfully running again.`
                );
            }
        } catch (err) {
            console.error(`Failed to stat ${check.file}: ${err.message}`);
        }
    }

    // Check Apps Script Heartbeats via Google Sheets
    try {
        const { getPrivateAccessToken } = require('./google_auth');
        const token = await getPrivateAccessToken();
        const sheetIds = [
            { env: 'Private', id: '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY' },
            { env: 'PMT', id: '1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY' }
        ];

        for (const sheet of sheetIds) {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/5 Import - Session Stats Log!A:C?access_token=${token}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const rows = data.values || [];
                // Look for TaskMasterEngine
                const tmRows = rows.filter(r => r[1] === 'TaskMasterEngine' && r[2] === 'SUCCESS');
                if (tmRows.length > 0) {
                    const lastRow = tmRows[tmRows.length - 1];
                    const lastTime = new Date(lastRow[0]).getTime();
                    const ageMs = Date.now() - lastTime;
                    
                    const stateKey = `TaskMasterEngine-${sheet.env}`;
                    const previousStatus = state[stateKey] || 'online';

                    // TaskMasterEngine runs every 15 mins. Give it a 35 min buffer.
                    if (ageMs > 35 * 60 * 1000) {
                        if (previousStatus === 'online') {
                            state[stateKey] = 'offline';
                            stateChanged = true;
                            await sendAlertEmail(
                                `⚠️ [System Monitor] Apps Script Stalled: TaskMasterEngine (${sheet.env})`,
                                `The TaskMasterEngine pipeline in the ${sheet.env} environment appears to have stalled or timed out.\n` +
                                `No successful heartbeat logged in the last ${Math.round(ageMs / 60000)} minutes.`
                            );
                        }
                    } else if (previousStatus === 'offline') {
                        state[stateKey] = 'online';
                        stateChanged = true;
                        await sendAlertEmail(
                            `✅ [System Monitor] Apps Script Recovered: TaskMasterEngine (${sheet.env})`,
                            `The TaskMasterEngine pipeline in the ${sheet.env} environment is successfully running again.`
                        );
                    }
                }
            } else {
                console.error(`Failed to fetch heartbeat for ${sheet.env}: ${res.statusText}`);
            }
        }
    } catch (err) {
        console.error(`Error checking Apps Script heartbeats: ${err.message}`);
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
