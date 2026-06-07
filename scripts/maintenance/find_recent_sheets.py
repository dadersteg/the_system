import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
    results = drive_service.files().list(q=query, fields="files(id, name)", orderBy="modifiedTime desc", pageSize=20).execute()
    for item in results.get('files', []):
        print(f"SHEET: {item['name']} -> {item['id']}")

if __name__ == '__main__':
    main()
