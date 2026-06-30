import os
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

BASE_DIR = "/Users/daniel/Documents/AGY/the_system"
DB_DIR = "/Users/daniel/Developer/second_brain_db/data"

MASTER_SPREADSHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'
EMAIL_TRIAGE_GID = 2131515996
DRIVE_FILES_GID = 809034738

PHOTO_SPREADSHEET_ID = '1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k'
PHOTO_TABLE_GID = 0

def get_sheets_service():
    creds = Credentials.from_authorized_user_file(os.path.join(BASE_DIR, 'auth/token.json'))
    return build('sheets', 'v4', credentials=creds)

def get_sheet_title_by_gid(sheets_service, spreadsheet_id, gid):
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get('sheets', []):
        if sheet['properties']['sheetId'] == gid:
            return sheet['properties']['title']
    return None

def fetch_and_parse(sheets_service, spreadsheet_id, gid, source_name, date_str, ts_index):
    title = get_sheet_title_by_gid(sheets_service, spreadsheet_id, gid)
    if not title:
        print(f"Could not find sheet for GID {gid} in {spreadsheet_id}")
        return []

    res = sheets_service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"'{title}'!A:Z").execute()
    rows = res.get('values', [])
    if not rows:
        return []
        
    headers = rows[0]
    events = []
    
    for row in rows[1:]:
        if len(row) <= ts_index:
            continue
        ts = row[ts_index].strip()
        try:
            if ts and ts[0].isalpha():
                dt = parsedate_to_datetime(ts)
                date_str_parsed = dt.strftime('%Y-%m-%d')
            else:
                date_str_parsed = ts[:10]
        except Exception:
            continue
            
        if date_str_parsed == date_str:
            event = {"source": source_name, "type": "event"}
            for i, val in enumerate(row):
                if i < len(headers) and headers[i]:
                    event[headers[i]] = val
            events.append(event)
            
    return events

def main():
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"Starting Daily Second Brain Sync for {today_str}...")
    
    os.makedirs(DB_DIR, exist_ok=True)
    service = get_sheets_service()
    all_events = []
    
    # 1. Emails & Messages
    print("Fetching Emails & Messages...")
    email_events = fetch_and_parse(service, MASTER_SPREADSHEET_ID, EMAIL_TRIAGE_GID, "email_triage", today_str, 1)
    all_events.extend(email_events)
    print(f"  Found {len(email_events)} events.")
    
    # 2. Drive Files
    print("Fetching Drive Files...")
    drive_events = fetch_and_parse(service, MASTER_SPREADSHEET_ID, DRIVE_FILES_GID, "drive", today_str, 0)
    all_events.extend(drive_events)
    print(f"  Found {len(drive_events)} events.")
    
    # 3. Photos
    print("Fetching Photos...")
    photo_events = fetch_and_parse(service, PHOTO_SPREADSHEET_ID, PHOTO_TABLE_GID, "photo", today_str, 2)
    all_events.extend(photo_events)
    print(f"  Found {len(photo_events)} events.")
    
    if not all_events:
        print("No events found today.")
        return
        
    # Read existing file to append/merge
    out_path = os.path.join(DB_DIR, f"{today_str}.json")
    existing_events = []
    if os.path.exists(out_path):
        with open(out_path, 'r') as f:
            try:
                existing_events = json.load(f)
            except json.JSONDecodeError:
                pass
                
    # Basic deduplication (if run multiple times a day)
    # Using str(event) as a naive hash for deduplication
    existing_hashes = {str(e) for e in existing_events}
    added_count = 0
    for e in all_events:
        if str(e) not in existing_hashes:
            existing_events.append(e)
            existing_hashes.add(str(e))
            added_count += 1
            
    # Write back
    with open(out_path, 'w') as f:
        json.dump(existing_events, f, indent=2)
        
    print(f"Sync complete. Appended {added_count} new events to {today_str}.json.")

if __name__ == "__main__":
    main()
