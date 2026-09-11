const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const dotenv = require('dotenv');
for (const envCandidate of [
    path.join(__dirname, '../../.env'),
    '/Users/daniel/Developer/the_system/.env'
]) {
    if (fs.existsSync(envCandidate)) {
        dotenv.config({ path: envCandidate });
        break;
    }
}

const googleAuthPath = fs.existsSync(path.join(__dirname, '../../src/ingestion/google_auth.js'))
    ? path.join(__dirname, '../../src/ingestion/google_auth.js')
    : '/Users/daniel/Documents/AGY/the_system/src/ingestion/google_auth.js';
const { getAccessToken } = require(googleAuthPath);

const LOG_FILE = process.env.BEEPER_LOG_FILE || '/Users/daniel/.pm2/logs/beeper-bridge-out.log';
const STATE_FILE = path.join(__dirname, '../../data/beeper_backfill_state.json');

const GMAIL_USER = process.env.GMAIL_USER || 'adersteg.daniel@gmail.com';
const WEBAPP_URL = process.env.WEBAPP_URL;
const BEEPER_API_URL = process.env.BEEPER_API_URL || 'http://localhost:23373';
const BEEPER_ACCESS_TOKEN = process.env.BEEPER_ACCESS_TOKEN;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'MOW_BRIDGE_SECRET_2026';

// Outage range: Sep 5, 2026 ~19:50 UTC -> Sep 10, 2026 13:00 UTC
const OUTAGE_START = new Date('2026-09-05T19:50:00Z').getTime();
const OUTAGE_END = new Date('2026-09-10T13:00:00Z').getTime();

const chatCache = {};

async function getChatTitle(chatID) {
    if (chatCache[chatID]) return chatCache[chatID];
    try {
        const res = await fetch(`${BEEPER_API_URL}/v1/chats/${encodeURIComponent(chatID)}`, {
            headers: { 'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}` }
        });
        if (res.ok) {
            const data = await res.json();
            chatCache[chatID] = data.title || chatID;
            return chatCache[chatID];
        }
    } catch (e) {}
    chatCache[chatID] = chatID;
    return chatID;
}

async function downloadAttachmentBase64(attachmentUrl) {
    try {
        const res = await fetch(`${BEEPER_API_URL}/v1/assets/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}`
            },
            body: JSON.stringify({ url: attachmentUrl })
        });
        if (res.ok) {
            const result = await res.json();
            if (result.srcURL) {
                let filePath = result.srcURL;
                if (filePath.startsWith('file://')) {
                    filePath = url.fileURLToPath(filePath);
                }
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    // Skip attachments larger than 5MB to respect Apps Script payload limits
                    if (stats.size > 5 * 1024 * 1024) return null;
                    return fs.readFileSync(filePath, 'base64');
                }
            }
        }
    } catch (e) {}
    return null;
}

function loadBackfillState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (e) {}
    return {};
}

function saveBackfillState(state) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save state:', e.message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDumpedMessages() {
    console.log(`Reading raw events from ${LOG_FILE}...`);
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const pattern = /DUMPING MESSAGE EVENT:\s*(\{[\s\S]*?\n\}(?=\n(?:[0-9]+\|beeper-b|DUMPING|Ignoring|Buffered|\Z)))/g;
    
    let match;
    const messages = [];
    const seenIds = new Set();

    while ((match = pattern.exec(content)) !== null) {
        try {
            const event = JSON.parse(match[1]);
            const entries = event.entries || (event.text ? [event] : []);
            for (const entry of entries) {
                const msgId = entry.id;
                if (msgId && seenIds.has(msgId)) continue;
                if (msgId) seenIds.add(msgId);

                const tsStr = entry.timestamp || entry.ts;
                if (!tsStr) continue;
                const msgTime = new Date(tsStr).getTime();
                if (msgTime < OUTAGE_START || msgTime > OUTAGE_END) continue;

                messages.push({
                    id: msgId,
                    accountID: entry.accountID || 'unknown',
                    chatID: entry.chatID || event.chatID || '',
                    senderName: entry.senderName || entry.senderID || (entry.isSender ? 'Me' : 'Unknown'),
                    isSender: Boolean(entry.isSender),
                    text: entry.text || '',
                    timestamp: new Date(msgTime),
                    attachments: entry.attachments || []
                });
            }
        } catch (e) {}
    }
    return messages;
}

