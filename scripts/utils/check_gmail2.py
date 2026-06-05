import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('token.json')
service = build('gmail', 'v1', credentials=creds)

# Search broader
results = service.users().messages().list(userId='me', q='clerk', maxResults=5).execute()
messages = results.get('messages', [])
print(f"Found {len(messages)} 'clerk' emails.")
for msg in messages:
    m = service.users().messages().get(userId='me', id=msg['id']).execute()
    print("Snippet:", m.get('snippet'))

# Search for "summaries" or "summary"
results2 = service.users().messages().list(userId='me', q='subject:summary', maxResults=5).execute()
messages2 = results2.get('messages', [])
print(f"Found {len(messages2)} 'summary' emails.")
for msg in messages2:
    m = service.users().messages().get(userId='me', id=msg['id']).execute()
    print("Snippet:", m.get('snippet'))
