from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)
    
    # Search for "TS - Task Master - Daily Prompt.md"
    results = drive_service.files().list(
        q="name = 'TS - Task Master - Daily Prompt.md' and trashed = false",
        fields="files(id, name)"
    ).execute()
    
    files = results.get('files', [])
    print(f"Found {len(files)} files:")
    for f in files:
        print(f"{f['name']}: {f['id']}")

if __name__ == '__main__':
    main()
