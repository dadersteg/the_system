import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds_path = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
with open(creds_path, 'r') as f:
    creds_data = json.load(f)
creds = Credentials.from_authorized_user_info(creds_data)
service = build('sheets', 'v4', credentials=creds)

SPREADSHEETS = {
    "Private": "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
    "PMT": "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"
}

for name, sid in SPREADSHEETS.items():
    print(f"Migrating {name} ({sid})...")
    meta = service.spreadsheets().get(spreadsheetId=sid).execute()
    drive_log_sheet_id = None
    for s in meta.get('sheets', []):
        if s.get("properties", {}).get("title") == "5 Import - Drive Files Log":
            drive_log_sheet_id = s.get("properties", {}).get("sheetId")
            break
    
    if drive_log_sheet_id is None:
        print(f"Could not find '5 Import - Drive Files Log' in {name}")
        continue
    
    # Check if Timestamp is already there to be idempotent
    try:
        res = service.spreadsheets().values().get(spreadsheetId=sid, range="'5 Import - Drive Files Log'!A1").execute()
        if res.get('values') and res['values'][0][0] == "Timestamp":
            print(f"Timestamp already exists in {name}, skipping insert.")
            continue
    except Exception as e:
        print(f"Error checking A1: {e}")

    requests = [
        {
            "insertDimension": {
                "range": {
                    "sheetId": drive_log_sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": 0,
                    "endIndex": 1
                },
                "inheritFromBefore": False
            }
        }
    ]
    
    try:
        service.spreadsheets().batchUpdate(
            spreadsheetId=sid,
            body={"requests": requests}
        ).execute()
        print(f"Inserted Column A in {name}.")
        
        # Write "Timestamp" to A1
        service.spreadsheets().values().update(
            spreadsheetId=sid,
            range="'5 Import - Drive Files Log'!A1",
            valueInputOption="USER_ENTERED",
            body={"values": [["Timestamp"]]}
        ).execute()
        print(f"Wrote 'Timestamp' to A1 in {name}.")
    except Exception as e:
        print(f"Failed to migrate {name}: {e}")
