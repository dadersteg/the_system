const login = require('@dongdev/fca-unofficial');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const GMAIL_USER = process.env.GMAIL_USER || 'adersteg.daniel@gmail.com';
const WEBAPP_URL = process.env.WEBAPP_URL;
const APPSTATE_PATH = path.join(process.env.HOME, '.messenger_auth', 'appstate.json');

if (!WEBAPP_URL) {
    console.error("CRITICAL ERROR: Please set WEBAPP_URL in your .env file.");
    process.exit(1);
}

// Load blocked threads
let blockedThreads = [];
try {
    const blockedData = fs.readFileSync(__dirname + '/blocked_threads.json', 'utf8');
    blockedThreads = JSON.parse(blockedData).map(t => t.toLowerCase());
} catch (e) {
    // optional
}

const { getAccessToken } = require('./google_auth');

// Message buffer: { threadName: { messages: [], threadID: '' } }
const messageBuffer = {};

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
        const result = JSON.parse(text);
        if (result.success) {
            console.log(`Forwarded recovered Messenger messages for [${threadName}] to Webhook.`);
        } else {
            console.error(`Webhook failed to send email for ${threadName}:`, result.error);
        }
    } catch (error) {
        console.error(`Failed to trigger Webhook for ${threadName}:`, error);
    }
}

async function flushAllBuffers() {
    console.log("\nFlushing all recovered messages to Gmail...");
    const threads = Object.keys(messageBuffer);
    
    for (const threadName of threads) {
        const buffer = messageBuffer[threadName];
        if (!buffer || buffer.messages.length === 0) continue;

        const compiledText = buffer.messages.join('\n');
        await sendToGmail(compiledText, threadName, buffer.threadID);
        delete messageBuffer[threadName];
    }
    console.log("✅ All recovered Messenger messages sent to Gmail.");
}

function processHistoricalMessage(threadName, threadID, senderName, text, timestampMs, attachments = []) {
    if (blockedThreads.includes(threadName.toLowerCase())) return;

    if (!messageBuffer[threadName]) {
        messageBuffer[threadName] = { messages: [], threadID: threadID };
    }

    const msgDate = new Date(parseInt(timestampMs));
    const hours = String(msgDate.getHours()).padStart(2, '0');
    const minutes = String(msgDate.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    const prefix = senderName ? `[${currentTime}] ${senderName}` : `[${currentTime}]`;
    
    if (text && text.trim() !== '') {
        messageBuffer[threadName].messages.push(`${prefix}: ${text}`);
    }
    
    if (attachments && attachments.length > 0) {
        attachments.forEach(att => {
            const attUrl = att.url || att.previewUrl || '';
            messageBuffer[threadName].messages.push(`${prefix}: [${att.type || 'Attachment'}] ${attUrl}`);
        });
    }
}

function main() {
    if (!fs.existsSync(APPSTATE_PATH)) {
        console.error(`❌ appstate.json not found at ${APPSTATE_PATH}`);
        process.exit(1);
    }

    const appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, 'utf-8'));
    const hoursBack = parseInt(process.argv[2]) || 36; // Default to last 36 hours
    console.log(`Starting Messenger Recovery... Scanning last ${hoursBack} hours.`);

    const cutoffTimestamp = Date.now() - (hoursBack * 60 * 60 * 1000);

    login({ appState: appState }, (err, api) => {
        if (err) {
            console.error('❌ Messenger login failed:', err);
            process.exit(1);
        }

        console.log('Connected to Messenger. Fetching recent thread list...');

        api.getThreadList(30, null, [], async (threadErr, list) => {
            if (threadErr) {
                console.error("Failed to get thread list:", threadErr);
                process.exit(1);
            }

            console.log(`Found ${list.length} recent threads. Scanning for missed messages...`);
            
            let threadsProcessed = 0;
            let messagesFound = 0;

            for (const thread of list) {
                // If the thread had no activity in our window, skip it
                if (parseInt(thread.timestamp) < cutoffTimestamp) continue;

                threadsProcessed++;
                const threadID = thread.threadID;

                // Resolve thread display name
                let threadName = thread.name || `User ${threadID}`;
                
                // Get thread history
                await new Promise((resolve) => {
                    api.getThreadHistory(threadID, 40, null, async (histErr, history) => {
                        if (histErr) {
                            console.error(`Failed to get history for thread ${threadID}:`, histErr.message);
                            resolve();
                            return;
                        }

                        // Filter messages within our cutoff window and not sent by me
                        const myUserID = api.getCurrentUserID();
                        const relevantMessages = (history || []).filter(msg => 
                            parseInt(msg.timestamp) > cutoffTimestamp && 
                            msg.senderID !== myUserID &&
                            (msg.type === 'message' || msg.type === 'message_reply')
                        );

                        if (relevantMessages.length > 0) {
                            // Fetch user info for group senders or DM sender
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
                            } catch (_) {
                                // Fallback to raw IDs if userInfo fetch fails
                            }

                            relevantMessages.forEach(msg => {
                                const senderName = userNames[msg.senderID]?.name || `User ${msg.senderID}`;
                                const displayName = thread.isGroup ? senderName : threadName;
                                
                                processHistoricalMessage(
                                    threadName, 
                                    threadID, 
                                    displayName, 
                                    msg.body, 
                                    msg.timestamp, 
                                    msg.attachments
                                );
                                messagesFound++;
                            });
                        }
                        resolve();
                    });
                });
            }

            console.log(`Scan complete. Scanned ${threadsProcessed} active threads, found ${messagesFound} missed messages.`);
            
            if (messagesFound > 0) {
                await flushAllBuffers();
            } else {
                console.log("No missed messages found.");
            }
            process.exit(0);
        });
    });
}

main();
