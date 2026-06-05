#!/usr/bin/env python3
"""
scripts/cleanup_shared_files.py
Description: Safe script to clean up Google Drive "Shared with me" files by removing
             the user's permission entry from loose files (not organized in folders).
"""

import os
import sys
import argparse
import socket
import time
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Set global timeout to prevent connections from hanging indefinitely
socket.setdefaulttimeout(60)

def is_whitelisted(email):
    if not email:
        return False
    email_lower = email.lower()
    # Check contains patterns
    if any(pattern in email_lower for pattern in ['daniel', 'daff', 'carry', 'henriksson']):
        return True
    # Check exact matches
    if email_lower in [
        'hans@ritkonsult.se',
        'gadersteg@gmail.com',
        'ostrarealsskolidrottsforening@live.se'
    ]:
        return True
    return False

def main():
    parser = argparse.ArgumentParser(description="Clean up loose 'Shared with me' files in Google Drive.")
    parser.add_argument('--execute', action='store_true', help="Execute the permission removals (default is dry-run).")
    args = parser.parse_args()

    dry_run = not args.execute
    if dry_run:
        print("=== DRY RUN MODE: No modifications will be made ===")
    else:
        print("=== EXECUTION MODE: Revoking permissions on loose shared files ===")

    print("Initializing Google Drive Client...")
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print(f"Error: Credentials file '{token_path}' not found.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)

    # 1. Fetch user information
    try:
        about = drive_service.about().get(fields="user(emailAddress, permissionId)").execute()
        user_email = about['user']['emailAddress']
        user_permission_id = about['user']['permissionId']
        print(f"User: {user_email} (Permission ID: {user_permission_id})")
    except Exception as e:
        print(f"Error fetching user metadata: {e}")
        sys.exit(1)

    # 2. Fetch all shared files
    print("Fetching 'Shared with me' files...")
    shared_files = []
    page_token = None
    while True:
        try:
            response = drive_service.files().list(
                q="sharedWithMe = true and trashed = false",
                fields="nextPageToken, files(id, name, parents, owners, sharingUser, createdTime)",
                pageToken=page_token,
                pageSize=1000
            ).execute()
            shared_files.extend(response.get('files', []))
            page_token = response.get('nextPageToken')
            if not page_token:
                break
        except Exception as e:
            print(f"Error listing shared files: {e}")
            sys.exit(1)

    print(f"Indexed {len(shared_files)} shared files/folders.")

    loose_files = []
    organized_files = []
    whitelisted_files = []

    for f in shared_files:
        # Skip files owned by the user
        is_owner = False
        owners = f.get('owners', [])
        for o in owners:
            if o.get('emailAddress') == user_email:
                is_owner = True
                break
        if is_owner:
            continue

        # Check whitelist (both owners and sharingUser)
        sharing_user = f.get('sharingUser', {}).get('emailAddress')
        owner_emails = [o.get('emailAddress') for o in owners if o.get('emailAddress')]
        
        whitelisted = False
        if is_whitelisted(sharing_user):
            whitelisted = True
        for oe in owner_emails:
            if is_whitelisted(oe):
                whitelisted = True
                
        if whitelisted:
            whitelisted_files.append(f)
            continue

        parents = f.get('parents')
        if not parents:
            loose_files.append(f)
        else:
            organized_files.append(f)

    print(f"\nSummary:")
    print(f"  - Total Shared Files: {len(shared_files)}")
    print(f"  - Whitelisted Shared Files (Preserved): {len(whitelisted_files)}")
    print(f"  - Organized Shared Files (Skipped/Preserved): {len(organized_files)}")
    print(f"  - Loose Shared Files (Candidate for cleanup): {len(loose_files)}")

    if not loose_files:
        print("No loose shared files found to clean up!")
        sys.exit(0)

    print(f"\nProcessing {len(loose_files)} loose shared files...")
    success_count = 0
    fail_count = 0

    for idx, f in enumerate(loose_files):
        name = f.get('name', 'Untitled')
        fid = f['id']
        owner = f.get('owners', [{}])[0].get('emailAddress', 'Unknown')
        sharing = f.get('sharingUser', {}).get('emailAddress', 'Unknown')
        
        print(f"[{idx+1}/{len(loose_files)}] Name: '{name}' | ID: {fid} | Owner: {owner}")

        if dry_run:
            print(f"  - [DRY-RUN] Would remove permission ID {user_permission_id} to revoke access.")
            success_count += 1
        else:
            try:
                # Remove own permission
                drive_service.permissions().delete(fileId=fid, permissionId=user_permission_id).execute()
                print("  - Successfully revoked access.")
                success_count += 1
            except Exception as e:
                print(f"  - Error revoking access: {e}")
                fail_count += 1
            
            # Rate limiting sleep
            time.sleep(0.05)

    print("\nCleanup Completed!")
    if dry_run:
        print(f"Dry-run simulation: Would successfully process {success_count} files.")
    else:
        print(f"Execution results: {success_count} successfully removed, {fail_count} failed.")

if __name__ == '__main__':
    main()
