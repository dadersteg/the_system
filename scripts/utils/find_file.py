import json
import os

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

with open(token_file, 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

service = build('drive', 'v3', credentials=creds)
results = service.files().list(q="name contains 'Work - 202606 Google Tasks.md'", fields="files(id, name, parents, shared, createdTime, modifiedTime)").execute()
for f in results.get('files', []):
    print(f)
