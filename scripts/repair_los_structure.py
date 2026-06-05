#!/usr/bin/env python3
"""
scripts/repair_los_structure.py
Description: Safe script to repair Google Drive folder structure:
             1. Rename Studies Archive from "03 00 99 Studies Archive" to "03 00 99 Archive".
             2. Consolidate duplicate physical archive folders under "99 00 00 Archive".
             3. Establish shortcuts in active L2 category folders pointing to the archives.
             4. Safely delete empty duplicate folders and orphan roots.
"""

import os
import sys
import re
import argparse
import socket
from collections import defaultdict
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Set global timeout to prevent connections from hanging indefinitely
socket.setdefaulttimeout(60)

# Target centralized archive root ID (99 00 00 Archive)
CENTRAL_ARCHIVE_ROOT_ID = "1nJFVZbiAWArdP6pU-RBdLrKkD0rlelwY"

# Target active roots
ACTIVE_ROOT_IDS = {
    "01 00 00 Private": "0B85__gYrQ-2Ud3JDY004TE4xYW8",
    "02 00 00 Work": "0B85__gYrQ-2USXRlV3RQSUd6RUk",
    "03 00 00 Studies": "0B85__gYrQ-2UcE5oeFhDRWg1YVE"
}

# Mapping of archive code -> L2 prefix to place the shortcut in
ARCHIVE_SHORTCUT_MAP = {
    "01 01 99": "01 01 00",  # Personal Admin
    "01 02 99": "01 02 00",  # Health
    "01 03 99": "01 03 00",  # Personal Growth
    "01 04 99": "01 04 00",  # Finances
    "01 05 99": "01 05 00",  # Other
    "02 01 99": "02 01 00",  # Employment
    "03 00 99": "03 00 00"   # Studies (directly under L1 root)
}

