import os
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print(f"Error: {token_path} not found.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    def get_folder_by_name(name, parent_id=None):
        q = f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        if parent_id:
            q += f" and '{parent_id}' in parents"
        res = drive_service.files().list(q=q, fields="files(id, name)").execute()
        return res.get('files', [])

    # 1. Rename CMA
    print("Searching for 'CMA' folder...")
    cma_folders = get_folder_by_name("CMA")
    if not cma_folders:
        print("No 'CMA' folder found.")
    else:
        for f in cma_folders:
            print(f"Renaming CMA (ID: {f['id']}) to Carry Martens Adersteg...")
            drive_service.files().update(fileId=f['id'], body={'name': 'Carry Martens Adersteg'}).execute()
            print("Successfully renamed.")

    # 2. Migrate 2019 Tax files
    print("Searching for '2019' tax folder...")
    old_tax = get_folder_by_name("2019")
    new_tax = get_folder_by_name("19/20 UK Taxes")
    
    if old_tax and new_tax:
        old_id = old_tax[0]['id']
        new_id = new_tax[0]['id']
        print(f"Found '2019' ({old_id}) and '19/20 UK Taxes' ({new_id}).")
        
        # Get files inside 2019
        q = f"'{old_id}' in parents and trashed = false"
        files = drive_service.files().list(q=q, fields="files(id, name, parents)").execute().get('files', [])
        
        for f in files:
            print(f"Moving file '{f['name']}' to 19/20 UK Taxes...")
            drive_service.files().update(
                fileId=f['id'],
                addParents=new_id,
                removeParents=old_id
            ).execute()
        
        print("Trashing empty 2019 folder...")
        drive_service.files().update(fileId=old_id, body={'trashed': True}).execute()
        print("Cleanup complete.")
    else:
        print("Could not find both '2019' and '19/20 UK Taxes' folders.")

if __name__ == '__main__':
    main()
