import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    files_to_find = [
        "Task_Master_7_Day_Prompt.md",
        "Task_Master_28_Day_Prompt.md",
        "Task_Master_84_Day_Prompt.md",
        "Goals, habits and method logging",
        "old_LOS"
    ]

    for filename in files_to_find:
        query = f"name contains '{filename}' and trashed = false"
        try:
            results = drive_service.files().list(q=query, fields="files(id, name, mimeType)").execute()
            for item in results.get('files', []):
                print(f"FOUND: {item['name']} -> {item['id']} ({item['mimeType']})")
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == '__main__':
    main()
