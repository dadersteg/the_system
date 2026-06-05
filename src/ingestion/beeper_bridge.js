const WebSocket = require('ws');
const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const GMAIL_USER = process.env.GMAIL_USER;
const WEBAPP_URL = process.env.WEBAPP_URL;
const BEEPER_ACCESS_TOKEN = process.env.BEEPER_ACCESS_TOKEN;
const BEEPER_API_URL = process.env.BEEPER_API_URL || 'http://localhost:23373';
const BEEPER_WS_URL = process.env.BEEPER_WS_URL || 'ws://localhost:23373/v1/ws';

if (!GMAIL_USER || !WEBAPP_URL || !BEEPER_ACCESS_TOKEN) {
    console.error("CRITICAL ERROR: Please set GMAIL_USER, WEBAPP_URL, and BEEPER_ACCESS_TOKEN in your .env file.");
    process.exit(1);
}

// Networks to ignore (e.g. Telegram, since telegram_bridge.py runs separately)
const IGNORE_NETWORKS = [];

// --- GOOGLE OAUTH TOKEN REFRESHER ---
let cachedGoogleToken = null;
let googleTokenExpiry = 0;

async function getGoogleAccessToken() {
    if (cachedGoogleToken && Date.now() < googleTokenExpiry - 60000) {
        return cachedGoogleToken;
    }

    const clasprcPath = path.join(os.homedir(), '.clasprc.json');
    if (!fs.existsSync(clasprcPath)) {
        throw new Error(`clasp credentials file not found at ${clasprcPath}. Run "npx clasp login" first.`);
    }

    const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
    const creds = clasprc?.tokens?.default;
    if (!creds || !creds.refresh_token) {
        throw new Error(`No refresh token found in ${clasprcPath}. Run "npx clasp login" first.`);
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token'
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to refresh Google token: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    cachedGoogleToken = result.access_token;
    googleTokenExpiry = Date.now() + (result.expires_in * 1000);
    return cachedGoogleToken;
}

function invalidateGoogleToken() {
    cachedGoogleToken = null;
    googleTokenExpiry = 0;
}

// --- BLOCKED THREADS ---
let blockedThreads = [];
try {
    const blockedData = fs.readFileSync(path.join(__dirname, 'blocked_threads.json'), 'utf8');
    blockedThreads = JSON.parse(blockedData).map(t => t.toLowerCase());
    console.log(`Loaded ${blockedThreads.length} blocked threads.`);
} catch (e) {
    console.log("No blocked_threads.json found or invalid format.");
}

// --- CHAT CACHE & RESOLUTION ---
const chatCache = {};

async function getChatDetails(chatID) {
    if (chatCache[chatID]) {
        return chatCache[chatID];
    }
    try {
        const response = await fetch(`${BEEPER_API_URL}/v1/chats/${encodeURIComponent(chatID)}`, {
            headers: {
                'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}`
            }
        });
        if (response.ok) {
            const chatData = await response.json();
            chatCache[chatID] = {
                title: chatData.title || 'Unknown Chat',
                network: chatData.network || 'Beeper'
            };
            return chatCache[chatID];
        } else {
            console.error(`Beeper Chat API returned status: ${response.status} for chat ${chatID}`);
        }
    } catch (err) {
        console.error(`Failed to fetch chat details for ${chatID}:`, err.message);
    }
    // Fallback: parse name from chatID if possible
    let network = 'Beeper';
    if (chatID.includes('@whatsapp')) network = 'WhatsApp';
    else if (chatID.includes('@telegram')) network = 'Telegram';
    else if (chatID.includes('@messenger')) network = 'Messenger';
    else if (chatID.includes('@imessage')) network = 'iMessage';
    else if (chatID.includes('@signal')) network = 'Signal';
    else if (chatID.includes('@sms')) network = 'SMS';
    
    return { title: chatID, network };
}

// --- ATTACHMENT DOWNLOADING ---
async function downloadAndGetBase64Attachment(attachmentUrl) {
    try {
        const downloadResponse = await fetch(`${BEEPER_API_URL}/v1/assets/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}`
            },
            body: JSON.stringify({ url: attachmentUrl })
        });
        if (downloadResponse.ok) {
            const result = await downloadResponse.json();
            if (result.srcURL) {
                let filePath = result.srcURL;
                if (filePath.startsWith('file://')) {
                    filePath = url.fileURLToPath(filePath);
                }
                if (fs.existsSync(filePath)) {
                    return fs.readFileSync(filePath, 'base64');
                }
            }
        }
    } catch (err) {
        console.error('Failed to download attachment:', err.message);
    }
    return null;
}

