import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    ids_to_trash = [
        "1zij1xDdvwLPKSaXt71CWQP6WdrQpo4YE",
        "1AfOCE1u4SAHW8GnStvJpIBCtzDgj_73s"
    ]

    for f_id in ids_to_trash:
        try:
            drive_service.files().update(fileId=f_id, body={'trashed': True}).execute()
            print(f"Successfully trashed ID: {f_id}")
        except Exception as e:
            print(f"Failed to trash ID {f_id}: {e}")

if __name__ == '__main__':
    main()
