const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: "TS_whatsapp_session",
        dataPath: '/Users/daniel/.wwebjs_auth'
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('ready', async () => {
    console.log('Client ready. Counting messages from the last 48 hours...');
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const chats = await client.getChats();
    let count = 0;
    
    for (let chat of chats) {
        if (chat.isGroup) continue;
        if (chat.timestamp && chat.timestamp * 1000 < cutoff) continue;
        
        try {
            const messages = await chat.fetchMessages({ limit: 50 });
            for (let msg of messages) {
                if (msg.timestamp * 1000 > cutoff && !msg.fromMe) {
                    count++;
                }
            }
        } catch(e) {}
    }
    console.log(`Total messages in the last 48 hours: ${count}`);
    process.exit(0);
});

client.initialize();
