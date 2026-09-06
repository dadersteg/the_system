from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import os

token_path = '/Users/daniel/Documents/AGY/the_system/auth/token.json'
creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
drive_service = build('drive', 'v3', credentials=creds)

results = drive_service.files().list(q="trashed=true and mimeType='application/vnd.google-apps.folder'", fields="files(id, name, trashed, parents)").execute()
files = results.get('files', [])

if not files:
    print("No trashed folders found.")
else:
    for f in files:
        print(f"Trashed folder: {f['name']} (ID: {f['id']})")
