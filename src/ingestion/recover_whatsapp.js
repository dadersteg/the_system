const { Client, LocalAuth } = require('whatsapp-web.js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { getAccessToken } = require('./google_auth');

// Load environment variables
dotenv.config();

const GMAIL_USER = process.env.GMAIL_USER;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!GMAIL_USER || !WEBAPP_URL) {
    console.error("CRITICAL ERROR: Please set GMAIL_USER and WEBAPP_URL in your .env file.");
    process.exit(1);
}

// --- BLOCKED THREADS ---
let blockedThreads = [];
try {
    const fs = require('fs');
    const blockedData = fs.readFileSync(__dirname + '/blocked_threads.json', 'utf8');
    blockedThreads = JSON.parse(blockedData).map(t => t.toLowerCase());
} catch (e) {
    console.log("No blocked_threads.json found or invalid format.");
}

// --- BUFFERING LOGIC ---
const messageBuffer = {};

async function flushAllBuffers() {
    console.log("\nFlushing all recovered messages to Gmail...");
    const threads = Object.keys(messageBuffer);
    
    for (const threadName of threads) {
        const buffer = messageBuffer[threadName];
        if (!buffer || (buffer.messages.length === 0 && buffer.attachments.length === 0)) continue;

        const compiledText = buffer.messages.join('\n\n---\n\n');
        await sendToGmail(compiledText, threadName, buffer.attachments);
        delete messageBuffer[threadName];
    }
    console.log("✅ All recovered messages sent to Gmail.");
    console.log("You can now restart the main whatsapp-bridge with PM2.");
    process.exit(0);
}

async function sendToGmail(compiledText, threadName, attachments = []) {
    if ((!compiledText || compiledText.trim() === '') && attachments.length === 0) return;

    const textToPrint = compiledText || "[Media Attached]";
    const now = new Date();
    const todayDate = now.toLocaleDateString('en-CA'); 
    const subject = `[WhatsApp] ${threadName} - ${todayDate}`;

    const formattedAttachments = attachments.map(att => ({
        filename: att.filename,
        mimeType: att.contentType,
        base64: att.content
    }));

    // Deterministic threading ID (same scheme as live bridge)
    const crypto = require('crypto');
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
        const result = await response.json();
        if (result.success) {
            console.log(`Forwarded recovered messages for [${threadName}] to Webhook.`);
        } else {
            console.error(`Webhook failed to send email for ${threadName}:`, result.error);
        }
    } catch (error) {
        console.error(`Failed to trigger Webhook for ${threadName}:`, error);
    }
}

async function processHistoricalMessage(msg) {
    if (msg.isStatus || msg.from.includes('@newsletter')) return;

    try {
        const chat = await msg.getChat();
        let threadName = chat.isGroup ? chat.name : (chat.name || "Unknown");

        // Check if thread is blocked
        if (blockedThreads.includes(threadName.toLowerCase())) {
            return;
        }

        let senderName = "Unknown";
        if (msg.fromMe) {
            senderName = "Me";
        } else {
            const contact = await msg.getContact();
            senderName = contact.name || contact.pushname || contact.number || "Unknown";
        }

        let attachments = [];
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.data) {
                    let filename = media.filename;
                    if (!filename) {
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
                console.log(`Could not download media for msg in ${threadName}`);
            }
        }

        const msgDate = new Date(msg.timestamp * 1000);
        const hours = String(msgDate.getHours()).padStart(2, '0');
        const minutes = String(msgDate.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        let messageSnippet = '';
        if (msg.body && msg.body.trim() !== '') {
            messageSnippet = `[${currentTime}] ${senderName}:\n${msg.body}`;
        } else if (attachments.length > 0) {
            messageSnippet = `[${currentTime}] ${senderName}:\n[Media Attached]`;
        } else {
            return;
        }

        if (!messageBuffer[threadName]) {
            messageBuffer[threadName] = { messages: [], attachments: [] };
        }

        messageBuffer[threadName].messages.push(messageSnippet);
        if (attachments.length > 0) {
            messageBuffer[threadName].attachments.push(...attachments);
        }
    } catch (err) {
        console.error("Error processing historical message:", err);
    }
}

// 3. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "TS_whatsapp_session" }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('ready', async () => {
    console.log('\n✅ Successfully connected to WhatsApp for Recovery.');
    
    // Get command line argument for hours, default to 11
    const hoursBack = parseInt(process.argv[2]) || 11;
    console.log(`Scanning for messages in the last ${hoursBack} hours...`);
    
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (hoursBack * 60 * 60);
    
    try {
        const chats = await client.getChats();
        console.log(`Found ${chats.length} chats. Processing...`);
        
        let messagesFound = 0;

        for (const chat of chats) {
            // Fetch the last 100 messages from each chat
            const messages = await chat.fetchMessages({ limit: 100 });
            
            for (const msg of messages) {
                if (msg.timestamp >= cutoffTimestamp) {
                    await processHistoricalMessage(msg);
                    messagesFound++;
                }
            }
        }
        
        console.log(`\nFound ${messagesFound} missed messages/files.`);
        if (messagesFound > 0) {
            await flushAllBuffers();
        } else {
            console.log("No messages found in that timeframe.");
            process.exit(0);
        }
        
    } catch (err) {
        console.error("Failed during recovery:", err);
        process.exit(1);
    }
});

console.log("Starting WhatsApp Recovery Script...");
client.initialize();
