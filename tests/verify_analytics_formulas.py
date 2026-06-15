#!/usr/bin/env python3
"""
verify_pivot_tables.py
Verifies that the new Pivot sheets contain expected headers and are populated.
"""
import os
import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

private_sid = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
work_sid = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"

EXPECTED_PIVOTS = {
    "10 Tasks Overview": ["Category", "Task Title", "Due Date", "Days to Due"]
}

def verify_pivots(spreadsheet_id, label):
    print(f"\n=== VERIFYING PIVOT TABLES: {label} ({spreadsheet_id}) ===")
    token_path = "auth/token.json"
    if not os.path.exists(token_path):
        print(f"ERROR: Credentials token not found at {token_path}")
        return False
        
    try:
        with open(token_path, 'r') as f:
            creds_data = json.load(f)
        creds = Credentials.from_authorized_user_info(creds_data)
        service = build('sheets', 'v4', credentials=creds)
        
        success = True
        for sheet_name, expected_headers in EXPECTED_PIVOTS.items():
            print(f"Checking Pivot Sheet: '{sheet_name}'...")
            res = service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_name}'!A1:K20"
            ).execute()
            rows = res.get('values', [])
            
            if not rows:
                print(f"  [FAIL] Sheet '{sheet_name}' is empty!")
                success = False
                continue
                
            # Flatten all cell values in the first few rows to check for expected keywords
            flat_cells = []
            for row in rows:
                flat_cells.extend([str(cell).strip() for cell in row])
                
            missing = []
            for header in expected_headers:
                # Case insensitive check
                if not any(header.lower() in cell.lower() for cell in flat_cells):
                    missing.append(header)
                    
            if missing:
                print(f"  [FAIL] Missing expected pivot fields: {missing}. Found cells: {flat_cells[:10]}")
                success = False
            else:
                print(f"  [OK] Sheet contains expected fields: {expected_headers}")
                
        return success
    except Exception as e:
        print(f"ERROR executing pivot verification: {e}")
        return False

def main():
    private_ok = verify_pivots(private_sid, "Private")
    work_ok = verify_pivots(work_sid, "Work")
    
    print("\n=== PIVOT VERIFICATION SUMMARY ===")
    if private_ok and work_ok:
        print("All pivot table verifications PASSED.")
        sys.exit(0)
    else:
        print("Some pivot table verifications FAILED.")
        sys.exit(1)

if __name__ == '__main__':
    main()
