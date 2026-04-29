import os
import asyncio
from telethon import TelegramClient, events
import smtplib
import datetime
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, formatdate, make_msgid
from email.header import Header
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

def send_to_gmail(sender_name, message_text, thread_name):
    if not message_text:
        return # Skip empty messages (e.g., just a photo without a caption)
        
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
    
    # Add a timestamp and sender name to the body so it's readable when Gmail threads multiple messages together
    current_time = datetime.datetime.now().strftime("%H:%M")
    formatted_body = f"[{current_time}] {sender_name}:\n\n{message_text}"
    
    msg.attach(MIMEText(formatted_body, 'plain', 'utf-8'))
    
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"Forwarded message from {sender_name} to Gmail.")
    except Exception as e:
        print(f"Failed to send email: {e}")

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
    
    send_to_gmail(sender_name, event.raw_text, thread_name)

if __name__ == '__main__':
    print("Starting LOS Telegram Bridge...")
    print("Listening for incoming messages...")
    client.start()
    client.run_until_disconnected()
