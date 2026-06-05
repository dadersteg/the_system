#!/usr/bin/env node
/**
 * 📤 WhatsApp Outbound Dispatcher (CLI)
 *
 * Thin CLI client that connects to the WhatsApp bridge's IPC socket
 * and dispatches an outbound message. Designed to be invoked by
 * Antigravity agents via `run_command` with SafeToAutoRun: false,
 * ensuring human approval before every message.
 *
 * Usage:
 *   node wa_send.js --to "Ludwig" --message "Hey, got the Q3 numbers?"
 *   node wa_send.js --to "Family Group" --group --message "Happy birthday!"
 *   node wa_send.js --contacts
 *
 * Exit codes:
 *   0 = success
 *   1 = dispatch error (contact not found, rate limit, daemon offline, etc.)
 */

const net = require('net');
const SOCKET_PATH = '/tmp/wa_outbound.sock';

// ---------------------------------------------------------------------------
// Argument parsing (zero dependencies)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const args = argv.slice(2);
    const parsed = { to: null, message: null, isGroup: false, contacts: false };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--to':
                parsed.to = args[++i];
                break;
            case '--message':
            case '-m':
                parsed.message = args[++i];
                break;
            case '--group':
            case '-g':
                parsed.isGroup = true;
                break;
            case '--contacts':
            case '-c':
                parsed.contacts = true;
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
            default:
                console.error(`Unknown argument: ${args[i]}`);
                printHelp();
                process.exit(1);
        }
    }

    return parsed;
}

function printHelp() {
    console.log(`
📤 WhatsApp Outbound Dispatcher

Usage:
  node wa_send.js --to "<name>" --message "<text>"    Send a message
  node wa_send.js --to "<name>" --group --message "<text>"  Send to a group
  node wa_send.js --contacts                          List available contacts

Options:
  --to, -t        Recipient name (contact or group)
  --message, -m   Message body text
  --group, -g     Treat --to as a group chat name
  --contacts, -c  List all available contacts
  --help, -h      Show this help
`);
}

// ---------------------------------------------------------------------------
// IPC communication with the daemon
// ---------------------------------------------------------------------------
function sendToSocket(payload) {
    return new Promise((resolve, reject) => {
        const conn = net.createConnection(SOCKET_PATH, () => {
            conn.write(JSON.stringify(payload));
            conn.end();
        });

        let data = '';
        conn.on('data', (chunk) => { data += chunk; });

        conn.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(new Error(`Invalid response from daemon: ${data}`));
            }
        });

        conn.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error(
                    'WhatsApp bridge is not running (socket not found).\n' +
                    'Start it with: pm2 restart whatsapp-bridge'
                ));
            } else if (err.code === 'ECONNREFUSED') {
                reject(new Error(
                    'WhatsApp bridge socket exists but connection refused.\n' +
                    'Try: pm2 restart whatsapp-bridge'
                ));
            } else {
                reject(err);
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const args = parseArgs(process.argv);

    if (args.contacts) {
        // List contacts mode
        const result = await sendToSocket({ action: 'contacts' });
        if (!result.success) {
            console.error(`❌ ${result.error}`);
            process.exit(1);
        }
        console.log(`\n📇 Available WhatsApp Contacts (${result.contacts.length}):\n`);
        result.contacts.forEach(c => {
            const display = c.name || c.pushname || 'Unknown';
            const extra = c.name && c.pushname && c.name !== c.pushname ? ` (${c.pushname})` : '';
            console.log(`  • ${display}${extra}`);
        });
        console.log('');
        process.exit(0);
    }

    // Send message mode
    if (!args.to || !args.message) {
        console.error('❌ Both --to and --message are required.');
        printHelp();
        process.exit(1);
    }

    console.log(`\n📤 Dispatching WhatsApp message...`);
    console.log(`   To:      ${args.to}${args.isGroup ? ' (group)' : ''}`);
    console.log(`   Message: ${args.message}\n`);

    const result = await sendToSocket({
        action: 'send',
        to: args.to,
        message: args.message,
        isGroup: args.isGroup
    });

    if (result.success) {
        console.log(`✅ Message sent to ${result.to}`);
        process.exit(0);
    } else {
        console.error(`❌ Failed: ${result.error}`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
});
