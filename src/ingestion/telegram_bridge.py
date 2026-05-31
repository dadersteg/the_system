import os
import asyncio
from telethon import TelegramClient, events
import smtplib
import datetime
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formataddr, formatdate, make_msgid
from email.header import Header
import mimetypes
import time
from dotenv import load_dotenv

load_dotenv() # Loads variables from the .env file

# --- GOOGLE OAUTH (required by Advanced Protection Program) ---
_cached_token = None
_token_expiry = 0

def get_access_token():
    """Returns a valid Google OAuth2 access token using clasp credentials."""
    global _cached_token, _token_expiry
    import json
    import urllib.request
    import urllib.parse
    
    # Return cached token if still valid (with 60s buffer)
    if _cached_token and time.time() < _token_expiry - 60:
        return _cached_token
    
    clasprc_path = os.path.expanduser('~/.clasprc.json')
    with open(clasprc_path) as f:
        clasprc = json.load(f)
    
    creds = clasprc.get('tokens', {}).get('default', {})
    if not creds.get('refresh_token'):
        raise Exception('No refresh token in ~/.clasprc.json. Run "npx clasp login" first.')
    
    data = urllib.parse.urlencode({
        'client_id': creds['client_id'],
        'client_secret': creds['client_secret'],
        'refresh_token': creds['refresh_token'],
        'grant_type': 'refresh_token'
    }).encode()
    
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        _cached_token = result['access_token']
        _token_expiry = time.time() + result.get('expires_in', 3600)
        return _cached_token

# 1. Telegram API Credentials
API_ID = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
SESSION_NAME = 'TS_telethon_session'

# 2. Ingestion Bridge Configuration
GMAIL_USER = os.environ.get('GMAIL_USER')
WEBAPP_URL = os.environ.get('WEBAPP_URL')

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

# --- BLOCKED THREADS ---
BLOCKED_THREADS = set()
try:
    with open(os.path.join(os.path.dirname(__file__), 'blocked_threads.json'), 'r') as f:
        import json
        blocked_data = json.load(f)
        BLOCKED_THREADS = set(t.lower() for t in blocked_data)
    print(f"Loaded {len(BLOCKED_THREADS)} blocked threads.")
except Exception as e:
    print("No blocked_threads.json found or invalid format.")

# --- BUFFERING LOGIC ---
message_buffer = {}
BUFFER_DELAY_SECONDS = 5 * 60

def send_to_gmail(compiled_text, thread_name, attachments=None, chat_id=""):
    if attachments is None:
        attachments = []
        
    if not compiled_text and not attachments:
        return 
        
    text_to_print = compiled_text if compiled_text else "[Media Attached]"
        
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    subject = f"[Telegram] {thread_name} - {today_date}"
    
    # Force Gmail to thread these messages by giving them a deterministic "References" header
    # based on the thread name and the date.
    thread_hash = hashlib.md5(f"{thread_name}-{today_date}".encode('utf-8')).hexdigest()
    deterministic_id = f"<{thread_hash}@telegram.bridge>"
    
    import urllib.request
    import urllib.parse
    import json
    import base64
    
    formatted_attachments = []
    for att in attachments:
        formatted_attachments.append({
            'filename': att['filename'],
            'mimeType': att['mimetype'],
            'base64': base64.b64encode(att['content']).decode('utf-8')
        })
        
    payload = {
        'secret': 'MOW_BRIDGE_SECRET_2026',
        'to': GMAIL_USER,
        'subject': base64.b64encode(subject.encode('utf-8')).decode('ascii'),
        'body': base64.b64encode(text_to_print.encode('utf-8')).decode('ascii'),
        'name': base64.b64encode(f"Telegram: {thread_name}".encode('utf-8')).decode('ascii'),
        'references': deterministic_id,
        'attachments': formatted_attachments,
        'chat_id': chat_id,
        'b64': True
    }
    
    try:
        access_token = get_access_token()
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(WEBAPP_URL, data=data, headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + access_token
        })
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            if result.get('success'):
                print(f"Forwarded buffered messages for [{thread_name}] to Webhook.")
            else:
                print(f"Webhook failed to send email: {result.get('error')}")
    except Exception as e:
        print(f"Failed to trigger Webhook: {e}")

