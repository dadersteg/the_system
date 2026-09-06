#!/usr/bin/env python3
"""
scripts/utils/drive_sweep_preflight.py
Static CLI utility for Clerk Drive Triage preflight check.
Scans all 8 canonical STND_SOURCES incoming Google Drive folders:
- 00 Inbox
- MacMini Desktop
- MacMini Downloads
- MBA Private Desktop
- MBA Private Downloads
- Saved from Chrome (Carina)
- Saved from Chrome (Daniel)
- Gemini Meeting Notes

Replaces dynamic inline python (-c) to allow Antigravity to permanently auto-approve.

Usage:
  python3 scripts/utils/drive_sweep_preflight.py
"""

import os
import sys
import time
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from lib.google_auth import get_credentials
from googleapiclient.discovery import build

LOCK_PATH = BASE_DIR / "scratch" / ".clerk_drive_sweep.lock"
TOKEN_PATH = BASE_DIR / "auth" / "token_drive.json"

STND_SOURCES = [
    ("1XossC1cdOZE82efew3qH48LJnhl6ng4i", "00 Inbox"),
    ("1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", "MacMini Desktop"),
    ("1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", "MacMini Downloads"),
    ("1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", "MBA Private Desktop"),
    ("1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", "MBA Private Downloads"),
    ("1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo", "Saved from Chrome (Carina)"),
    ("17uUH01ihipNeRfTQQcD61zzjORpWFCRY", "Saved from Chrome (Daniel)"),
    ("1yr9bPJcprkfYSbDnAD0z4TDJLgR8D5wt", "Gemini Meeting Notes")
]

def main():
    now = time.time()
    
    # 1. Mutex lock check
    if LOCK_PATH.exists():
        try:
            mtime = LOCK_PATH.stat().st_mtime
            if now - mtime < 180:
                print(json.dumps({"status": "LOCKED", "message": "Prior drive sweep currently active. Aborting run to guarantee 0 overlap."}))
                sys.exit(0)
        except Exception:
            pass
            
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(str(now), encoding="utf-8")
    
    # 2. Check all 8 STND_SOURCES folders
    try:
        creds = get_credentials(str(TOKEN_PATH), account_name="Private Drive")
        service = build('drive', 'v3', credentials=creds)
        
        all_unorganized = []
        for folder_id, folder_name in STND_SOURCES:
            try:
                q = f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'"
                res = service.files().list(
                    q=q,
                    fields="files(id, name, mimeType, createdTime, modifiedTime, size, description)",
                    pageSize=50
                ).execute()
                items = res.get('files', [])
                for item in items:
                    all_unorganized.append({
                        "id": item.get("id"),
                        "name": item.get("name"),
                        "mimeType": item.get("mimeType"),
                        "createdTime": item.get("createdTime"),
                        "size": item.get("size"),
                        "description": item.get("description", ""),
                        "sourceFolderId": folder_id,
                        "sourceFolderName": folder_name
                    })
            except Exception as folder_err:
                print(f"[WARN] Error scanning folder {folder_name} ({folder_id}): {folder_err}", file=sys.stderr)
                
        # Fast-Path Zero-File Exit
        if not all_unorganized:
            if LOCK_PATH.exists():
                LOCK_PATH.unlink()
            try:
                from scripts.utils.heartbeat_lease import touch_heartbeat_lease
                touch_heartbeat_lease("CLERK_DRIVE", status="SUCCESS", details="0 files across 8 incoming folders (clean fast-path)", silent=True)
            except Exception:
                pass
            print(json.dumps({"status": "CLEAN", "file_count": 0, "files": []}))
            sys.exit(0)
            
        # Actionable files exist
        try:
            from scripts.utils.heartbeat_lease import touch_heartbeat_lease
            touch_heartbeat_lease("CLERK_DRIVE", status="SUCCESS", details=f"{len(all_unorganized)} files pending triage across incoming folders", silent=True)
        except Exception:
            pass
            
        print(json.dumps({
            "status": "ACTIONABLE",
            "file_count": len(all_unorganized),
            "files": all_unorganized
        }, indent=2))
        sys.exit(0)
        
    except Exception as e:
        if LOCK_PATH.exists():
            LOCK_PATH.unlink()
        print(json.dumps({"status": "ERROR", "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
