const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// 1. Gmail Credentials
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("CRITICAL ERROR: Please set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.");
    process.exit(1);
}

// 2. Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
    }
});

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
    await sendToGmail(compiledText, threadName, buffer.attachments);
}

/**
 * Sends a batch of messages to Gmail using the strict threading logic required by the LOS Triage Gateway.
 */
async function sendToGmail(compiledText, threadName, attachments = []) {
    if ((!compiledText || compiledText.trim() === '') && attachments.length === 0) {
        return; // Skip empty
    }

    const textToPrint = compiledText || "[Media Attached]";

    // Determine current date/time in local timezone
    const now = new Date();
    // Use local Date to match YYYY-MM-DD
    const todayDate = now.toLocaleDateString('en-CA'); 
    
    const subject = `[WhatsApp] ${threadName} - ${todayDate}`;

    // Force Gmail to thread these messages by giving them a deterministic "References" header
    // based on the thread name and the date.
    const threadString = `${threadName}-${todayDate}`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@whatsapp.bridge>`;

    // UTF-8 encoding is handled natively by nodemailer
    const mailOptions = {
        from: `"WhatsApp: ${threadName}" <${GMAIL_USER}>`,
        to: GMAIL_USER,
        subject: subject,
        text: textToPrint,
        messageId: `<${crypto.randomBytes(16).toString('hex')}@whatsapp.bridge>`, 
        references: deterministicId, 
        inReplyTo: deterministicId,  
        attachments: attachments
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Forwarded buffered messages for [${threadName}] to Gmail.`);
    } catch (error) {
        console.error(`Failed to send email:`, error);
    }
}

// 3. Initialize the WhatsApp Headless Client
// We use LocalAuth to ensure the session is saved locally, so you only scan the QR code once.
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "TS_whatsapp_session" }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
client.on('ready', () => {
    console.log('\n✅ Successfully connected to WhatsApp.');
    console.log('Starting LOS WhatsApp Bridge...');
    console.log('Listening for incoming and outgoing messages in the background...\n');
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
            threadName = chat.name || "Unknown";
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
client.initialize();
