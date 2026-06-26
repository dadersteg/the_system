import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def read_sheet(spreadsheet_id, token_file):
    with open(token_file, 'r') as f:
        creds_data = json.load(f)
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    service = build('sheets', 'v4', credentials=creds)
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
