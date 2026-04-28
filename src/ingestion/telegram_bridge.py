import os
import asyncio
from telethon import TelegramClient, events
import smtplib
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

def send_to_gmail(sender_name, message_text):
    if not message_text:
        return # Skip empty messages (e.g., just a photo without a caption)
        
    msg = MIMEMultipart()
    # Change the display name so it looks like it came from the Telegram sender
    msg['From'] = f"Telegram: {sender_name} <{GMAIL_USER}>"
    msg['To'] = GMAIL_USER
    
    # Using exactly the same subject line ensures Gmail threads all messages 
    # from this person on this day into a single conversation.
    today_date = datetime.datetime.now().strftime("%Y-%m-%d")
    msg['Subject'] = f"[LOS Telegram] {sender_name} - {today_date}"
    
    msg.attach(MIMEText(message_text, 'plain'))
    
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"Forwarded message from {sender_name} to Gmail.")
    except Exception as e:
        print(f"Failed to send email: {e}")

@client.on(events.NewMessage(incoming=True))
async def handler(event):
    # Skip broadcast channels or massive public groups
    if event.is_channel:
        return
        
    sender = await event.get_sender()
    # Extract First and Last name for threading
    sender_name = "Unknown"
    if sender:
        first = getattr(sender, 'first_name', '') or ''
        last = getattr(sender, 'last_name', '') or ''
        sender_name = f"{first} {last}".strip()
        if not sender_name:
            sender_name = getattr(sender, 'username', 'Unknown')
    
    send_to_gmail(sender_name, event.raw_text)

if __name__ == '__main__':
    print("Starting LOS Telegram Bridge...")
    print("Listening for incoming messages...")
    client.start()
    client.run_until_disconnected()
