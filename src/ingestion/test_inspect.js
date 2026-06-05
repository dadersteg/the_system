const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

const conn = net.createConnection(SOCKET_PATH, () => {
    conn.write(JSON.stringify({ 
        action: 'inspect_dms',
        searchLink: 'https://withjoy.com/card/VNKWU6EB3F'
    }));
    conn.end();
});

let data = '';
conn.on('data', (chunk) => { data += chunk; });
conn.on('end', () => {
    console.log(data);
});
