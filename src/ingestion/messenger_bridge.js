/**
 * @file messenger_bridge.js
 * @description 📱 Facebook Messenger Ingestion Bridge. Listens for incoming Messenger messages and forwards them to Gmail via the Ingestion Bridge webhook.
 * @version 1.0.0
 * @last_modified 2026-06-28
 * @modified_by Jules
 * @changelog
 * - 1.0.0: Added standardized documentation header and improved error logging for empty catch blocks.
 *
 * Architecture: Same pattern as whatsapp_bridge.js
 * - Connects using saved appState (cookies)
 * - Buffers messages per thread for 5 minutes
 * - Batches and forwards to Ingestion Bridge webhook
 * - Base64 encodes subject/body/name to preserve emojis
 *
 * Setup:
 * 1. Export your Facebook cookies as appstate.json (use browser extension)
 * 2. Place appstate.json at ~/.messenger_auth/appstate.json
 * 3. Run: pm2 start src/ingestion/messenger_bridge.js --name messenger-bridge
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const login = require('@dongdev/fca-unofficial');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const GMAIL_USER = process.env.GMAIL_USER || 'adersteg.daniel@gmail.com';
const WEBAPP_URL = process.env.WEBAPP_URL;
const APPSTATE_PATH = path.join(process.env.HOME, '.messenger_auth', 'appstate.json');
const STATE_PATH = path.join(process.env.HOME, '.messenger_auth', 'state.json');
const BUFFER_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// Message buffer: { threadName: { messages: [], timer: null, threadID: '' } }
const messageBuffer = {};

let lastProcessedTimestamp = Date.now() - (12 * 60 * 60 * 1000);

// Load blocked threads
let blockedThreads = [];
try {
    const blockedData = fs.readFileSync(__dirname + '/blocked_threads.json', 'utf8');
    blockedThreads = JSON.parse(blockedData).map(t => t.toLowerCase());
} catch (e) {
    console.log("No blocked_threads.json found or failed to parse, continuing without blocklist. " + e.message);
}

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            const data = fs.readFileSync(STATE_PATH, 'utf-8');
            const state = JSON.parse(data);
            if (state && state.lastProcessedTimestamp) {
                lastProcessedTimestamp = state.lastProcessedTimestamp;
                console.log(`Loaded last processed timestamp: ${new Date(lastProcessedTimestamp).toISOString()}`);
                return;
            }
        }
    } catch (err) {
        console.error("Failed to load state.json:", err.message);
    }
    lastProcessedTimestamp = Date.now() - (12 * 60 * 60 * 1000);
    console.log(`Defaulted last processed timestamp: ${new Date(lastProcessedTimestamp).toISOString()}`);
}

function updateState(msgTime) {
    if (msgTime > lastProcessedTimestamp) {
        lastProcessedTimestamp = msgTime;
        try {
            const dir = path.dirname(STATE_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(STATE_PATH, JSON.stringify({ lastProcessedTimestamp }, null, 2));
        } catch (err) {
            console.error("Failed to save state.json:", err.message);
        }
    }
}

async function runStartupSync(api) {
    console.log("Starting startup retroactive catch-up sync...");
    const cutoffTimestamp = Date.now() - (48 * 60 * 60 * 1000); // 48 hours limit
    const scanStart = Math.max(lastProcessedTimestamp, cutoffTimestamp);
    
    console.log(`Scanning for missed messages since: ${new Date(scanStart).toISOString()}`);

    return new Promise((resolve) => {
        api.getThreadList(30, null, [], async (threadErr, list) => {
            if (threadErr) {
                console.error("Failed to get thread list during catch-up:", threadErr.message || threadErr);
                resolve();
                return;
            }

            let threadsProcessed = 0;
            let messagesFound = 0;
            const myUserID = api.getCurrentUserID();
            const recoveryBuffer = {};

            for (const thread of list) {
                if (parseInt(thread.timestamp) <= scanStart) continue;

                threadsProcessed++;
                const threadID = thread.threadID;
                const threadName = thread.name || `User ${threadID}`;

                if (blockedThreads.includes(threadName.toLowerCase())) continue;

                await new Promise((resolveThread) => {
                    api.getThreadHistory(threadID, 40, null, async (histErr, history) => {
                        if (histErr) {
                            console.error(`Failed to get history for thread ${threadID}:`, histErr.message);
                            resolveThread();
                            return;
                        }

                        const relevantMessages = (history || []).filter(msg => 
                            parseInt(msg.timestamp) > scanStart && 
                            msg.senderID !== myUserID &&
                            (msg.type === 'message' || msg.type === 'message_reply')
                        );

                        if (relevantMessages.length > 0) {
                            let userNames = {};
                            try {
                                const senderIDs = [...new Set(relevantMessages.map(m => m.senderID))];
                                const userInfo = await new Promise((resolveUser, rejectUser) => {
                                    api.getUserInfo(senderIDs, (userErr, info) => {
                                        if (userErr) rejectUser(userErr);
                                        else resolveUser(info);
                                    });
                                });
                                userNames = userInfo;
                            } catch (e) {
                                console.warn(`Failed to resolve user names for thread ${threadID}: ${e.message || e}`);
                            }

                            relevantMessages.forEach(msg => {
                                const senderName = userNames[msg.senderID]?.name || `User ${msg.senderID}`;
                                const displayName = thread.isGroup ? senderName : threadName;
                                
                                if (!recoveryBuffer[threadName]) {
                                    recoveryBuffer[threadName] = { messages: [], threadID: threadID };
                                }

                                const msgDate = new Date(parseInt(msg.timestamp));
                                const hours = String(msgDate.getHours()).padStart(2, '0');
                                const minutes = String(msgDate.getMinutes()).padStart(2, '0');
                                const currentTime = `${hours}:${minutes}`;

                                const prefix = displayName ? `[${currentTime}] ${displayName}` : `[${currentTime}]`;
                                
                                if (msg.body && msg.body.trim() !== '') {
                                    recoveryBuffer[threadName].messages.push(`${prefix}: ${msg.body}`);
                                }
                                
                                if (msg.attachments && msg.attachments.length > 0) {
                                    msg.attachments.forEach(att => {
                                        const attUrl = att.url || att.previewUrl || '';
                                        recoveryBuffer[threadName].messages.push(`${prefix}: [${att.type || 'Attachment'}] ${attUrl}`);
                                    });
                                }

                                messagesFound++;
                            });
                        }
                        resolveThread();
                    });
                });
            }

            console.log(`Startup catch-up complete. Scanned ${threadsProcessed} threads, found ${messagesFound} missed messages.`);
            
            const threads = Object.keys(recoveryBuffer);
            for (const tName of threads) {
                const buffer = recoveryBuffer[tName];
                if (buffer && buffer.messages.length > 0) {
                    const compiledText = buffer.messages.join('\n');
                    await sendToGmail(compiledText, tName, buffer.threadID);
                }
            }

            if (list.length > 0) {
                const maxTimestamp = Math.max(...list.map(t => parseInt(t.timestamp) || 0));
                if (maxTimestamp > lastProcessedTimestamp) {
                    updateState(maxTimestamp);
                }
            }

            resolve();
        });
    });
}

function startHealthCheck(api) {
    console.log("Starting periodic connection health check (every 10 minutes)...");
    setInterval(() => {
        console.log(`[Health Check] Verifying Messenger API connection...`);
        let checkFinished = false;
        
        const timeout = setTimeout(() => {
            if (!checkFinished) {
                console.error("[Health Check] Timeout. API is hanging! Forcing exit for PM2 restart...");
                process.exit(1);
            }
        }, 15000); // 15 seconds timeout

        api.getThreadList(1, null, ["INBOX"], (err, list) => {
            checkFinished = true;
            clearTimeout(timeout);
            if (err) {
                console.error("[Health Check] API call failed:", err.message || err, "- Forcing exit for PM2 restart...");
                process.exit(1);
            } else {
                console.log("[Health Check] Connection OK.");
            }
        });
    }, 10 * 60 * 1000); // 10 minutes
}

// ─── Auth Helper (reuses google_auth.js from WhatsApp bridge) ───────────────

const { getAccessToken, invalidateToken } = require('./google_auth');

// ─── Message Buffering ─────────────────────────────────────────────────────

function bufferMessage(threadName, threadID, senderName, text, attachments = []) {
    if (!messageBuffer[threadName]) {
        messageBuffer[threadName] = { messages: [], timer: null, threadID: threadID };
    }

    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const prefix = senderName ? `[${timestamp}] ${senderName}` : `[${timestamp}]`;
    
    if (text) {
        messageBuffer[threadName].messages.push(`${prefix}: ${text}`);
    }
    
    if (attachments.length > 0) {
        attachments.forEach(att => {
            messageBuffer[threadName].messages.push(`${prefix}: [${att.type || 'Attachment'}]`);
        });
    }

    console.log(`Buffered message for [${threadName}] (Sending to Gmail in 5 mins...)`);

    // Reset the 5-minute timer
    if (messageBuffer[threadName].timer) {
        clearTimeout(messageBuffer[threadName].timer);
    }

    messageBuffer[threadName].timer = setTimeout(() => {
        flushBuffer(threadName);
    }, BUFFER_DELAY_MS);
}

async function flushBuffer(threadName) {
    const buffer = messageBuffer[threadName];
    if (!buffer || buffer.messages.length === 0) return;

    const compiledText = buffer.messages.join('\n');
    delete messageBuffer[threadName];

    await sendToGmail(compiledText, threadName, buffer.threadID);
}

// ─── Gmail Forwarding ──────────────────────────────────────────────────────

async function sendToGmail(compiledText, threadName, chatId = "") {
    if (!compiledText || compiledText.trim() === '') return;

    const textToPrint = compiledText;
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA');
    const subject = `[Messenger] ${threadName} - ${todayDate}`;

    // Deterministic threading ID
    const threadString = `${threadName}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@messenger.bridge>`;

    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: Buffer.from(subject, 'utf-8').toString('base64'),
        body: Buffer.from(textToPrint, 'utf-8').toString('base64'),
        name: Buffer.from(`Messenger: ${threadName}`, 'utf-8').toString('base64'),
        references: deterministicId,
        attachments: [],
        chat_id: chatId,
        b64: true
    };

    for (let attempt = 0; attempt < 2; attempt++) {
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

            const text = await response.text();
            let result;
            try {
                result = JSON.parse(text);
            } catch {
                if (attempt === 0) {
                    console.warn(`Webhook returned HTML (token expired?), refreshing token and retrying...`);
                    invalidateToken();
                    continue;
                }
                console.error(`Webhook returned non-JSON after retry: ${text.substring(0, 200)}`);
                return;
            }

            if (result.success) {
                console.log(`Forwarded buffered messages for [${threadName}] to Webhook.`);
            } else {
                console.error(`Webhook failed to send email:`, result.error);
            }
            return;
        } catch (error) {
            if (attempt === 0) {
                console.warn(`Webhook attempt failed, retrying...`, error.message);
                invalidateToken();
                continue;
            }
            console.error(`Failed to trigger Webhook after retry:`, error);
        }
    }
}

// ─── Messenger Client ──────────────────────────────────────────────────────

function startMessengerBridge() {
    if (!fs.existsSync(APPSTATE_PATH)) {
        console.error(`❌ appstate.json not found at ${APPSTATE_PATH}`);
        console.error(`   Export your Facebook cookies and save them there.`);
        console.error(`   Use a browser extension like "J2Team Cookie Editor" to export.`);
        process.exit(1);
    }

    const appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, 'utf-8'));

    console.log('Initializing Messenger client...');

    login({ appState: appState }, (err, api) => {
        if (err) {
            console.error('❌ Messenger login failed:', err);
            // If appState expired, exit so PM2 can retry
            process.exit(1);
        }

        console.log('✅ Successfully connected to Messenger.');

        // Save refreshed appState for next restart
        fs.writeFileSync(APPSTATE_PATH, JSON.stringify(api.getAppState(), null, 2));
        console.log('💾 Saved refreshed appState.');

        // Configure the API
        api.setOptions({
            listenEvents: true,
            selfListen: false,     // Don't capture our own messages
            updatePresence: false  // Don't update online status
        });

        // Load state
        loadState();

        // Run catch-up sync before starting the listener
        runStartupSync(api).then(() => {
            // Thread name cache to avoid repeated API calls
            const threadNameCache = {};

            console.log('Starting Messenger Bridge...');
            console.log('Listening for incoming messages...\n');

            // Start connection health check
            startHealthCheck(api);

            api.listenMqtt(async (err, event) => {
                if (err) {
                    console.error('Listen error! Forcing exit for PM2 restart:', err);
                    process.exit(1);
                }

                // Only process regular messages
                if (event.type !== 'message' && event.type !== 'message_reply') {
                    return;
                }

                // Update state timestamp
                if (event.timestamp) {
                    updateState(parseInt(event.timestamp));
                }

                // Skip messages from self
                if (event.senderID === api.getCurrentUserID()) {
                    return;
                }

                try {
                    // Resolve thread name
                    let threadName = threadNameCache[event.threadID];
                    if (!threadName) {
                        const threadInfo = await new Promise((resolve, reject) => {
                            api.getThreadInfo(event.threadID, (err, info) => {
                                if (err) reject(err);
                                else resolve(info);
                            });
                        });

                        if (threadInfo.isGroup) {
                            threadName = threadInfo.threadName || `Group ${event.threadID}`;
                        } else {
                            // For DMs, get the sender's name
                            const userInfo = await new Promise((resolve, reject) => {
                                api.getUserInfo([event.senderID], (err, info) => {
                                    if (err) reject(err);
                                    else resolve(info);
                                });
                            });
                            threadName = userInfo[event.senderID]?.name || `User ${event.senderID}`;
                        }
                        threadNameCache[event.threadID] = threadName;
                    }

                    // Check if thread is blocked
                    if (blockedThreads.includes(threadName.toLowerCase())) {
                        return;
                    }

                    // Get sender name for the message prefix
                    let senderName = threadName;
                    if (event.isGroup) {
                        const userInfo = await new Promise((resolve, reject) => {
                            api.getUserInfo([event.senderID], (err, info) => {
                                    if (err) reject(err);
                                    else resolve(info);
                                });
                            });
                        senderName = userInfo[event.senderID]?.name || 'Unknown';
                    }

                    // Extract message content
                    const messageBody = event.body || '';
                    const attachments = (event.attachments || []).map(att => ({
                        type: att.type || 'file',
                        url: att.url || att.previewUrl || ''
                    }));

                    bufferMessage(threadName, event.threadID, senderName, messageBody, attachments);

                } catch (resolveErr) {
                    console.error('Error resolving thread:', resolveErr.message);
                    // Fallback: use thread ID as name
                    bufferMessage(`Thread-${event.threadID}`, event.threadID, 'Unknown', event.body || '', []);
                }
            });
        });
    });
}

// ─── Start ──────────────────────────────────────────────────────────────────

if (!WEBAPP_URL) {
    console.error('❌ WEBAPP_URL not set in .env');
    process.exit(1);
}

startMessengerBridge();
