import os
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def check_gmail_token():
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json')
        service = build('gmail', 'v1', credentials=creds)
        results = service.users().messages().list(userId='me', q='clerk newer_than:7d').execute()
        messages = results.get('messages', [])
        print(f"Found {len(messages)} clerk emails.")
        for msg in messages:
            m = service.users().messages().get(userId='me', id=msg['id']).execute()
            print("Snippet:", m.get('snippet'))

if __name__ == '__main__':
    check_gmail_token()