// --- BUFFERING & INGESTION LOGIC ---
const messageBuffer = {};
const BUFFER_DELAY_MS = 5 * 60 * 1000; // 5 minutes

async function flushBuffer(threadKey) {
    const buffer = messageBuffer[threadKey];
    if (!buffer) return;

    // Remove from active tracking immediately so new messages start a new buffer
    delete messageBuffer[threadKey];

    if (buffer.messages.length === 0 && buffer.attachments.length === 0) return;

    const compiledText = buffer.messages.join('\n\n---\n\n');
    await sendToGmail(compiledText, buffer.network, buffer.chatTitle, buffer.attachments, buffer.chatID);
}

async function sendToGmail(compiledText, network, chatTitle, attachments = [], chatID = "") {
    if ((!compiledText || compiledText.trim() === '') && attachments.length === 0) {
        return; // Skip empty
    }

    const textToPrint = compiledText || "[Media Attached]";
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA'); // YYYY-MM-DD local format
    
    // Construct the subject to exactly match the old bridge style (so The Clerk's filters work)
    const subject = `[${network}] ${chatTitle} - ${todayDate}`;

    const formattedAttachments = attachments.map(att => ({
        filename: att.filename,
        mimeType: att.contentType,
        base64: att.content
    }));

    // Threading references ID (same scheme as old bridge)
    const threadString = `${network}-${chatTitle}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@beeper.bridge>`;

    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: Buffer.from(subject, 'utf-8').toString('base64'),
        body: Buffer.from(textToPrint, 'utf-8').toString('base64'),
        name: Buffer.from(`${network}: ${chatTitle}`, 'utf-8').toString('base64'),
        references: deterministicId,
        attachments: formattedAttachments,
        chat_id: chatID,
        b64: true
    };

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const accessToken = await getGoogleAccessToken();
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
                    console.warn(`Webhook returned non-JSON, invalidating Google token and retrying...`);
                    invalidateGoogleToken();
                    continue;
                }
                console.error(`Webhook returned non-JSON: ${text.substring(0, 200)}`);
                return;
            }

            if (result.success) {
                console.log(`Forwarded Beeper [${network} / ${chatTitle}] messages to Gmail.`);
            } else {
                console.error(`Webhook failed to send email:`, result.error);
            }
            return;
        } catch (error) {
            if (attempt === 0) {
                console.warn(`Webhook attempt failed, retrying...`, error.message);
                invalidateGoogleToken();
                continue;
            }
            console.error(`Failed to trigger Webhook after retry:`, error);
        }
    }
}

