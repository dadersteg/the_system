const fetch = require('node-fetch');
const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const GMAIL_USER = process.env.GMAIL_USER;
const WEBAPP_URL = process.env.WEBAPP_URL;
const BEEPER_ACCESS_TOKEN = process.env.BEEPER_ACCESS_TOKEN;
const BEEPER_API_URL = process.env.BEEPER_API_URL || 'http://localhost:23373';

const TIME_LIMIT = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

let cachedGoogleToken = null;
let googleTokenExpiry = 0;

async function getGoogleAccessToken() {
    if (cachedGoogleToken && Date.now() < googleTokenExpiry - 60000) {
        return cachedGoogleToken;
    }

    const clasprcPath = path.join(os.homedir(), '.clasprc.json');
    if (!fs.existsSync(clasprcPath)) {
        throw new Error(`clasp credentials file not found at ${clasprcPath}`);
    }

    const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
    const creds = clasprc?.tokens?.default;
    
    // We must use standard node fetch since this is node 20+ env, but we required node-fetch earlier. 
    // Wait, let's just use global fetch since node >= 18 supports it natively.
    const res = await globalThis.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token'
        })
    });

    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    cachedGoogleToken = result.access_token;
    googleTokenExpiry = Date.now() + (result.expires_in * 1000);
    return cachedGoogleToken;
}

async function sendToGmail(compiledText, network, chatTitle, chatID) {
    if (!compiledText || compiledText.trim() === '') return;

    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA');
    const subject = `[${network}] ${chatTitle} - ${todayDate}`;

    const threadString = `${network}-${chatTitle}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@beeper.bridge>`;

    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: Buffer.from(subject, 'utf-8').toString('base64'),
        body: Buffer.from(compiledText, 'utf-8').toString('base64'),
        name: Buffer.from(`${network}: ${chatTitle}`, 'utf-8').toString('base64'),
        references: deterministicId,
        attachments: [],
        chat_id: chatID,
        b64: true
    };

    const accessToken = await getGoogleAccessToken();
    const response = await globalThis.fetch(WEBAPP_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { return; }

    if (result.success) {
        console.log(`Forwarded Retro Beeper [${network} / ${chatTitle}] messages to Gmail.`);
    } else {
        console.error(`Webhook failed to send email:`, result.error);
    }
}

async function getChats() {
    const res = await globalThis.fetch(`${BEEPER_API_URL}/v1/chats?limit=100`, { 
        headers: { 'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
}

async function getMessages(chatID) {
    // Beeper API usually supports fetching messages
    const res = await globalThis.fetch(`${BEEPER_API_URL}/v1/chats/${encodeURIComponent(chatID)}/messages?limit=100`, { 
        headers: { 'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || data || [];
}

async function runImport() {
    console.log("Starting retro import for ALL networks...");
    const chats = await getChats();
    
    for (const chat of chats) {
        const chatLastActivity = new Date(chat.lastActivity);
        if (chatLastActivity < TIME_LIMIT) continue; // Skip inactive chats
        
        console.log(`Processing ${chat.network} chat: ${chat.title}`);
        const messages = await getMessages(chat.id);
        
        // Filter messages in the last 2 hours
        const recentMessages = messages.filter(msg => {
            const msgTime = new Date(msg.timestamp || msg.ts || 0);
            return msgTime >= TIME_LIMIT;
        });
        
        if (recentMessages.length === 0) continue;
        
        // Sort oldest to newest
        recentMessages.sort((a, b) => new Date(a.timestamp || a.ts || 0) - new Date(b.timestamp || b.ts || 0));
        
        let compiledText = '';
        for (const msg of recentMessages) {
            const senderName = msg.senderName || msg.from?.name || (msg.isSender ? "Me" : "Unknown");
            const msgDate = new Date(msg.timestamp || msg.ts || 0);
            const hours = String(msgDate.getHours()).padStart(2, '0');
            const minutes = String(msgDate.getMinutes()).padStart(2, '0');
            
            const text = msg.text || (msg.attachments?.length > 0 ? "[Media Attached]" : "");
            if (!text) continue;
            
            compiledText += `[${hours}:${minutes}] ${senderName}:\n${text}\n\n---\n\n`;
        }
        
        if (compiledText.trim()) {
            await sendToGmail(compiledText, chat.network, chat.title, chat.id);
        }
    }
    console.log("Retro import completed.");
}

runImport().catch(console.error);
