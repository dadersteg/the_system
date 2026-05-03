const { Client, LocalAuth } = require('whatsapp-web.js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("CRITICAL ERROR: Please set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.");
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
});

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
    const subject = `[WhatsApp Recovery] ${threadName} - ${todayDate}`;

    const threadString = `${threadName}-${todayDate}-recovery`;
    const threadHash = crypto.createHash('md5').update(threadString, 'utf-8').digest('hex');
    const deterministicId = `<${threadHash}@whatsapp.bridge>`;

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
        console.log(`Forwarded recovered messages for [${threadName}] to Gmail.`);
    } catch (error) {
        console.error(`Failed to send email for ${threadName}:`, error);
    }
}

async function processHistoricalMessage(msg) {
    if (msg.isStatus || msg.from.includes('@newsletter')) return;

    try {
        const chat = await msg.getChat();
        let threadName = chat.isGroup ? chat.name : (chat.name || "Unknown");

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
