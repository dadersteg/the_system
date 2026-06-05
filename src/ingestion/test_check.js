const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

const conn = net.createConnection(SOCKET_PATH, () => {
    conn.write(JSON.stringify({ action: 'check_sent', to: '+447712345678' })); // Just a dummy test
    conn.end();
});

let data = '';
conn.on('data', (chunk) => { data += chunk; });
conn.on('end', () => {
    console.log("Response:", data);
});
