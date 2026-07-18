#!/usr/bin/env python3
"""
remove_tasks_log_descriptions.py
Deletes the description helper row from the Google Tasks Log sheet(s) in both spreadsheets,
promoting the headers to Row 1, and deletes '1 Output - Notes Pivot' GID 1616161616.
"""
import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PRIVATE_SID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
# Work Spreadsheet ID
WORK_SID = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"

def get_sheets_service():
    token_path = 'auth/token.json'
    with open(token_path, 'r') as f:
        creds_data = json.load(f)
    creds = Credentials.from_authorized_user_info(creds_data)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, 'w') as f:
            json.dump(creds_to_dict(creds), f)
    return build('sheets', 'v4', credentials=creds)

def creds_to_dict(creds):
    return {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }

def clean_sheet_headers_and_pivots(service, spreadsheet_id, label):
    print(f"\n==========================================")
    print(f"PROCESSING HEADERS & DELETIONS FOR: {label} ({spreadsheet_id})")
    print(f"==========================================")
    
    # 1. Delete "1 Output - Notes Pivot" (GID 1616161616) if it exists
    metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = metadata.get('sheets', [])
    sheet_gids = {s['properties']['sheetId']: s['properties']['title'] for s in sheets}
    
    requests = []
    if 1616161616 in sheet_gids:
        print(f"[{label}] Deleting tab '1 Output - Notes Pivot' (GID 1616161616)...")
        requests.append({"deleteSheet": {"sheetId": 1616161616}})
        
    if requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
        # Refresh metadata
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = metadata.get('sheets', [])
        sheet_gids = {s['properties']['sheetId']: s['properties']['title'] for s in sheets}
    
    # 2. Process tasks logs to delete helper description row
    log_targets = [1580572397, 1580572400] # GID 1580572397 (Active) and 1580572400 (Completed) are common
    if label == "Work" and 275991319 in sheet_gids:
        log_targets.append(275991319)
        
    for gid in log_targets:
        title = sheet_gids.get(gid)
        if not title:
            print(f"[{label}] Warning: GID {gid} not found in spreadsheet.")
            continue
            
        print(f"[{label}] Inspecting headers for '{title}' (GID {gid})...")
        res = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{title}'!A1:B2"
        ).execute()
        rows = res.get('values', [])
        if len(rows) < 2:
            print(f"[{label}]   No description row detected or empty sheet.")
            continue
            
        row1 = [str(x).strip().lower() for x in rows[0]]
        row2 = [str(x).strip().lower() for x in rows[1]]
        
        # Check if row 1 contains description text (e.g. starts with "system-generated" or "extracted")
        # and row 2 contains headers (e.g. starts with "urn" or "list")
        is_row1_desc = any("system-generated" in val or "extracted" in val for val in row1)
        is_row2_header = any("urn" in val or "list" in val for val in row2)
        
        if is_row1_desc or (not is_row1_desc and is_row2_header):
            print(f"[{label}]   Detected helper description row in Row 1. Deleting Row 1...")
            # Delete row 1 (index 0 to 1)
            delete_req = {
                "deleteDimension": {
                    "range": {
                        "sheetId": gid,
                        "dimension": "ROWS",
                        "startIndex": 0,
                        "endIndex": 1
                    }
                }
            }
            service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": [delete_req]}).execute()
            print(f"[{label}]   Successfully deleted description row for '{title}'.")
        else:
            print(f"[{label}]   Row 1 is already the header row. No description row found.")

def main():
    service = get_sheets_service()
    clean_sheet_headers_and_pivots(service, PRIVATE_SID, "Private")
    clean_sheet_headers_and_pivots(service, WORK_SID, "Work")

if __name__ == '__main__':
    main()
