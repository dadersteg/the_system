#!/usr/bin/env python3
"""
scripts/cleanup_instagram_folders.py
Description: Cleans up the legacy chat_exports_archive directory which contains
             the bulk Instagram folders, both locally and in Google Drive.
"""

import os
import sys
import shutil
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    print("Initializing Google Drive Client...")
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print(f"Error: Credentials file '{token_path}' not found. Please log in or generate token.json.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)

    workspace_root_id = "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc"
    print(f"Workspace Root ID: {workspace_root_id}")

    # 1. Find 'scratch' folder under workspace root
    scratch_id = None
    try:
        q_scratch = f"name = 'scratch' and '{workspace_root_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        res = drive_service.files().list(q=q_scratch, fields="files(id, name)").execute()
        files = res.get('files', [])
        if files:
            scratch_id = files[0]['id']
            print(f"Found 'scratch' folder in Drive. ID: {scratch_id}")
        else:
            print("Could not find 'scratch' folder in Drive.")
    except Exception as e:
        print(f"Error finding 'scratch' folder: {e}")

    # 2. Find 'chat_exports_archive' folder under 'scratch'
    archive_id = None
    if scratch_id:
        try:
            q_archive = f"name = 'chat_exports_archive' and '{scratch_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            res = drive_service.files().list(q=q_archive, fields="files(id, name)").execute()
            files = res.get('files', [])
            if files:
                archive_id = files[0]['id']
                print(f"Found 'chat_exports_archive' folder in Drive. ID: {archive_id}")
            else:
                print("Could not find 'chat_exports_archive' folder in Drive.")
        except Exception as e:
            print(f"Error finding 'chat_exports_archive' folder: {e}")

    # 3. Permanently delete 'chat_exports_archive' from Google Drive
    if archive_id:
        try:
            print(f"Deleting 'chat_exports_archive' (ID: {archive_id}) and all subfolders from Google Drive...")
            drive_service.files().delete(fileId=archive_id).execute()
            print("Successfully deleted 'chat_exports_archive' from Google Drive.")
        except Exception as e:
            print(f"Error deleting 'chat_exports_archive' from Google Drive: {e}")
    else:
        print("Skip Google Drive deletion (folder not found).")

    # 4. Delete locally
    local_path = os.path.abspath("scratch/chat_exports_archive")
    print(f"Local Path to delete: {local_path}")
    if os.path.exists(local_path):
        try:
            print(f"Deleting local folder recursively: {local_path}...")
            shutil.rmtree(local_path)
            print("Successfully deleted local chat_exports_archive folder.")
        except Exception as e:
            print(f"Error deleting local folder: {e}")
    else:
        print("Local folder already deleted / not found.")

    print("Cleanup run finished!")

if __name__ == '__main__':
    main()
