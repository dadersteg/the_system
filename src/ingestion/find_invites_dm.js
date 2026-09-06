const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

const conn = net.createConnection(SOCKET_PATH, () => {
    conn.write(JSON.stringify({ 
        action: 'find_wedding_invites_dm',
        searchLink: 'https://withjoy.com/card/VNKWU6EB3F'
    }));
    conn.end();
});

let data = '';
conn.on('data', (chunk) => { data += chunk; });
conn.on('end', () => {
    try {
        const result = JSON.parse(data);
        if (result.success) {
            console.log("URL\tContact Name");
            if (result.data.length === 0) {
                console.log("No DMs found with that link in recent messages.");
            } else {
                result.data.forEach(g => {
                    console.log(`${g.waUrl}\t${g.contactName}`);
                });
            }
        } else {
            console.error("❌ Error:", result.error);
        }
    } catch (e) {
        console.error("Failed to parse response:", data);
    }
});
