#!/usr/bin/env python3
"""
run_filename_retro.py
Dry-run / Retro-update script to transition Google Drive files from the old
Identifier Prefix format to the simplified YYYYMM - [Descriptive Name] format.
Now includes fallback logic for unstructured files missing Clerk tags.
"""

import os
import re
import csv
import argparse
from datetime import datetime, timedelta, timezone
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    parser = argparse.ArgumentParser(description="Retro-update Google Drive filenames.")
    parser.add_argument('--execute', action='store_true', help="Actually execute the renames on Google Drive.")
    parser.add_argument('--limit', type=int, default=None, help="Limit the number of files to process.")
    parser.add_argument('--months-old', type=int, default=None, help="Only process files created more than X months ago.")
    parser.add_argument('--force-all', action='store_true', help="Process untagged unstructured files as well.")
    args = parser.parse_args()

    # Authenticate
    token_path = os.path.join(os.path.dirname(__file__), '..', '..', 'auth', 'token_drive.json')
    if not os.path.exists(token_path):
        print(f"Token file not found at {token_path}")
        return

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    # Build Query
    query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false"
    if args.months_old:
        threshold_date = datetime.now(timezone.utc) - timedelta(days=args.months_old * 30)
        formatted_date = threshold_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        query += f" and createdTime <= '{formatted_date}'"
        print(f"Filtering for files older than {args.months_old} months (created before {formatted_date}).")
    
    print("Fetching folders to build path cache...")
    folders = {}
    page_token = None
    while True:
        results = drive_service.files().list(
            q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields="nextPageToken, files(id, name, parents)",
            pageToken=page_token,
            pageSize=1000,
            corpora='allDrives',
            includeItemsFromAllDrives=True,
            supportsAllDrives=True
        ).execute()
        for f in results.get('files', []):
            folders[f['id']] = f
        page_token = results.get('nextPageToken')
        if not page_token:
            break

    def get_full_path(file):
        parents = file.get('parents')
        if not parents:
            return 'Root'
        path_parts = []
        current_id = parents[0]
        while current_id in folders:
            path_parts.insert(0, folders[current_id]['name'])
            parents = folders[current_id].get('parents')
            if parents:
                current_id = parents[0]
            else:
                break
        if not path_parts: return 'Unknown'
        return ' / '.join(path_parts)

    print("Fetching files from Google Drive... This may take a moment.")
    
    renames = []
    page_token = None
    
    # Modern pattern we want to skip
    pattern_modern = re.compile(r'^(\d{6})\s+-\s+(.+)$')

    # Regex 1: Text-First Identifier (e.g. Health - 202604 Dentist Receipt.pdf)
    pattern1 = re.compile(r'^(.+?)\s+-\s+(\d{4,6})\s+(.+?)(\.[a-zA-Z0-9]+)?$')
    
    # Regex 2: Date-First Identifier (e.g. 201911 Revolut - Employment Contract.pdf)
    pattern2 = re.compile(r'^(\d{4,6})\s+(.+?)\s+-\s+(.+?)(\.[a-zA-Z0-9]+)?$')

    # Fallback Date extractors for unstructured filenames
    regex_strict_date = re.compile(r'(20\d{2})[-.]?(0[1-9]|1[0-2])[-.]?([0-2]\d|3[01])')
    regex_yyyymm = re.compile(r'(20\d{2})(0[1-9]|1[0-2])')
    regex_yyyy = re.compile(r'(20\d{2})')

    while True:
        try:
            results = drive_service.files().list(
                q=query, 
                fields="nextPageToken, files(id, name, mimeType, description, createdTime, modifiedTime, parents)",
                pageToken=page_token,
                pageSize=1000,
                corpora='allDrives',
                includeItemsFromAllDrives=True,
                supportsAllDrives=True
            ).execute()
            
            for item in results.get('files', []):
                old_name = item['name']
                desc_meta = item.get('description', '')
                created_time = item.get('createdTime', '')
                modified_time = item.get('modifiedTime', '')
                
                path = get_full_path(item)
                if 'MacMini' in path or 'Messages' in path or 'Archive_Legacy_Chats' in path or 'Old_Confirmed_Duplicates' in path:
                    continue
                if 'Archive_Legacy_Chats' in old_name:
                    continue
                
                # Check if it has a Clerk tag
                has_clerk_tag = bool(desc_meta and ('#' in desc_meta or '[CLERK PROCESSED]' in desc_meta or 'Taxonomy:' in desc_meta))
                
                # If we aren't forcing all, skip untagged files
                if not args.force_all and not has_clerk_tag:
                    continue

                # Skip if already modern format
                if pattern_modern.match(old_name):
                    continue

                new_name = None
                clerk_date = None
                
                # Check pattern 1
                match1 = pattern1.match(old_name)
                if match1:
                    clerk_date = match1.group(2)
                    desc = match1.group(3)
                    ext = match1.group(4) or ""
                    new_name = f"{clerk_date} - {desc}{ext}"
                else:
                    # Check pattern 2
                    match2 = pattern2.match(old_name)
                    if match2:
                        clerk_date = match2.group(1)
                        name_part = match2.group(2)
                        desc = match2.group(3)
                        ext = match2.group(4) or ""
                        new_name = f"{clerk_date} - {name_part} {desc}{ext}"
                    else:
                        # Fallback parsing for unstructured files
                        if args.force_all:
                            # Try strict date first (YYYYMMDD, YYYY-MM-DD)
                            date_str = None
                            match_strict = regex_strict_date.search(old_name)
                            if match_strict:
                                date_str = match_strict.group(1) + match_strict.group(2)
                            else:
                                match_ym = regex_yyyymm.search(old_name)
                                if match_ym:
                                    date_str = match_ym.group(1) + match_ym.group(2)
                                else:
                                    match_y = regex_yyyy.search(old_name)
                                    if match_y:
                                        date_str = match_y.group(1) + "01" # Default to Jan if only year is found
                                    else:
                                        if created_time:
                                            date_str = created_time.replace('-', '')[:6]
                            
                            if date_str:
                                clerk_date = date_str
                                new_name = f"{clerk_date} - {old_name}"
                
                if new_name and new_name != old_name:
                    created_yyyymm = created_time.replace('-', '')[:6] if created_time else ''
                    modified_yyyymm = modified_time.replace('-', '')[:6] if modified_time else ''
                    
                    created_compare = created_yyyymm[:len(clerk_date)] if clerk_date else ''
                    modified_compare = modified_yyyymm[:len(clerk_date)] if clerk_date else ''
                    
                    differs_creation = (clerk_date != created_compare)
                    differs_modified = (clerk_date != modified_compare)
                    
                    renames.append({
                        'id': item['id'],
                        'old_name': old_name,
                        'new_name': new_name,
                        'clerk_date': clerk_date,
                        'created_date': created_time[:10] if created_time else '',
                        'modified_date': modified_time[:10] if modified_time else '',
                        'differs_creation': differs_creation,
                        'differs_modified': differs_modified
                    })
                    
                    if args.limit and len(renames) >= args.limit:
                        break
                        
            if args.limit and len(renames) >= args.limit:
                break
                
            page_token = results.get('nextPageToken')
            if not page_token:
                break
        except Exception as e:
            print(f"Error fetching files: {e}")
            break

    print(f"Found {len(renames)} files matching the renaming criteria.")
    
    if not renames:
        print("No files need renaming. Exiting.")
        return

    csv_path = os.path.join(os.path.dirname(__file__), 'dry_run_renames.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'id', 'old_name', 'new_name', 
            'clerk_date', 'created_date', 'modified_date', 
            'differs_creation', 'differs_modified'
        ])
        writer.writeheader()
        writer.writerows(renames)
        
    print(f"Proposed changes and metrics written to {csv_path}")

    if args.execute:
        print("\nEXECUTING RENAMES...")
        success_count = 0
        for i, item in enumerate(renames):
            try:
                print(f"Renaming [{i+1}/{len(renames)}]: '{item['old_name']}' -> '{item['new_name']}'")
                drive_service.files().update(
                    fileId=item['id'],
                    body={'name': item['new_name']}
                ).execute()
                success_count += 1
            except Exception as e:
                print(f"Failed to rename {item['id']}: {e}")
        print(f"Successfully renamed {success_count}/{len(renames)} files.")
    else:
        print("Dry-run complete. Run with --execute to apply these changes.")

if __name__ == '__main__':
    main()
