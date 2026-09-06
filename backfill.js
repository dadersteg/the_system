const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { getGoogleAccessToken } = require('/Users/daniel/Documents/AGY/the_system/src/ingestion/google_auth.js');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/daniel/Developer/the_system/.env' });

const BEEPER_API_URL = process.env.BEEPER_API_URL || 'http://localhost:23373';
const BEEPER_ACCESS_TOKEN = process.env.BEEPER_ACCESS_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const GMAIL_USER = process.env.GMAIL_USER;

const BACKFILL_HOURS = 48; // Backfill last 2 days

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
                if (filePath.startsWith('file://')) filePath = url.fileURLToPath(filePath);
                if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'base64');
            }
        }
    } catch (err) { }
    return null;
}

async function sendToGmail(compiledText, network, chatTitle, attachments = [], chatID = "") {
    if ((!compiledText || compiledText.trim() === '') && attachments.length === 0) return;
    const textToPrint = compiledText || "[Media Attached]";
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA');
    const subject = `[${network}] ${chatTitle} - ${todayDate}`;
    const formattedAttachments = attachments.map(att => ({
        filename: att.filename, mimeType: att.contentType, base64: att.content
    }));
    const threadString = `${network}-${chatTitle}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@beeper.bridge>`;

    const payload = {
        secret: "MOW_BRIDGE_SECRET_2026",
        to: GMAIL_USER,
        subject: Buffer.from(subject, 'utf-8').toString('base64'),
        body: Buffer.from(textToPrint, 'utf-8').toString('base64'),
        name: Buffer.from(`Backfill: ${chatTitle}`, 'utf-8').toString('base64'),
        references: deterministicId,
        attachments: formattedAttachments,
        chat_id: chatID,
        b64: true
    };
    
    const accessToken = await getGoogleAccessToken();
    await fetch(WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
        body: JSON.stringify(payload)
    });
}

async function runBackfill() {
    console.log("Fetching chats...");
    const chatRes = await fetch(`${BEEPER_API_URL}/v1/chats`, { headers: { 'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}` }});
    const chatData = await chatRes.json();
    const chats = chatData.items || chatData;
    
    const cutoffTime = Date.now() - BACKFILL_HOURS * 60 * 60 * 1000;

    for (const chat of chats) {
        const network = chat.network || (chat.id.includes('@whatsapp') ? 'WhatsApp' : 'Beeper');
        const chatTitle = chat.title || chat.id;

        const msgRes = await fetch(`${BEEPER_API_URL}/v1/chats/${encodeURIComponent(chat.id)}/messages?limit=50`, {
            headers: { 'Authorization': `Bearer ${BEEPER_ACCESS_TOKEN}` }
        });
        if (!msgRes.ok) continue;
        const msgs = await msgRes.json();
        
        let validMessages = [];
        let attachments = [];

        // Reverse to process chronologically
        for (const msg of msgs.reverse()) {
            const msgDate = new Date(msg.timestamp || msg.ts || Date.now());
            if (msgDate.getTime() < cutoffTime) continue; // Too old
            if (msg.isSender) continue; // Only backfill received messages

            const senderName = msg.senderName || "Unknown";
            const hours = String(msgDate.getHours()).padStart(2, '0');
            const minutes = String(msgDate.getMinutes()).padStart(2, '0');
            const currentTime = `${hours}:${minutes}`;

            let snippet = '';
            const cleanText = msg.text ? msg.text.replace(/<[^>]+>/g, '') : '';
            if (cleanText.trim() !== '') {
                snippet = `[${currentTime}] ${senderName}:\n${cleanText}`;
            } else if (msg.attachments && msg.attachments.length > 0) {
                snippet = `[${currentTime}] ${senderName}:\n[Media Attached]`;
            } else continue;
            
            validMessages.push(snippet);

            if (msg.attachments) {
                for (const att of msg.attachments) {
                    const b64 = await downloadAndGetBase64Attachment(att.url || att.srcURL);
                    if (b64) attachments.push({
                        filename: att.name || att.fileName || 'beeper_media.bin',
                        content: b64, contentType: att.mimeType || 'application/octet-stream'
                    });
                }
            }
        }

        if (validMessages.length > 0) {
            console.log(`Sending ${validMessages.length} messages for ${chatTitle}...`);
            await sendToGmail(validMessages.join('\n\n---\n\n'), network, chatTitle, attachments, chat.id);
        }
    }
    console.log("Backfill complete!");
}

runBackfill().catch(console.error);
