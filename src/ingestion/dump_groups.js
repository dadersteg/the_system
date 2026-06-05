const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

const conn = net.createConnection(SOCKET_PATH, () => {
    conn.write(JSON.stringify({ action: 'export_recent_groups' }));
    conn.end();
});

let data = '';
conn.on('data', (chunk) => { data += chunk; });
conn.on('end', () => {
    try {
        const result = JSON.parse(data);
        if (result.success) {
            console.log("\n✅ Recent Groups You Sent Messages To:");
            result.data.forEach(g => {
                const date = new Date(g.timestamp * 1000).toLocaleString();
                const preview = g.body ? g.body.substring(0, 50).replace(/\n/g, ' ') : '[No Text]';
                const mediaStr = g.hasMedia ? '[Media] ' : '';
                console.log(`- [${date}] ${g.groupName} (${g.inviteUrl}): ${mediaStr}${preview}`);
            });
        } else {
            console.error("❌ Error:", result.error);
        }
    } catch (e) {
        console.error("Failed to parse response:", data);
    }
});