async def flush_buffer(thread_name):
    await asyncio.sleep(BUFFER_DELAY_SECONDS)
    
    buffer_data = message_buffer.get(thread_name)
    if not buffer_data:
        return
        
    messages = buffer_data['messages']
    attachments = buffer_data.get('attachments', [])
    chat_id = buffer_data.get('chat_id', '')
    
    # Remove from active tracking immediately so new messages start a new buffer
    del message_buffer[thread_name]
    
    if not messages and not attachments:
        return
        
    compiled_text = "\n\n---\n\n".join(messages)
    
    # Run the synchronous email sending in an executor to avoid blocking the asyncio loop
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, send_to_gmail, compiled_text, thread_name, attachments, chat_id)

@client.on(events.NewMessage())
async def handler(event):
    # Skip broadcast channels (but allow normal groups)
    if event.is_channel and not event.is_group:
        return
        
    chat = await event.get_chat()
    
    # Determine the thread name (Group name or the Other Person's name)
    if getattr(chat, 'title', None): # It's a group chat
        thread_name = chat.title
    else: # It's a 1-on-1 chat
        first = getattr(chat, 'first_name', '') or ''
        last = getattr(chat, 'last_name', '') or ''
        thread_name = f"{first} {last}".strip() or getattr(chat, 'username', 'Unknown')
    
    # --- SMS RELAY DETECTION ---
    # When MacroDroid sends SMS via the Telegram bot (id 8624910336),
    # the message starts with "📱 [SMS] <number>". Use "SMS: <number>"
    # as the thread name so it appears correctly in Gmail.
    sender = await event.get_sender()
    is_sms_relay = False
    if sender and getattr(sender, 'bot', False) and sender.id == 8624910336:
        raw = event.raw_text or ''
        if raw.startswith('📱 [SMS]') or raw.startswith('[SMS]'):
            is_sms_relay = True
            # Extract the phone number from the first line
            first_line = raw.split('\n')[0]
            phone = first_line.replace('📱 [SMS]', '').replace('[SMS]', '').strip()
            thread_name = f"SMS: {phone}" if phone else "SMS Inbox"
        
    # Check if thread is blocked
    if thread_name.lower() in BLOCKED_THREADS:
        return
        
    # Determine the sender name
    if event.out:
        sender_name = "Me"
    else:
        sender = await event.get_sender()
        sender_name = "Unknown"
        if sender:
            first = getattr(sender, 'first_name', '') or ''
            last = getattr(sender, 'last_name', '') or ''
            sender_name = f"{first} {last}".strip() or getattr(sender, 'username', 'Unknown')
    
    message_text = event.raw_text
    attachments = []
    
    if event.message.media:
        try:
            media_bytes = await event.message.download_media(bytes)
            if media_bytes:
                filename = None
                mime_type = 'application/octet-stream'
                
                if hasattr(event.message.media, 'document'):
                    mime_type = event.message.media.document.mime_type
                    for attr in event.message.media.document.attributes:
                        if hasattr(attr, 'file_name'):
                            filename = attr.file_name
                            break
                elif hasattr(event.message.media, 'photo'):
                    mime_type = 'image/jpeg'
                    
                if not filename:
                    ext = mimetypes.guess_extension(mime_type) or '.bin'
                    filename = f"telegram_media{ext}"
                    
                attachments.append({
                    'filename': filename,
                    'content': media_bytes,
                    'mimetype': mime_type
                })
        except Exception as err:
            print(f"Failed to download media: {err}")

    if not message_text and not attachments:
        return # Skip completely empty
        
    current_time = datetime.datetime.now().strftime("%H:%M")
    if message_text:
        message_snippet = f"[{current_time}] {sender_name}:\n{message_text}"
    else:
        message_snippet = f"[{current_time}] {sender_name}:\n[Media Attached]"
    
    chat_id = phone if is_sms_relay else str(event.chat_id)

    if thread_name not in message_buffer:
        message_buffer[thread_name] = {
            'chat_id': chat_id,
            'messages': [],
            'attachments': [],
            'task': asyncio.create_task(flush_buffer(thread_name))
        }
        
    message_buffer[thread_name]['messages'].append(message_snippet)
    message_buffer[thread_name]['attachments'].extend(attachments)
    print(f"Buffered message for [{thread_name}] (Sending to Gmail in 5 mins...)")

if __name__ == '__main__':
    print("Starting LOS Telegram Bridge...")
    print("Listening for incoming messages...")
    client.start()
    client.run_until_disconnected()
