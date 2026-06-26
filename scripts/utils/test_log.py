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

service = build('sheets', 'v4', credentials=creds)
result = service.spreadsheets().values().get(spreadsheetId="13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY", range="Clerk - Drive Log!A:U").execute()
rows = result.get('values', [])
for row in rows[-20:]: # Last 20 rows
    if len(row) > 4:
        print(f"Date: {row[0]} | File: {row[4]} | Original Location: {row[12] if len(row) > 12 else 'N/A'}")
