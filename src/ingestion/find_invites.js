const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

const conn = net.createConnection(SOCKET_PATH, () => {
    conn.write(JSON.stringify({ 
        action: 'find_wedding_invites',
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
            console.log("\n✅ Groups containing the Save the Date link:");
            if (result.data.length === 0) {
                console.log("No groups found with that link in recent messages.");
            } else {
                result.data.forEach(g => {
                    const date = new Date(g.timestamp * 1000).toLocaleString();
                    console.log(`- [${date}] ${g.groupName} (${g.inviteUrl})`);
                });
            }
        } else {
            console.error("❌ Error:", result.error);
        }
    } catch (e) {
        console.error("Failed to parse response:", data);
    }
});
