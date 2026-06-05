const net = require('net');

const SOCKET_PATH = '/tmp/wa_outbound.sock';

const client = net.createConnection({ path: SOCKET_PATH }, () => {
    console.log('Connected to IPC server.');
    client.write(JSON.stringify({ action: 'sync_missed_unknown', hours: 24 }));
});

let data = '';
client.on('data', (chunk) => {
    data += chunk.toString();
});

client.on('end', () => {
    console.log('Response:', data);
});

client.on('error', (err) => {
    console.error('Connection error:', err.message);
});
