import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials

def read_sheet(spreadsheet_id, token_file):
    service = get_service('sheets', 'v4', token_file)
    sheet = service.spreadsheets()
    
    spreadsheet = sheet.get(spreadsheetId=spreadsheet_id).execute()
    sheet_name = None
    for s in spreadsheet.get('sheets', []):
        if str(s['properties']['sheetId']) == "1717171717":
            sheet_name = s['properties']['title']
            break
            
    result = sheet.values().get(spreadsheetId=spreadsheet_id, range=sheet_name).execute()
    values = result.get('values', [])
    return values

values = read_sheet("1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY", "auth/token.json")

# Print first 10 rows completely
for i, row in enumerate(values[:10]):
    print(f"Row {i}: {row}")

# Find Gemini notes today and print ALL columns
today_rows = []
for row in values:
    row_str = " | ".join([str(x) for x in row])
    if "2026/06/26" in row_str and "Notes by Gemini" in row_str:
        today_rows.append(row)

print(f"\nFOUND {len(today_rows)} matching rows today:")
for row in today_rows:
    print(row)