def main():
    parser = argparse.ArgumentParser(description="Clean up duplicate Drive folders and establish shortcuts.")
    parser.add_argument('--execute', action='store_true', help="Execute the moves/deletions (default is dry-run).")
    args = parser.parse_args()
    
    dry_run = not args.execute
    if dry_run:
        print("=== DRY RUN MODE: No modifications will be made ===")
    else:
        print("=== EXECUTION MODE: Changes will be made ===")

    print("Initializing Google Drive Client...")
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print(f"Error: Credentials file '{token_path}' not found.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)

    print("Resolving My Drive root ID...")
    try:
        root_folder = drive_service.files().get(fileId='root', fields='id').execute()
        root_id = root_folder['id']
    except Exception as e:
        print(f"Error fetching root folder metadata: {e}")
        sys.exit(1)

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
            folders.extend(response.get('files', []))
            page_token = response.get('nextPageToken')
            if not page_token:
                break
        except Exception as e:
            print(f"Error listing folders: {e}")
            sys.exit(1)

    print(f"Indexed {len(folders)} folders.")
    folder_map = {f['id']: f for f in folders}
    children_map = defaultdict(list)
    for f in folders:
        parents = f.get('parents', [])
        for p in parents:
            children_map[p].append(f)

    # 1. Inspect and Rename Studies Archive if needed
    print("\n1. Auditing Studies Archive folder name...")
    studies_archive_folder = None
    for fid, f in folder_map.items():
        if "03 00 99 Studies Archive" in f['name']:
            studies_archive_folder = f
            break

    if studies_archive_folder:
        old_name = studies_archive_folder['name']
        new_name = "03 00 99 Archive"
        print(f"  - Found studies archive folder: '{old_name}' (ID: {studies_archive_folder['id']})")
        if dry_run:
            print(f"  - [DRY-RUN] Would rename '{old_name}' to '{new_name}'")
        else:
            try:
                print(f"  - Renaming '{old_name}' to '{new_name}'...")
                drive_service.files().update(
                    fileId=studies_archive_folder['id'], 
                    body={'name': new_name}
                ).execute()
                print("  - Successfully renamed.")
                # Update in-memory map
                studies_archive_folder['name'] = new_name
            except Exception as e:
                print(f"  - Error renaming studies archive: {e}")
    else:
        print("  - '03 00 99 Studies Archive' folder not found (already renamed or deleted).")

    # 2. Determine Master Archive locations under 99 00 00 Archive
    print("\n2. Identifying Master Archive folders under '99 00 00 Archive'...")
    master_archives = {}  # code -> folder ID
    
    # Get direct children of central archive root
    archive_children = children_map.get(CENTRAL_ARCHIVE_ROOT_ID, [])
    
    for code in ARCHIVE_SHORTCUT_MAP.keys():
        # Look for child folder starting with the code prefix e.g., '01 01 99'
        master_folder = None
        for child in archive_children:
            if child['name'].startswith(code):
                master_folder = child
                break
                
        if master_folder:
            master_archives[code] = master_folder['id']
            print(f"  - Found Master '{code}' Archive: '{master_folder['name']}' (ID: {master_folder['id']})")
        else:
            # Need to create it under 99 00 00 Archive
            folder_name = f"{code} Archive"
            if dry_run:
                print(f"  - [DRY-RUN] Would create Master Archive folder '{folder_name}' under '99 00 00 Archive'")
                master_archives[code] = f"virtual_master_{code}"
            else:
                try:
                    print(f"  - Creating Master Archive folder '{folder_name}' under '99 00 00 Archive'...")
                    file_metadata = {
                        'name': folder_name,
                        'mimeType': 'application/vnd.google-apps.folder',
                        'parents': [CENTRAL_ARCHIVE_ROOT_ID]
                    }
                    new_folder = drive_service.files().create(body=file_metadata, fields='id').execute()
                    master_archives[code] = new_folder['id']
                    print(f"    * Created ID: {new_folder['id']}")
                    # Update local structures
                    new_node = {'id': new_folder['id'], 'name': folder_name, 'parents': [CENTRAL_ARCHIVE_ROOT_ID]}
                    folder_map[new_folder['id']] = new_node
                    children_map[CENTRAL_ARCHIVE_ROOT_ID].append(new_node)
                except Exception as e:
                    print(f"    * Error creating master folder '{folder_name}': {e}")

    # 3. Locate and merge duplicates/mismatched folders for each code
    print("\n3. Processing duplicates and merging content...")
    for code, master_id in master_archives.items():
        print(f"\nAnalyzing code '{code}' (Master ID: {master_id})...")
        
        # Find all physical folders matching the code in Drive
        duplicates = []
        for fid, f in folder_map.items():
            if f['name'].startswith(code) and fid != master_id:
                # Exclude the master ID
                duplicates.append(f)
                
        if not duplicates:
            print(f"  - No duplicate folders found for code '{code}'.")
            continue
            
        print(f"  - Found {len(duplicates)} duplicate/mismatched folder(s):")
        for dup in duplicates:
            print(f"    * Folder '{dup['name']}' (ID: {dup['id']})")
            
            # Find all files/folders inside the duplicate (handling pagination)
            dup_children = []
            page_token = None
            try:
                while True:
                    res = drive_service.files().list(
                        q=f"'{dup['id']}' in parents and trashed = false",
                        fields="nextPageToken, files(id, name, mimeType)",
                        pageToken=page_token,
                        pageSize=1000
                    ).execute()
                    dup_children.extend(res.get('files', []))
                    page_token = res.get('nextPageToken')
                    if not page_token:
                        break
            except Exception as e:
                print(f"      Error listing children of {dup['id']}: {e}")
                continue
                
            if dup_children:
                print(f"      Contains {len(dup_children)} item(s) to move:")
                for item in dup_children:
                    print(f"        * Moving '{item['name']}' ({item['id']})...")
                    if dry_run:
                        print(f"          [DRY-RUN] Would move to Master ID: {master_id}")
                    else:
                        try:
                            drive_service.files().update(
                                fileId=item['id'],
                                addParents=master_id,
                                removeParents=dup['id']
                            ).execute()
                            print("          Moved successfully.")
                        except Exception as e:
                            print(f"          Error moving item: {e}")
            else:
                print("      Folder is already empty.")
                
            # Safely delete the empty duplicate folder
            if dry_run:
                print(f"      [DRY-RUN] Would delete empty duplicate folder: '{dup['name']}' ({dup['id']})")
            else:
                try:
                    # Double-check it has no active children left
                    chk = drive_service.files().list(q=f"'{dup['id']}' in parents and trashed = false").execute()
                    if not chk.get('files', []):
                        print(f"      Deleting empty folder '{dup['name']}'...")
                        drive_service.files().delete(fileId=dup['id']).execute()
                        print("      Deleted successfully.")
                    else:
                        print(f"      Skipping deletion of '{dup['name']}' because it is not empty.")
                except Exception as e:
                    print(f"      Error deleting folder: {e}")

    # 4. Establish Active-Branch Shortcuts pointing to Master Archives
    print("\n4. Establishing shortcuts in active category branches...")
    for code, master_id in master_archives.items():
        active_prefix = ARCHIVE_SHORTCUT_MAP[code]
        print(f"\nArchive '{code}' -> Active Parent Prefix '{active_prefix}'")
        
        # Find active L2 parent folder ID dynamically
        active_parent_id = None
        for fid, f in folder_map.items():
            if f['name'].startswith(active_prefix):
                active_parent_id = fid
                break
                
        if not active_parent_id:
            print(f"  - Active parent folder starting with '{active_prefix}' not found. Skipping.")
            continue
            
        print(f"  - Active Parent resolved: '{folder_map[active_parent_id]['name']}' (ID: {active_parent_id})")
        
        # Check if there is already a shortcut or folder in this active parent pointing to the archive
        active_children = []
        try:
            res = drive_service.files().list(
                q=f"'{active_parent_id}' in parents and trashed = false",
                fields="files(id, name, mimeType, shortcutDetails)"
            ).execute()
            active_children = res.get('files', [])
        except Exception as e:
            print(f"  - Error listing children of active parent: {e}")
            continue

        shortcut_exists = False
        physical_folder_to_delete = None
        
        shortcut_name = f"{code} Archive"
        
        # Search for shortcut or physical folder
        for child in active_children:
            if child['name'].startswith(code) or child['name'].endswith("Archive"):
                if child.get('mimeType') == 'application/vnd.google-apps.shortcut':
                    target = child.get('shortcutDetails', {}).get('targetId')
                    if target == master_id:
                        shortcut_exists = True
                        print("  - Shortcut already exists and points to the correct master.")
                        break
                elif child.get('mimeType') == 'application/vnd.google-apps.folder':
                    # Physical folder
                    physical_folder_to_delete = child
                    
        if shortcut_exists:
            continue
            
        # If there's a physical folder in active parent, delete it (its content was already merged in step 3)
        if physical_folder_to_delete:
            if dry_run:
                print(f"  - [DRY-RUN] Would delete physical duplicate archive folder inside active parent: '{physical_folder_to_delete['name']}' ({physical_folder_to_delete['id']})")
            else:
                try:
                    # Double-check it is empty
                    chk = drive_service.files().list(q=f"'{physical_folder_to_delete['id']}' in parents and trashed = false").execute()
                    if not chk.get('files', []):
                        print(f"  - Deleting empty physical folder '{physical_folder_to_delete['name']}'...")
                        drive_service.files().delete(fileId=physical_folder_to_delete['id']).execute()
                        print("  - Deleted successfully.")
                    else:
                        print(f"  - Skipping deletion of '{physical_folder_to_delete['name']}' as it still contains files.")
                except Exception as e:
                    print(f"  - Error deleting physical folder: {e}")

        # Create Shortcut pointing to master
        if dry_run:
            print(f"  - [DRY-RUN] Would create Shortcut '{shortcut_name}' in active parent pointing to ID {master_id}")
        else:
            try:
                print(f"  - Creating Shortcut '{shortcut_name}' in active parent...")
                shortcut_metadata = {
                    'name': shortcut_name,
                    'mimeType': 'application/vnd.google-apps.shortcut',
                    'parents': [active_parent_id],
                    'shortcutDetails': {
                        'targetId': master_id
                    }
                }
                shortcut = drive_service.files().create(body=shortcut_metadata).execute()
                print(f"    * Shortcut Created ID: {shortcut.get('id')}")
            except Exception as e:
                print(f"    * Error creating shortcut: {e}")

    # 5. Clean up orphan roots
    print("\n5. Auditing duplicate roots in My Drive...")
    # Root folders starting with "01 00 00" or "02 00 00" or "03 00 00"
    for prefix, correct_id in ACTIVE_ROOT_IDS.items():
        duplicates = []
        name_code = prefix.split()[0] # e.g. "01"
        
        for fid, f in folder_map.items():
            if f['name'].startswith(name_code) and fid != correct_id:
                # Direct child of My Drive
                parents = f.get('parents', [])
                if parents and parents[0] == root_id:
                    duplicates.append(f)
                    
        for dup in duplicates:
            print(f"  - Found duplicate root folder: '{dup['name']}' (ID: {dup['id']})")
            # List contents
            chk = []
            try:
                res = drive_service.files().list(q=f"'{dup['id']}' in parents and trashed = false").execute()
                chk = res.get('files', [])
            except:
                pass
                
            if not chk:
                if dry_run:
                    print(f"    * [DRY-RUN] Would delete empty duplicate root folder: '{dup['name']}' ({dup['id']})")
                else:
                    try:
                        print(f"    * Deleting empty duplicate root folder '{dup['name']}'...")
                        drive_service.files().delete(fileId=dup['id']).execute()
                        print("      Deleted successfully.")
                    except Exception as e:
                        print(f"      Error deleting: {e}")
            else:
                print(f"    * Warning: Duplicate root is not empty! Contains: {[c['name'] for c in chk]}")

    print("\nLOS structure audit and cleanup sequence complete!")

if __name__ == '__main__':
    main()