async function run() {
    const args = process.argv.slice(2);
    const targetNetwork = args.includes('--all') ? 'all' : (args.find(a => a.startsWith('--network='))?.split('=')[1] || 'instagram');
    const isDryRun = args.includes('--dry-run');

    console.log(`=== Beeper Backfill Runner ===`);
    console.log(`Target: ${targetNetwork.toUpperCase()}`);
    console.log(`Mode  : ${isDryRun ? 'DRY-RUN (no emails sent)' : 'LIVE SEND'}`);

    const messages = parseDumpedMessages();
    console.log(`Parsed ${messages.length} total un-forwarded messages within the outage range.`);

    // Filter by network
    const filtered = messages.filter(m => {
        const acct = m.accountID.toLowerCase();
        if (targetNetwork === 'all') return true;
        if (targetNetwork === 'instagram') return acct.includes('instagram');
        if (targetNetwork === 'whatsapp') return acct.includes('whatsapp');
        if (targetNetwork === 'messenger') return acct.includes('messenger') || acct.includes('facebook');
        if (targetNetwork === 'telegram') return acct.includes('telegram');
        return acct.includes(targetNetwork.toLowerCase());
    });

    console.log(`Filtered to ${filtered.length} messages matching target "${targetNetwork}".`);

    // Group by (Network, ChatID, YYYY-MM-DD)
    const batches = {};
    for (const m of filtered) {
        let net = 'Instagram';
        const acct = m.accountID.toLowerCase();
        if (acct.includes('whatsapp')) net = 'WhatsApp';
        else if (acct.includes('messenger') || acct.includes('facebook')) net = 'Facebook/Messenger';
        else if (acct.includes('telegram')) net = 'Telegram';

        const dStr = m.timestamp.toLocaleDateString('en-CA'); // YYYY-MM-DD format
        const batchKey = `${net}|${m.chatID}|${dStr}`;
        if (!batches[batchKey]) {
            batches[batchKey] = {
                network: net,
                chatID: m.chatID,
                dateStr: dStr,
                messages: []
            };
        }
        batches[batchKey].messages.push(m);
    }

    const batchKeys = Object.keys(batches).sort();
    console.log(`Identified ${batchKeys.length} daily thread batches to process.\n`);

    const state = loadBackfillState();
    let sentCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < batchKeys.length; i++) {
        const key = batchKeys[i];
        const batch = batches[key];
        const chatTitle = await getChatTitle(batch.chatID);

        if (state[key] && !isDryRun) {
            console.log(`[${i + 1}/${batchKeys.length}] [SKIPPED - ALREADY SENT] [${batch.dateStr}] [${batch.network}] ${chatTitle}`);
            skippedCount++;
            continue;
        }

        // Sort chronologically
        batch.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Process attachments and build compiled text
        const processedAttachments = [];
        const lines = [];

        for (const msg of batch.messages) {
            const hours = String(msg.timestamp.getHours()).padStart(2, '0');
            const minutes = String(msg.timestamp.getMinutes()).padStart(2, '0');
            const cleanText = msg.text ? msg.text.replace(/<[^>]+>/g, '').trim() : '';

            // Attachments
            if (msg.attachments && Array.isArray(msg.attachments)) {
                for (const att of msg.attachments) {
                    const b64 = await downloadAttachmentBase64(att.url || att.srcURL);
                    if (b64) {
                        processedAttachments.push({
                            filename: att.name || att.fileName || att.filename || 'media.jpg',
                            mimeType: att.mimeType || att.mimetype || 'image/jpeg',
                            base64: b64
                        });
                    }
                }
            }

            const contentText = cleanText || (msg.attachments.length > 0 ? '[Media Attached]' : '[Reaction/Sticker]');
            lines.push(`[${hours}:${minutes}] ${msg.senderName}:\n${contentText}`);
        }

        const compiledText = lines.join('\n\n---\n\n');
        const subject = `[${batch.network}] ${chatTitle} - ${batch.dateStr}`;

        console.log(`[${i + 1}/${batchKeys.length}] [${batch.dateStr}] [${batch.network}] ${chatTitle} (${batch.messages.length} msgs, ${processedAttachments.length} attachments)`);

        if (isDryRun) {
            continue;
        }

        // Send payload to Webhook
        const threadString = `${batch.network}-${chatTitle}-${batch.dateStr}`;
        const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
        const deterministicId = `<${threadHash}@beeper.bridge>`;

        const payload = {
            secret: BRIDGE_SECRET,
            to: GMAIL_USER,
            subject: Buffer.from(subject, 'utf-8').toString('base64'),
            body: Buffer.from(compiledText, 'utf-8').toString('base64'),
            name: Buffer.from(`${batch.network}: ${chatTitle}`, 'utf-8').toString('base64'),
            references: deterministicId,
            attachments: processedAttachments,
            chat_id: batch.chatID,
            b64: true
        };

        try {
            const accessToken = await getAccessToken();
            const res = await fetch(WEBAPP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify(payload)
            });

            const text = await res.text();
            let result;
            try { result = JSON.parse(text); } catch (e) { result = { success: false, raw: text }; }

            if (result.success) {
                console.log(`    ✓ Delivered successfully to Gmail.`);
                state[key] = {
                    sentAt: new Date().toISOString(),
                    messageCount: batch.messages.length,
                    attachmentsCount: processedAttachments.length
                };
                saveBackfillState(state);
                sentCount++;
            } else {
                console.error(`    ❌ Webhook error:`, result.error || result.raw);
            }
        } catch (err) {
            console.error(`    ❌ Delivery error:`, err.message);
        }

        // Throttle 1.2 seconds between batches
        await sleep(1200);
    }

    console.log(`\n=== Backfill Summary ===`);
    console.log(`Sent   : ${sentCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Total  : ${batchKeys.length}`);
}

run().catch(err => {
    console.error('Fatal error in backfill:', err);
    process.exit(1);
});
