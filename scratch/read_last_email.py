import imaplib
import email
from email.header import decode_header
import os
from dotenv import load_dotenv

load_dotenv('.env')

username = os.environ.get('GMAIL_USER')
password = os.environ.get('GMAIL_APP_PASSWORD')

mail = imaplib.IMAP4_SSL("imap.gmail.com")
mail.login(username, password)
mail.select("inbox")

status, messages = mail.search(None, '(SUBJECT "[Telegram]")')
if status == "OK":
    email_ids = messages[0].split()
    if email_ids:
        latest_email_id = email_ids[-1]
        status, msg_data = mail.fetch(latest_email_id, "(RFC822)")
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                subject, encoding = decode_header(msg["Subject"])[0]
                if isinstance(subject, bytes):
                    subject = subject.decode(encoding if encoding else 'utf-8')
                print("--- LATEST EMAIL ---")
                print("Subject:", subject)
                print("From:", msg.get("From"))
                print("Date:", msg.get("Date"))
                print("\nBody:")
                
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            print(part.get_payload(decode=True).decode())
                else:
                    print(msg.get_payload(decode=True).decode())
                print("--------------------")
    else:
        print("No emails found.")
else:
    print("Search failed.")
mail.logout()
