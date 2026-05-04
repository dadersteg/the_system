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
from dotenv import load_dotenv

load_dotenv() # Loads variables from the .env file

# 1. Telegram API Credentials
API_ID = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
SESSION_NAME = 'TS_telethon_session'

# 2. Gmail Credentials
GMAIL_USER = os.environ.get('GMAIL_USER')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD')

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

# --- BUFFERING LOGIC ---
message_buffer = {}
BUFFER_DELAY_SECONDS = 5 * 60

def send_to_gmail(compiled_text, thread_name, attachments=None):
    if attachments is None:
        attachments = []
        
    if not compiled_text and not attachments:
        return 
        
    text_to_print = compiled_text if compiled_text else "[Media Attached]"
        
    msg = MIMEMultipart()
    
    # Properly encode the display name to support Swedish characters (å, ä, ö)
    display_name = f"Telegram: {thread_name}"
    msg['From'] = formataddr((str(Header(display_name, 'utf-8')), GMAIL_USER))
    msg['To'] = GMAIL_USER
    
    # Add standard email headers to prevent Gmail from flagging this as spam
    msg['Date'] = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid()
    
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    msg['Subject'] = f"[Telegram] {thread_name} - {today_date}"
    
    # Force Gmail to thread these messages by giving them a deterministic "References" header
    # based on the thread name and the date.
    thread_hash = hashlib.md5(f"{thread_name}-{today_date}".encode('utf-8')).hexdigest()
    deterministic_id = f"<{thread_hash}@telegram.bridge>"
    msg['References'] = deterministic_id
    msg['In-Reply-To'] = deterministic_id
    
    msg.attach(MIMEText(text_to_print, 'plain', 'utf-8'))
    
    for att in attachments:
        maintype, subtype = ('application', 'octet-stream')
        if att.get('mimetype') and '/' in att['mimetype']:
            maintype, subtype = att['mimetype'].split('/', 1)
            
        part = MIMEBase(maintype, subtype)
        part.set_payload(att['content'])
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f"attachment; filename=\"{att['filename']}\"")
        msg.attach(part)
    
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"Forwarded buffered messages for [{thread_name}] to Gmail.")
    except Exception as e:
        print(f"Failed to send email: {e}")

async def flush_buffer(thread_name):
    await asyncio.sleep(BUFFER_DELAY_SECONDS)
    
    buffer_data = message_buffer.get(thread_name)
    if not buffer_data:
        return
        
    messages = buffer_data['messages']
    attachments = buffer_data.get('attachments', [])
    
    # Remove from active tracking immediately so new messages start a new buffer
    del message_buffer[thread_name]
    
    if not messages and not attachments:
        return
        
    compiled_text = "\n\n---\n\n".join(messages)
    
    # Run the synchronous email sending in an executor to avoid blocking the asyncio loop
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, send_to_gmail, compiled_text, thread_name, attachments)

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
    
    if thread_name not in message_buffer:
        message_buffer[thread_name] = {
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
