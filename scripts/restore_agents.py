from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import os

# Check if token exists
token_path = '/Users/daniel/Documents/AGY/the_system/auth/token.json'
if not os.path.exists(token_path):
    print("Token not found at", token_path)
    exit(1)

creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
drive_service = build('drive', 'v3', credentials=creds)

results = drive_service.files().list(q="name contains 'macgyver' or name contains 'ortelius' or name contains 'reflection'", fields="files(id, name, trashed, parents)").execute()
files = results.get('files', [])

if not files:
    print("No .agents folder found in trash.")
else:
    for f in files:
        print(f"Restoring {f['name']} (ID: {f['id']})")
        drive_service.files().update(fileId=f['id'], body={'trashed': False}).execute()
        print("Restored!")
