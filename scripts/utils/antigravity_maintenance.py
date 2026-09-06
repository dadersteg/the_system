#!/usr/bin/env python3
import os
import json
import datetime
import sys

# Ensure lib directory is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from lib.config import SHEET_TOKEN_PATH
from lib.google_auth import get_service

SPREADSHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'
BASE_DIR = '/Users/daniel/.gemini/antigravity'
ACTIVE_DB_DIR = os.path.join(BASE_DIR, 'conversations')
ACTIVE_ANN_DIR = os.path.join(BASE_DIR, 'annotations')
ACTIVE_BRAIN_DIR = os.path.join(BASE_DIR, 'brain')

def get_last_touched_date(cid):
    log_path = os.path.join(ACTIVE_BRAIN_DIR, cid, '.system_generated/logs/transcript.jsonl')
    if os.path.exists(log_path):
        try:
            with open(log_path, 'rb') as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                block_size = min(4096, size)
                f.seek(size - block_size)
                ld = f.read(block_size).decode('utf-8', errors='ignore')
                lines = ld.strip().split('\n')
                for line in reversed(lines):
                    if line.strip():
                        step = json.loads(line.strip())
                        if 'created_at' in step:
                            dt_str = step['created_at'].replace('T', ' ').replace('Z', '')
                            return datetime.datetime.strptime(dt_str[:19], '%Y-%m-%d %H:%M:%S')
        except:
            pass
            
    # Fallback to file modification time
    db_path = os.path.join(ACTIVE_DB_DIR, f"{cid}.db")
    if os.path.exists(db_path):
        mtime = os.stat(db_path).st_mtime
        return datetime.datetime.fromtimestamp(mtime)
        
    return None

def process_archiving():
    print("Starting Antigravity maintenance archiving...")
    now_dt = datetime.datetime.now()
    
    if not os.path.exists(ACTIVE_DB_DIR):
        return

    for fname in os.listdir(ACTIVE_DB_DIR):
        if not fname.endswith('.db'):
            continue
            
        cid = fname[:-3]
        last_touched = get_last_touched_date(cid)
        
        if not last_touched:
            continue
            
        age_days = (now_dt - last_touched).days
        
        ann_path = os.path.join(ACTIVE_ANN_DIR, f"{cid}.pbtxt")
        
        # Rule: FE Archive if > 21 days
        # We NEVER physically move or alter the .db file itself.
        if age_days > 21:
            if os.path.exists(ann_path):
                try:
                    with open(ann_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    if "archived:true" not in content and "archived: true" not in content:
                        print(f"Auto-Archiving (age {age_days} days): {cid}")
                        # Safely append the archived flag
                        with open(ann_path, 'a', encoding='utf-8') as f:
                            f.write('\narchived:true\n')
                except Exception as e:
                    print(f"Failed to auto-archive {cid}: {e}")

def sync_spreadsheet():
    print("Syncing states to Google Sheets...")
    service = get_service('sheets', 'v4', SHEET_TOKEN_PATH, account_name="Sheets Log")
    if not service:
        print("Failed to authenticate sheets API.")
        return
        
    try:
        # Fetch existing rows
        res = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range="'5 Import - Antigravity Log'!A:I"
        ).execute()
        
        rows = res.get('values', [])
        if not rows or len(rows) <= 1:
            print("Spreadsheet empty or only header found. Skipping sync.")
            return
            
        header = rows[0]
        # Pad rows to ensure they have 9 columns
        for i in range(len(rows)):
            while len(rows[i]) < 9:
                rows[i].append("")
                
        active_count = 0
        archived_count = 0
        deleted_count = 0
        
        # Process data rows
        for r in rows[1:]:
            cid = r[1]
            if not cid:
                continue
                
            in_active = os.path.exists(os.path.join(ACTIVE_DB_DIR, f"{cid}.db"))
            
            is_archived = False
            if in_active:
                ann_path = os.path.join(ACTIVE_ANN_DIR, f"{cid}.pbtxt")
                if os.path.exists(ann_path):
                    try:
                        with open(ann_path, 'r', encoding='utf-8') as af:
                            content = af.read()
                            if "archived:true" in content or "archived: true" in content:
                                is_archived = True
                    except:
                        pass
                        
            if not in_active:
                r[7] = "Deleted"
                deleted_count += 1
            elif is_archived:
                r[7] = "Archived"
                archived_count += 1
            else:
                r[7] = "Active"
                active_count += 1
                
        print(f"Spreadsheet Ground Truth -> Active: {active_count}, Archived: {archived_count}, Deleted: {deleted_count}")
        
        write_range = f"'5 Import - Antigravity Log'!A1:I{len(rows)}"
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=write_range,
            valueInputOption='USER_ENTERED',
            body={'values': rows}
        ).execute()
        print("Spreadsheet successfully synced.")
        
    except Exception as e:
        print(f"Error syncing spreadsheet: {e}")

def main():
    process_archiving()
    sync_spreadsheet()

if __name__ == '__main__':
    main()
