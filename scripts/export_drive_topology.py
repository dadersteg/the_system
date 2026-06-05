#!/usr/bin/env python3
"""
scripts/export_drive_topology.py
Description: Recursively traverse Google Drive starting from the target root folder 
             and log the folder topology to the "Drive 05 Folder Structure" sheet.
             This replaces the Google Apps Script version which timed out.
"""

import os
import json
import sys
from collections import defaultdict
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    print("Initializing Google Drive & Sheets Clients...")
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print(f"Error: Credentials file '{token_path}' not found. Please log in or generate token.json.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(
        token_path, 
        [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets'
        ]
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)
    sheets_service = build('sheets', 'v4', credentials=creds)

    print("Loading workspace manifest...")
    manifest_path = 'System_ID_Manifest.json'
    if not os.path.exists(manifest_path):
        print(f"Error: Manifest file '{manifest_path}' not found in current directory.")
        sys.exit(1)

    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    spreadsheet_id = manifest['spreadsheet']['id']
    target_tab_name = "Drive 05 Folder Structure"

    print("Resolving root folder (My Drive)...")
    try:
        root_folder = drive_service.files().get(
            fileId='root', 
            fields='id, name'
        ).execute()
        root_folder_id = root_folder['id']
        root_name = root_folder.get('name', 'My Drive')
    except Exception as e:
        print(f"Error fetching root folder metadata: {e}")
        sys.exit(1)

    print(f"Root Folder ID: {root_folder_id} (Resolved from 'root')")
    print(f"Root Folder Name: {root_name}")
    print(f"Spreadsheet ID: {spreadsheet_id}")

    # Fetch all active folders in a paged query (high performance)
    print("Fetching all folders from Google Drive...")
    folders = []
    page_token = None
    while True:
        try:
            response = drive_service.files().list(
                q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="nextPageToken, files(id, name, parents)",
                pageToken=page_token,
                pageSize=1000
            ).execute()
            
            page_folders = response.get('files', [])
            folders.extend(page_folders)
            print(f"Fetched {len(page_folders)} folders (total: {len(folders)})...")
            
            page_token = response.get('nextPageToken')
            if not page_token:
                break
        except Exception as e:
            print(f"Error listing folders: {e}")
            sys.exit(1)

    # Build maps for traversal
    print("Indexing folder structures...")
    folder_map = {f['id']: f for f in folders}
    children_map = defaultdict(list)
    for f in folders:
        parents = f.get('parents', [])
        for p in parents:
            children_map[p].append(f)

    # Prep output data
    headers = ["Depth", "Structure", "Folder ID", "Absolute Path"]
    output_data = [headers]
    output_data.append([0, root_name, root_folder_id, f"/{root_name}"])

    def should_ignore_folder(name):
        if not name:
            return True
        lower_name = name.lower()
        return (
            name.startswith('.') or
            lower_name == 'node_modules' or
            lower_name == 'tempmediastorage' or
            lower_name == 'ingestion'
        )

    # Recursive traversal in memory
    def traverse(parent_id, depth, current_path):
        children = children_map.get(parent_id, [])
        # Sort children alphabetically, case-insensitive
        sorted_children = sorted(children, key=lambda x: x.get('name', '').lower())
        
        for child in sorted_children:
            child_name = child.get('name', '')
            child_id = child.get('id')
            
            if should_ignore_folder(child_name):
                continue
                
            absolute_path = f"{current_path}/{child_name}"
            prefix = "│   " * (depth - 1) + "├── "
            structure = f"{prefix}{child_name}"
            
            output_data.append([depth, structure, child_id, absolute_path])
            traverse(child_id, depth + 1, absolute_path)

    print("Traversing folder tree...")
    traverse(root_folder_id, 1, f"/{root_name}")
    print(f"Mapping complete. Found {len(output_data) - 1} active folder nodes.")
    
    with open("drive_tree_L4.txt", "w") as f:
        for row in output_data[1:]:
            if row[0] <= 4:
                f.write(f"{row[1]}\n")
    print("Saved local preview to drive_tree_L4.txt.")

    # Write to sheet
    print(f"Clearing spreadsheet tab '{target_tab_name}'...")
    try:
        sheets_service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"'{target_tab_name}'",
            body={}
        ).execute()
        
        print(f"Writing structure to spreadsheet tab '{target_tab_name}'...")
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{target_tab_name}'!A1",
            valueInputOption='USER_ENTERED',
            body={'values': output_data}
        ).execute()
        
        print("Folder structure successfully updated!")
    except Exception as e:
        print(f"Error updating spreadsheet: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
