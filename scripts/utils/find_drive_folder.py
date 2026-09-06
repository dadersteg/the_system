#!/usr/bin/env python3
"""
scripts/utils/find_drive_folder.py
Static CLI utility to search and resolve Google Drive folder IDs by name or LOS path.
Replaces ad-hoc inline python (-c) invocations to prevent Antigravity permission modals.

Usage:
  python3 scripts/utils/find_drive_folder.py --query "Medical Appointments & Tests"
  python3 scripts/utils/find_drive_folder.py --query "01 02 01"
  python3 scripts/utils/find_drive_folder.py --parent-id "0B85__gYrQ-2UendicDVzUXI1MWM"
"""

import os
import sys
import json
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from lib.google_auth import get_credentials
from googleapiclient.discovery import build

def main():
    parser = argparse.ArgumentParser(description="Find Google Drive folder ID by name or query.")
    parser.add_argument("--query", help="Folder name substring or LOS code to search for")
    parser.add_argument("--parent-id", help="List folders inside this parent folder ID")
    parser.add_argument("--exact", action="store_true", help="Match folder name exactly")
    parser.add_argument("--first-id", action="store_true", help="Output only the ID of the best match")
    parser.add_argument("--token-path", help="Path to drive token json (default: auth/token_drive.json)")
    args = parser.parse_args()

    if not args.query and not args.parent_id:
        print("Error: You must specify either --query or --parent-id.", file=sys.stderr)
        sys.exit(1)

    token_file = Path(args.token_path) if args.token_path else (BASE_DIR / "auth" / "token_drive.json")
    if not token_file.exists():
        token_file = BASE_DIR / "auth" / "token.json"
    if not token_file.exists():
        print(f"Error: Token file not found at {token_file}", file=sys.stderr)
        sys.exit(1)

    try:
        creds = get_credentials(str(token_file), account_name="Private Drive")
        service = build('drive', 'v3', credentials=creds)

        query_clauses = ["mimeType = 'application/vnd.google-apps.folder'", "trashed = false"]

        if args.parent_id:
            query_clauses.append(f"'{args.parent_id}' in parents")

        if args.query:
            clean_q = args.query.replace("'", "\\'")
            if args.exact:
                query_clauses.append(f"name = '{clean_q}'")
            else:
                query_clauses.append(f"name contains '{clean_q}'")

        full_query = " and ".join(query_clauses)

        res = service.files().list(
            q=full_query,
            fields="files(id, name, parents, modifiedTime)",
            pageSize=30
        ).execute()

        folders = res.get('files', [])

        if args.first_id:
            if folders:
                print(folders[0]['id'])
                sys.exit(0)
            else:
                print("", file=sys.stderr)
                sys.exit(1)

        print(json.dumps({
            "status": "SUCCESS",
            "query": args.query,
            "parent_id": args.parent_id,
            "count": len(folders),
            "folders": folders
        }, indent=2))

    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
