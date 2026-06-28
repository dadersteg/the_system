import os
import json
from collections import defaultdict
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

BASE_DIR = "/Users/daniel/Documents/AGY/the_system"
DB_DIR = "/Users/daniel/Developer/second_brain_db/data"

MASTER_SPREADSHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'
EMAIL_TRIAGE_GID = 2131515996
DRIVE_FILES_GID = 809034738
RETRO_EMAILS_GID = 67786861
RETRO_FILES_GID = 1325920151

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

def fetch_all_and_group(sheets_service, spreadsheet_id, gid, source_name, ts_index, grouped_events):
    title = get_sheet_title_by_gid(sheets_service, spreadsheet_id, gid)
    if not title:
        print(f"Could not find sheet for GID {gid} in {spreadsheet_id}")
        return

    print(f"Fetching {title}...")
    try:
        res = sheets_service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"'{title}'!A:Z").execute()
        rows = res.get('values', [])
    except Exception as e:
        print(f"Error fetching {title}: {e}")
        return

    if not rows:
        return
        
    headers = rows[0]
    count = 0
    
    for row in rows[1:]:
        if len(row) <= ts_index:
            continue
        ts = row[ts_index].strip()
        if not ts:
            continue
            
        # Parse timestamp to YYYY-MM-DD
        # Timestamps can be '2026-04-30 17:02', '2007-11-16T22:25:00Z', etc.
        date_str = ts[:10]
        # Basic validation
        if len(date_str) == 10 and date_str[4] == '-' and date_str[7] == '-':
            event = {"source": source_name, "type": "event"}
            for i, val in enumerate(row):
                if i < len(headers) and headers[i]:
                    event[headers[i]] = val
            grouped_events[date_str].append(event)
            count += 1
            
    print(f"  -> Added {count} events from {title}.")

def main():
    print("Starting Historical Second Brain Backfill...")
    os.makedirs(DB_DIR, exist_ok=True)
    service = get_sheets_service()
    
    grouped_events = defaultdict(list)
    
    fetch_all_and_group(service, MASTER_SPREADSHEET_ID, EMAIL_TRIAGE_GID, "email_triage", 0, grouped_events)
    fetch_all_and_group(service, MASTER_SPREADSHEET_ID, DRIVE_FILES_GID, "drive", 0, grouped_events)
    fetch_all_and_group(service, MASTER_SPREADSHEET_ID, RETRO_EMAILS_GID, "email_retro", 0, grouped_events)
    fetch_all_and_group(service, MASTER_SPREADSHEET_ID, RETRO_FILES_GID, "drive_retro", 0, grouped_events)
    fetch_all_and_group(service, PHOTO_SPREADSHEET_ID, PHOTO_TABLE_GID, "photo", 2, grouped_events)
    
    print(f"Grouped events into {len(grouped_events)} unique days.")
    
    print("Writing JSON files...")
    files_written = 0
    for date_str, events in grouped_events.items():
        out_path = os.path.join(DB_DIR, f"{date_str}.json")
        
        existing_events = []
        if os.path.exists(out_path):
            with open(out_path, 'r') as f:
                try:
                    existing_events = json.load(f)
                except json.JSONDecodeError:
                    pass
        
        # Merge and dedup
        existing_hashes = {str(e) for e in existing_events}
        for e in events:
            if str(e) not in existing_hashes:
                existing_events.append(e)
                existing_hashes.add(str(e))
                
        # Write
        with open(out_path, 'w') as f:
            json.dump(existing_events, f, indent=2)
            
        files_written += 1
        
    print(f"Successfully backfilled and saved {files_written} JSON files.")

if __name__ == "__main__":
    main()
