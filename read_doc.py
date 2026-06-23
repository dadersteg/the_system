import json
import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

with open("auth/token.json", 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

drive_service = build('drive', 'v3', credentials=creds)
request = drive_service.files().get_media(fileId="12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW")
content = request.execute().decode('utf-8')
print("---CONTENT_START---")
print(content[:500])
print("...")
print(content[-500:])
print("---CONTENT_END---")
