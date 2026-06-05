const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Target bridges to check
const TARGET_BRIDGES = ['beeper-bridge', 'telegram-bridge', 'system-monitor', 'antigravity-bridge'];
const TOKEN_PATH = path.join(__dirname, '../../token.json');

function getPM2Status() {
    const pm2Path = fs.existsSync('/opt/homebrew/bin/pm2') ? '/opt/homebrew/bin/pm2' : 'pm2';
    return new Promise((resolve, reject) => {
        exec(`${pm2Path} jlist`, (err, stdout, stderr) => {
            if (err) {
                return reject(err);
            }
            try {
                const list = JSON.parse(stdout);
                resolve(list);
            } catch (e) {
                reject(new Error("Failed to parse pm2 jlist output"));
            }
        });
    });
}

async function getTasksAccessToken() {
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error(`Workspace token.json not found at ${TOKEN_PATH}. Run Python health check or authenticate.`);
    }
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const body = new URLSearchParams({
        client_id: tokenData.client_id,
        client_secret: tokenData.client_secret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
}

async function createGoogleTask(title, notes) {
    const accessToken = await getTasksAccessToken();
    const url = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            title: title,
            notes: notes
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to create Google Task: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data;
}

async function main() {
    console.log(`[${new Date().toISOString()}] Running daily bridge health check...`);
    try {
        const pm2List = await getPM2Status();
        const offlineBridges = [];

        for (const target of TARGET_BRIDGES) {
            const processInfo = pm2List.find(p => p.name === target);
            if (!processInfo) {
                offlineBridges.push({ name: target, status: 'MISSING' });
            } else if (processInfo.pm2_env.status !== 'online') {
                offlineBridges.push({ name: target, status: processInfo.pm2_env.status.toUpperCase() });
            }
        }

        if (offlineBridges.length > 0) {
            console.log(`Offline bridges detected:`, offlineBridges);
            const offlineNames = offlineBridges.map(b => `${b.name} (${b.status})`).join(', ');
            
            const taskTitle = `[System Alert] Review Stopped Ingestion Bridges`;
            const taskNotes = `The following ingestion bridges were found offline or missing during the daily health check:\n` +
                offlineBridges.map(b => `- ${b.name}: Status is ${b.status}`).join('\n') +
                `\n\nPlease log in to the server and run 'pm2 status' and check the logs: pm2 logs <bridge-name>`;

            console.log(`Creating Google Task...`);
            const task = await createGoogleTask(taskTitle, taskNotes);
            console.log(`Successfully created task: "${task.title}" (ID: ${task.id})`);
        } else {
            console.log("All ingestion bridges are healthy and online.");
        }
    } catch (error) {
        console.error("Health check execution failed:", error.message || error);
    }
}

main();
