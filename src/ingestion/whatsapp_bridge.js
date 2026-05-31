const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./google_auth');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// 1. Ingestion Bridge Configuration
const GMAIL_USER = process.env.GMAIL_USER;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!GMAIL_USER || !WEBAPP_URL) {
    console.error("CRITICAL ERROR: Please set GMAIL_USER and WEBAPP_URL in your .env file.");
    process.exit(1);
}

// --- BLOCKED THREADS ---
let blockedThreads = [];
try {
    const blockedData = fs.readFileSync(__dirname + '/blocked_threads.json', 'utf8');
    blockedThreads = JSON.parse(blockedData).map(t => t.toLowerCase());
    console.log(`Loaded ${blockedThreads.length} blocked threads.`);
} catch (e) {
    console.log("No blocked_threads.json found or invalid format.");
}

// --- BUFFERING LOGIC ---
const messageBuffer = {};
const BUFFER_DELAY_MS = 5 * 60 * 1000; // 5 minutes

async function flushBuffer(threadName) {
    const buffer = messageBuffer[threadName];
    if (!buffer) return;

    // Remove from active tracking immediately so new messages start a new buffer
    delete messageBuffer[threadName];

    if (buffer.messages.length === 0 && buffer.attachments.length === 0) return;

    const compiledText = buffer.messages.join('\n\n---\n\n');
    await sendToGmail(compiledText, threadName, buffer.attachments, buffer.chatId);
}

/**
 * Sends a batch of messages to Gmail using the strict threading logic required by the LOS Triage Gateway.
 */
async function sendToGmail(compiledText, threadName, attachments = [], chatId = "") {
    if ((!compiledText || compiledText.trim() === '') && attachments.length === 0) {
        return; // Skip empty
    }

    const textToPrint = compiledText || "[Media Attached]";

    // Determine current date/time in local timezone
    const now = new Date();
    // Use local Date to match YYYY-MM-DD
    const todayDate = now.toLocaleDateString('en-CA'); 
    
    const subject = `[WhatsApp] ${threadName} - ${todayDate}`;

    const formattedAttachments = attachments.map(att => ({
        filename: att.filename,
        mimeType: att.contentType,
        base64: att.content // whatsapp-web.js media.data is already base64
    }));

    // Force Gmail to thread these messages by giving them a deterministic "References" header
    // based on the thread name and the date.
    const threadString = `${threadName}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@whatsapp.bridge>`;

    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: Buffer.from(subject, 'utf-8').toString('base64'),
        body: Buffer.from(textToPrint, 'utf-8').toString('base64'),
        name: Buffer.from(`WhatsApp: ${threadName}`, 'utf-8').toString('base64'),
        references: deterministicId,
        attachments: formattedAttachments,
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
                // Got HTML instead of JSON — token likely expired
                if (attempt === 0) {
                    console.warn(`Webhook returned HTML (token expired?), refreshing token and retrying...`);
                    const { invalidateToken } = require('./google_auth');
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
                const { invalidateToken } = require('./google_auth');
                invalidateToken();
                continue;
            }
            console.error(`Failed to trigger Webhook after retry:`, error);
        }
    }
}

// 3. Initialize the WhatsApp Headless Client
// Kill any orphan Chromium processes from previous crashes (prevents "browser already running" errors)
const { execSync } = require('child_process');
try {
    execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
} catch (_) { /* no orphans to kill */ }

// Clean up stale Chromium lock files that prevent re-launch after a hard kill
const SESSION_DIR = '/Users/daniel/.wwebjs_auth/session-TS_whatsapp_session';
try {
    const stalePort = SESSION_DIR + '/DevToolsActivePort';
    const singletonLock = SESSION_DIR + '/SingletonLock';
    if (fs.existsSync(stalePort)) fs.unlinkSync(stalePort);
    if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock);
} catch (_) { /* non-critical */ }

// We use LocalAuth to ensure the session is saved locally, so you only scan the QR code once.
const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: "TS_whatsapp_session",
        dataPath: '/Users/daniel/.wwebjs_auth'
    }),
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling'
        ],
    }
});

