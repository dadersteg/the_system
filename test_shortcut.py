import json
import os
import time

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

# 1. Create a dummy file
file_metadata = {'name': 'Dummy Target File.txt', 'mimeType': 'text/plain'}
target_file = service.files().create(body=file_metadata, fields='id, name').execute()
target_id = target_file.get('id')

# 2. Create a shortcut to it
shortcut_metadata = {
    'name': 'Dummy Shortcut',
    'mimeType': 'application/vnd.google-apps.shortcut',
    'shortcutDetails': {'targetId': target_id}
}
shortcut = service.files().create(body=shortcut_metadata, fields='id, name').execute()
shortcut_id = shortcut.get('id')

# 3. Rename the shortcut
service.files().update(fileId=shortcut_id, body={'name': 'Renamed Shortcut'}).execute()

# 4. Check the target file name
target_check = service.files().get(fileId=target_id, fields='name').execute()

print(f"Target file name after shortcut rename: {target_check.get('name')}")

# Cleanup
service.files().delete(fileId=shortcut_id).execute()
service.files().delete(fileId=target_id).execute()
