import os
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json')
    gmail_service = build('gmail', 'v1', credentials=creds)

    print("Fetching existing Gmail labels...")
    results = gmail_service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])
    
    for label in labels:
        # system labels usually have 'type': 'system'
        print(f"[{label.get('type', 'user')}] {label['name']} (ID: {label['id']})")

if __name__ == '__main__':
    main()
