import os
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

if os.path.exists('token.json'):
    creds = Credentials.from_authorized_user_file('token.json')
    drive_service = build('drive', 'v3', credentials=creds)
    file_id = '1zdLr14joq0kC345NCIBrHLFO0Sr5ugSo'
    try:
        file = drive_service.files().get(fileId=file_id, fields='name, trashed, mimeType').execute()
        print(f"File found: {file}")
    except Exception as e:
        print(f"Error getting file: {e}")
