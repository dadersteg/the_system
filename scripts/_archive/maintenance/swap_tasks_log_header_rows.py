#!/usr/bin/env python3
"""
swap_tasks_log_header_rows.py
Swaps Row 1 and Row 2 in '5 Import - Google Tasks Log' across both Master Spreadsheets.
Moves the helper descriptions to Row 1 and the table headers to Row 2.
"""

import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PRIVATE_SID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
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

def swap_rows(service, spreadsheet_id, label):
    print(f"\nSwapping rows for: {label} ({spreadsheet_id})...")
    
    # 1. Read row 1 and row 2 values
    res = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range="'5 Import - Google Tasks Log'!A1:P2"
    ).execute()
    rows = res.get('values', [])
    if len(rows) < 2:
        print("  [ERROR] Could not read row 1 and row 2.")
        return
        
    row1 = rows[0]
    row2 = rows[1]
    
    # Check if they are already swapped (descriptions in row 1, headers in row 2)
    # Row 1 of descriptions typically starts with "System-generated Tracking URN"
    if "System-generated" in str(row1[0]):
        print("  [OK] Rows are already swapped.")
        return
        
    print("  Detected Headers in Row 1 and Descriptions in Row 2. Swapping...")
    
    # 2. Write them swapped
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'5 Import - Google Tasks Log'!A1:P2",
        valueInputOption="USER_ENTERED",
        body={"values": [row2, row1]}
    ).execute()
    
    # 3. Swap the visual formats (Row 1 italic, Row 2 bold)
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheet_id = None
    for s in sheet_metadata.get('sheets', []):
        if s['properties']['title'] == "5 Import - Google Tasks Log":
            sheet_id = s['properties']['sheetId']
            break
            
    if sheet_id is not None:
        requests = [
            # Row 1: Italic, normal font weight, gray color
            {
                "repeatCell": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": len(row2)},
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "bold": False,
                                "italic": True,
                                "foregroundColor": {"red": 102/255.0, "green": 102/255.0, "blue": 102/255.0} # #666666
                            }
                        }
                    },
                    "fields": "userEnteredFormat.textFormat(bold,italic,foregroundColor)"
                }
            },
            # Row 2: Bold, normal font style (not italic), white color
            {
                "repeatCell": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": len(row1)},
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "bold": True,
                                "italic": False,
                                "foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}
                            }
                        }
                    },
                    "fields": "userEnteredFormat.textFormat(bold,italic,foregroundColor)"
                }
            }
        ]
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
        print("  [SUCCESS] Formatted row 1 (descriptions) and row 2 (headers).")
    else:
        print("  [WARNING] Could not find sheet ID to format rows.")

def main():
    service = get_sheets_service()
    swap_rows(service, PRIVATE_SID, "Private")
    swap_rows(service, WORK_SID, "Work")

if __name__ == '__main__':
    main()