// Event: QR Code generation for the initial login
client.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('Action Required: Scan this QR code with your WhatsApp!');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
});

// Event: Client successfully authenticated and ready
client.on('ready', async () => {
    console.log('\n✅ Successfully connected to WhatsApp.');
    console.log('Starting LOS WhatsApp Bridge (Inbound + Outbound)...');
    console.log('Listening for incoming messages in the background...');
    startOutboundServer();
    
    // Retroactively sync any missed messages from the last 7 days (specifically from unsaved contacts)
    try {
        console.log("Starting retroactive sync for missed messages...");
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
        const chats = await client.getChats();
        let synced = 0;
        
        for (let chat of chats) {
            if (chat.isGroup) continue;
            // Only care if the chat was active recently
            if (chat.timestamp && chat.timestamp * 1000 < cutoff) continue;
            
            try {
                const contact = await chat.getContact();
                // If the contact is not in the address book and is not the user themselves
                if (contact && !contact.isMyContact && !contact.isMe) {
                    const messages = await chat.fetchMessages({ limit: 15 });
                    for (let msg of messages) {
                        if (msg.timestamp * 1000 > cutoff && !msg.fromMe) {
                            await processMessage(msg, false);
                            synced++;
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to check contact:", err.message);
            }
        }
        console.log(`Retroactive sync complete. Queued ${synced} missed messages for Gmail.`);
    } catch (err) {
        console.error("Retroactive sync error:", err.message);
    }

    // Bulletproof Health Check: Ping the browser every 5 minutes. If it hangs or disconnects, force PM2 restart.
    // Wait 3 minutes on startup before beginning checks — gives the session time to restore from disk.
    setTimeout(() => {
        setInterval(async () => {
            try {
                const state = await Promise.race([
                    client.getState(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                ]);
                if (state !== 'CONNECTED') {
                    console.error(`[Health Check] State is ${state}. Forcing PM2 restart...`);
                    process.exit(1);
                }
            } catch (err) {
                console.error(`[Health Check] Browser hung or errored: ${err.message}. Forcing PM2 restart...`);
                process.exit(1);
            }
        }, 5 * 60 * 1000);
    }, 3 * 60 * 1000); // 3 minute grace period on startup
});

// ==============================================================================
// 📡 OUTBOUND EXECUTION PLANE
// Exposes a Unix domain socket for agents to send WhatsApp messages.
// ==============================================================================

const SOCKET_PATH = '/tmp/wa_outbound.sock';
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5;
const outboundLog = []; // timestamps of recent sends for rate limiting

/**
 * Resolves a contact by display name (exact match first, then fuzzy substring).
 * Throws if no match or ambiguous.
 * @param {string} nameQuery - The human-readable name to search for.
 * @returns {Promise<Object>} The matched contact object.
 */
async function resolveContact(nameQuery) {
    const contacts = await client.getContacts();
    const query = nameQuery.toLowerCase().trim();

    // Raw number bypass: if the query is purely numeric or starts with +, treat it as a raw ID.
    const numericOnly = query.replace(/\D/g, '');
    if (numericOnly.length >= 10 && (query.startsWith('+') || /^\d+$/.test(query))) {
        return { 
            id: { _serialized: numericOnly + '@c.us' }, 
            name: numericOnly, 
            pushname: numericOnly 
        };
    }

    // Exact match on saved name or pushname
    const exact = contacts.find(c =>
        (c.name && c.name.toLowerCase() === query) ||
        (c.pushname && c.pushname.toLowerCase() === query)
    );
    if (exact) return exact;

    // Fuzzy: substring match
    const fuzzy = contacts.filter(c =>
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.pushname && c.pushname.toLowerCase().includes(query))
    );

    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length > 1) {
        // Deduplicate: if all matches share the same phone number, they're the same person
        const uniqueNumbers = new Set(fuzzy.map(c => c.id?._serialized || c.number));
        if (uniqueNumbers.size === 1) return fuzzy[0];

        const names = [...new Set(fuzzy.map(c => c.name || c.pushname || c.number))].join(', ');
        throw new Error(`Ambiguous contact: found ${uniqueNumbers.size} distinct matches for "${nameQuery}": [${names}]. Please be more specific.`);
    }

    throw new Error(`No contact found matching "${nameQuery}". Use --contacts to list available contacts.`);
}

/**
 * Resolves a group chat by name (fuzzy substring match).
 * @param {string} groupName - The group chat name to search for.
 * @returns {Promise<Object>} The matched chat object.
 */
async function resolveGroupChat(groupName) {
    const chats = await client.getChats();
    const query = groupName.toLowerCase().trim();
    const matches = chats.filter(c => c.isGroup && c.name.toLowerCase().includes(query));

    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        const names = matches.map(c => c.name).join(', ');
        throw new Error(`Ambiguous group: found ${matches.length} matches for "${groupName}": [${names}]. Please be more specific.`);
    }
    throw new Error(`No group chat found matching "${groupName}".`);
}

/**
 * Checks if the outbound rate limit has been exceeded.
 * @returns {boolean} True if sending is allowed.
 */
function checkRateLimit() {
    const now = Date.now();
    // Purge entries older than the window
    while (outboundLog.length > 0 && outboundLog[0] < now - RATE_LIMIT_WINDOW_MS) {
        outboundLog.shift();
    }
    if (outboundLog.length >= RATE_LIMIT_MAX) {
        return false;
    }
    outboundLog.push(now);
    return true;
}

/**
 * Starts the IPC server for outbound message dispatch.
 * Agents connect via Unix socket and send JSON payloads.
 * Supported actions: 'send', 'contacts'
 */
function startOutboundServer() {
    // Clean up stale socket from previous runs
    if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
    }

    const server = net.createServer({ allowHalfOpen: true }, (conn) => {
        let data = '';
        conn.on('data', (chunk) => { data += chunk; });
        conn.on('end', async () => {
            try {
                const payload = JSON.parse(data);

                if (payload.action === 'send') {
                    // Rate limit check
                    if (!checkRateLimit()) {
                        conn.end(JSON.stringify({ success: false, error: `Rate limit exceeded (max ${RATE_LIMIT_MAX} messages per minute).` }));
                        return;
                    }

                    const target = payload.isGroup
                        ? await resolveGroupChat(payload.to)
                        : await resolveContact(payload.to);

                    const chatId = target.id ? target.id._serialized : target.id;
                    await client.sendMessage(chatId, payload.message);

                    const resolvedName = target.name || target.pushname || payload.to;
                    console.log(`📤 Outbound message sent to: ${resolvedName}`);
                    conn.end(JSON.stringify({ success: true, to: resolvedName }));

                } else if (payload.action === 'contacts') {
                    const contacts = await client.getContacts();
                    const seen = new Set();
                    const names = contacts
                        .filter(c => {
                            if (!(c.name || c.pushname) || c.isGroup || c.isMe) return false;
                            const key = c.id?._serialized || c.number || (c.name || c.pushname);
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        })
                        .map(c => ({ name: c.name || null, pushname: c.pushname || null, number: c.number || null }))
                        .sort((a, b) => (a.name || a.pushname || '').localeCompare(b.name || b.pushname || ''));
                    conn.end(JSON.stringify({ success: true, contacts: names }));

                } else if (payload.action === 'check_sent') {
                    try {
                        const target = payload.isGroup
                            ? await resolveGroupChat(payload.to)
                            : await resolveContact(payload.to);

                        const chatId = target.id ? target.id._serialized : target.id;
                        const chat = await client.getChatById(chatId);
                        const messages = await chat.fetchMessages({ limit: 50 });
                        
                        const myMessages = messages.filter(m => m.fromMe);
                        const lastMsg = myMessages.length > 0 ? myMessages[myMessages.length - 1].body : null;
                        
                        conn.end(JSON.stringify({ 
                            success: true, 
                            sent: myMessages.length > 0,
                            lastMessage: lastMsg
                        }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else if (payload.action === 'export_recent_groups') {
                    try {
                        const chats = await client.getChats();
                        const groups = chats.filter(c => c.isGroup).slice(0, 50); // Top 50 recent groups
                        let results = [];
                        
                        for (let chat of groups) {
                            const messages = await chat.fetchMessages({ limit: 20 });
                            const myMessages = messages.filter(m => m.fromMe);
                            if (myMessages.length > 0) {
                                const lastMsg = myMessages[myMessages.length - 1];
                                
                                let inviteCode = "Unknown";
                                try {
                                    inviteCode = await chat.getInviteCode();
                                } catch (err) {
                                    // User might not be admin
                                }
                                
                                results.push({
                                    groupName: chat.name,
                                    inviteUrl: inviteCode !== "Unknown" ? `chat.whatsapp.com/${inviteCode}` : "Not Admin",
                                    timestamp: lastMsg.timestamp,
                                    hasMedia: lastMsg.hasMedia,
                                    body: lastMsg.body
                                });
                            }
                        }
                        conn.end(JSON.stringify({ success: true, data: results }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else if (payload.action === 'find_wedding_invites') {
                    try {
                        const chats = await client.getChats();
                        const groups = chats.filter(c => c.isGroup).slice(0, 150); // Top 150 recent groups
                        let results = [];
                        
                        for (let chat of groups) {
                            const messages = await chat.fetchMessages({ limit: 50 });
                            const inviteMsg = messages.find(m => m.body && m.body.includes(payload.searchLink));
                            
                            if (inviteMsg) {
                                let inviteCode = "Unknown";
                                try {
                                    inviteCode = await chat.getInviteCode();
                                } catch (err) {}
                                
                                results.push({
                                    groupName: chat.name,
                                    inviteUrl: inviteCode !== "Unknown" ? `chat.whatsapp.com/${inviteCode}` : "Not Admin",
                                    timestamp: inviteMsg.timestamp,
                                    body: inviteMsg.body
                                });
                            }
                        }
                        conn.end(JSON.stringify({ success: true, data: results }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else if (payload.action === 'find_wedding_invites_dm') {
                    try {
                        const chats = await client.getChats();
                        const dms = chats.filter(c => !c.isGroup && !c.id.user.includes('status')).slice(0, 200);
                        let results = [];
                        
                        for (let chat of dms) {
                            const messages = await chat.fetchMessages({ limit: 50 });
                            const inviteMsg = messages.find(m => m.body && m.body.includes(payload.searchLink));
                            
                            if (inviteMsg) {
                                results.push({
                                    contactName: chat.name || "Unknown",
                                    waUrl: `wa.me/${chat.id.user}`,
                                    timestamp: inviteMsg.timestamp
                                });
                            }
                        }
                        conn.end(JSON.stringify({ success: true, data: results }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else if (payload.action === 'inspect_dms') {
                    try {
                        const chats = await client.getChats();
                        const dms = chats.filter(c => !c.isGroup && !c.id.user.includes('status')).slice(0, 200);
                        let results = [];
                        for (let chat of dms) {
                            const messages = await chat.fetchMessages({ limit: 50 });
                            const inviteMsg = messages.find(m => m.body && m.body.includes(payload.searchLink));
                            if (inviteMsg) {
                                results.push({
                                    id: chat.id,
                                    name: chat.name
                                });
                            }
                        }
                        conn.end(JSON.stringify({ success: true, data: results }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else if (payload.action === 'sync_missed_unknown') {
                    try {
                        const hours = payload.hours || 24;
                        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
                        const chats = await client.getChats();
                        const recentChats = chats.slice(0, 100);
                        let syncedCount = 0;
                        for (let chat of recentChats) {
                            if (chat.isGroup) continue;
                            const contact = await chat.getContact();
                            if (contact && !contact.isMyContact && !contact.isMe) {
                                const messages = await chat.fetchMessages({ limit: 20 });
                                for (let msg of messages) {
                                    if (msg.timestamp * 1000 > cutoff) {
                                        await processMessage(msg, false);
                                        syncedCount++;
                                    }
                                }
                            }
                        }
                        conn.end(JSON.stringify({ success: true, synced: syncedCount }));
                    } catch (e) {
                        conn.end(JSON.stringify({ success: false, error: e.message }));
                    }

                } else {
                    conn.end(JSON.stringify({ success: false, error: `Unknown action: ${payload.action}` }));
                }
            } catch (err) {
                console.error('📡 Outbound IPC error:', err.message);
                try { conn.end(JSON.stringify({ success: false, error: err.message })); } catch (_) {}
            }
        });
    });

    server.listen(SOCKET_PATH, () => {
        // Set socket permissions to owner-only
        fs.chmodSync(SOCKET_PATH, 0o600);
        console.log(`📡 Outbound Execution Plane active on ${SOCKET_PATH}\n`);
    });

    server.on('error', (err) => {
        console.error('📡 Outbound server error:', err.message);
    });
}

// Graceful shutdown: clean up socket file
process.on('SIGINT', () => {
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    process.exit(0);
});
process.on('SIGTERM', () => {
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    process.exit(0);
});

// Helper function to process messages (both new and edited)
async function processMessage(msg, isEdit = false) {
    // Skip system broadcast status messages and Channels (@newsletter)
    if (msg.isStatus || msg.from.includes('@newsletter')) {
        return; 
    }

    try {
        const chat = await msg.getChat();
        
        // Determine the thread name (Group chat name, or the other person's name)
        let threadName = "Unknown";
        if (chat.isGroup) {
            threadName = chat.name;
        } else {
            threadName = chat.name || (chat.id && chat.id.user) || "Unknown";
        }

        // Check if thread is blocked
        if (blockedThreads.includes(threadName.toLowerCase())) {
            return;
        }

        // Determine the sender name
        let senderName = "Unknown";
        if (msg.fromMe) {
            senderName = "Me";
        } else {
            const contact = await msg.getContact();
            senderName = contact.name || contact.pushname || contact.number || "Unknown";
        }

        if (isEdit) {
            senderName += " (EDITED)";
        }

        // Handle Media Attachments
        let attachments = [];
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.data) {
                    let filename = media.filename;
                    if (!filename) {
                        // Guess extension from mimetype (e.g., image/jpeg -> jpeg)
                        const ext = media.mimetype ? media.mimetype.split('/')[1].split(';')[0] : 'bin';
                        filename = `whatsapp_media.${ext}`;
                    }

                    attachments.push({
                        filename: filename, 
                        content: media.data,
                        encoding: 'base64',
                        contentType: media.mimetype
                    });
                }
            } catch (err) {
                console.error("Failed to download media:", err);
            }
        }

        // --- ADD TO BUFFER ---
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        let messageSnippet = '';
        if (msg.body && msg.body.trim() !== '') {
            messageSnippet = `[${currentTime}] ${senderName}:\n${msg.body}`;
        } else if (attachments.length > 0) {
            messageSnippet = `[${currentTime}] ${senderName}:\n[Media Attached]`;
        } else {
            return; // completely empty, ignore
        }

        if (!messageBuffer[threadName]) {
            messageBuffer[threadName] = {
                chatId: chat.id._serialized,
                messages: [],
                attachments: [],
                timer: setTimeout(() => flushBuffer(threadName), BUFFER_DELAY_MS)
            };
        }

        messageBuffer[threadName].messages.push(messageSnippet);
        if (attachments.length > 0) {
            messageBuffer[threadName].attachments.push(...attachments);
        }

        console.log(`Buffered message for [${threadName}] (Sending to Gmail in 5 mins...)`);
        
    } catch (err) {
        console.error("Error processing message:", err);
    }
}

// Event: A new message is created (fires for BOTH incoming and outgoing messages)
client.on('message_create', async (msg) => {
    await processMessage(msg, false);
});

// Event: An existing message is edited
client.on('message_edit', async (msg, newBody, prevBody) => {
    await processMessage(msg, true);
});

// Start the client
console.log('Initializing WhatsApp client (Inbound + Outbound)...');
client.initialize();