// Helper function to process messages
async function processMessage(msg) {
    try {
        const chatID = msg.chatID;
        const chatDetails = await getChatDetails(chatID);
        const network = chatDetails.network;
        const chatTitle = chatDetails.title;

        // Skip ignored networks (like Telegram)
        if (IGNORE_NETWORKS.includes(network.toLowerCase())) {
            return;
        }

        // Skip blocked threads
        if (blockedThreads.includes(chatTitle.toLowerCase())) {
            return;
        }

        let senderName = msg.senderName || msg.from?.name || (msg.isSender ? "Me" : "Unknown");

        // Handle Media/Attachments
        let attachments = [];
        if (msg.attachments && Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
                const base64Data = await downloadAndGetBase64Attachment(att.url || att.srcURL);
                if (base64Data) {
                    attachments.push({
                        filename: att.name || att.fileName || att.filename || 'beeper_media.bin',
                        content: base64Data,
                        encoding: 'base64',
                        contentType: att.mimeType || att.mimetype || 'application/octet-stream'
                    });
                }
            }
        }

        // Append timestamp details
        const msgDate = msg.timestamp ? new Date(msg.timestamp) : (msg.ts ? new Date(msg.ts) : new Date());
        
        // Ignore messages older than 1 day (prevents syncing old history)
        if (Date.now() - msgDate.getTime() > 24 * 60 * 60 * 1000) {
            console.log(`Ignoring old message from ${senderName} dated ${msgDate.toISOString()}`);
            return;
        }

        const hours = String(msgDate.getHours()).padStart(2, '0');
        const minutes = String(msgDate.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        let messageSnippet = '';
        const cleanText = msg.text ? msg.text.replace(/<[^>]+>/g, '') : '';
        if (cleanText.trim() !== '') {
            messageSnippet = `[${currentTime}] ${senderName}:\n${cleanText}`;
        } else if (attachments.length > 0) {
            messageSnippet = `[${currentTime}] ${senderName}:\n[Media Attached]`;
        } else {
            return; // ignore empty messages
        }

        const threadKey = `${network}:${chatTitle}`;
        if (!messageBuffer[threadKey]) {
            messageBuffer[threadKey] = {
                chatID: chatID,
                network: network,
                chatTitle: chatTitle,
                messages: [],
                attachments: [],
                timer: setTimeout(() => flushBuffer(threadKey), BUFFER_DELAY_MS)
            };
        }

        messageBuffer[threadKey].messages.push(messageSnippet);
        if (attachments.length > 0) {
            messageBuffer[threadKey].attachments.push(...attachments);
        }

        console.log(`Buffered Beeper message for [${network} / ${chatTitle}] (Flushing in 5 mins...)`);

    } catch (err) {
        console.error("Error processing message:", err);
    }
}

// --- WEBSOCKET CLIENT CONFIG & CONNECT ---
function connectBeeperWS() {
    console.log(`Connecting to Beeper WS API at ${BEEPER_WS_URL}...`);
    
    const ws = new WebSocket(BEEPER_WS_URL, {
        headers: {
            'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}`
        }
    });

    ws.on('open', () => {
        console.log('✅ Connected to Beeper WebSocket. Subscribing to all chats...');
        
        // Subscribe to all chats (*)
        ws.send(JSON.stringify({
            type: "subscriptions.set",
            requestID: "init_sub",
            chatIDs: ["*"]
        }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            // Check for message upserted events
            if (event.type === 'message.upserted' || event.type === 'message.created') {
                console.log("DUMPING MESSAGE EVENT:", JSON.stringify(event, null, 2));
                if (event.entries && Array.isArray(event.entries)) {
                    for (let entry of event.entries) {
                        entry.chatID = event.chatID;
                        await processMessage(entry);
                    }
                } else {
                    const msg = event.data?.message || event.data || event.message || event;
                    if (msg && (msg.chatID || msg.chat_id)) {
                        msg.chatID = msg.chatID || msg.chat_id;
                        await processMessage(msg);
                    }
                }
            }
        } catch (err) {
            console.error('Error parsing WebSocket message event:', err.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.warn(`⚠️ Beeper WS disconnected. Code: ${code}, Reason: ${reason}. Retrying connection in 5 seconds...`);
        setTimeout(connectBeeperWS, 5000);
    });

    ws.on('error', (err) => {
        console.error('❌ Beeper WS Error:', err.message);
        ws.close();
    });
}

// Start bridge
console.log('Starting Beeper-to-Gmail Ingestion Bridge...');
connectBeeperWS();
