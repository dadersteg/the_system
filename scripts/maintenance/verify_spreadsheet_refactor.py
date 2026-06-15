#!/usr/bin/env python3
"""
verify_spreadsheet_refactor.py
Verification script to validate GID integrity, hidden sheet status, and Analytics tab existence.
"""

import os
import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Expected GIDs in the Master Spreadsheet
EXPECTED_GIDS_COMMON = {
    "10 Email Tracker": 1212121212,
    "10 Drive Tracker": 1717171717,
    "10 Tasks Overview": 1414141414,
    "5 Import - Gemini Models": 1704335578,
    "3 Config - Workspace Taxonomy": 1287896098,
    "5 Import - Drive Directory Tree": 536537641,
    "5 Import - Drive Files Log": 809034738,
    "5 Import - Notes Log": 967747913,
    "5 Import - Reset Actions Log": 1835375017,
    "5 Import - Session Stats Log": 1657749758,
    "3 Config - Email Aliases": 1799689202,
    "2 Input - Email Rules": 1679876125,
    "5 Import - Gmail Labels": 1007497112,
    "5 Import - Email Triage Log": 2131515996,
    "5 Import - Google Tasks Log": 1580572397,
    "2 Input - File Naming Rules": 938516466,
    "2 Input - File Folder Rules": 1297520241
}

EXPECTED_GIDS_WORK = {
    "Google Tasks 01 Overview": 275991319
}

HIDDEN_TABS = {
    1835375017,  # Reset Actions Log
    1657749758,  # Session Stats Log
    67786861,    # Retro Emails Log
    1325920151,  # Retro Files Log
    938516466,   # File Naming Rules
    1297520241,  # File Folder Rules
    1799689202,  # Email Aliases
    1704335578,  # Gemini Models
    1007497112,  # Gmail Labels
    1287896098,  # Workspace Taxonomy
    536537641    # Drive Directory Tree
}

def verify_spreadsheet(spreadsheet_id, label):
    print(f"\n=== VERIFYING SPREADSHEET: {label} ({spreadsheet_id}) ===")
    
    # Path to token.json
    token_path = "auth/token.json"
    if not os.path.exists(token_path):
        print(f"ERROR: Credentials token not found at {token_path}")
        return False
        
    try:
        with open(token_path, 'r') as f:
            creds_data = json.load(f)
        creds = Credentials.from_authorized_user_info(creds_data)
        service = build('sheets', 'v4', credentials=creds)
        
        # Fetch spreadsheet metadata
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = metadata.get('sheets', [])
        
        # Map sheets by GID and name
        sheet_gids = {}
        sheet_names = {}
        for s in sheets:
            props = s.get('properties', {})
            gid = props.get('sheetId')
            title = props.get('title')
            hidden = props.get('hidden', False)
            sheet_gids[gid] = {"title": title, "hidden": hidden}
            sheet_names[title] = {"gid": gid, "hidden": hidden}
            
        # 1. Verify Expected GIDs exist
        print("\nChecking GID mappings from Code_Config.js:")
        missing_gids = 0
        
        # Determine expected GIDs for this sheet
        expected = dict(EXPECTED_GIDS_COMMON)
        if label == "Work":
            expected["00 Index"] = 384789276
            expected.update(EXPECTED_GIDS_WORK)
        else:
            expected["00 Index"] = 1111111111
            
        for name, gid in expected.items():
            if gid in sheet_gids:
                print(f"  [OK] GID {gid} ({name}) matches tab '{sheet_gids[gid]['title']}'")
            else:
                print(f"  [FAIL] GID {gid} ({name}) is missing from the spreadsheet!")
                missing_gids += 1
                
        # 2. Verify Hidden Tabs are hidden
        print("\nChecking background tab visibility (should be hidden):")
        visibility_failures = 0
        for gid in HIDDEN_TABS:
            if gid in sheet_gids:
                title = sheet_gids[gid]['title']
                hidden = sheet_gids[gid]['hidden']
                if hidden:
                    print(f"  [OK] Tab '{title}' (GID {gid}) is hidden.")
                else:
                    print(f"  [FAIL] Tab '{title}' (GID {gid}) is visible!")
                    visibility_failures += 1
            else:
                print(f"  [INFO] Tab GID {gid} is not present in this spreadsheet version.")
                
        success = (missing_gids == 0) and (visibility_failures == 0)
        return success
    except Exception as e:
        print(f"ERROR executing spreadsheet verification: {e}")
        return False

def main():
    # Private Spreadsheet ID
    private_sid = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
    # Work Spreadsheet ID
    work_sid = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"
    
    private_ok = verify_spreadsheet(private_sid, "Private")
    work_ok = verify_spreadsheet(work_sid, "Work")
    
    print("\n=== VERIFICATION SUMMARY ===")
    if private_ok and work_ok:
        print("All checks PASSED successfully.")
        sys.exit(0)
    else:
        print("Some checks FAILED. Please review the log output above.")
        sys.exit(1)

if __name__ == '__main__':
    main()
