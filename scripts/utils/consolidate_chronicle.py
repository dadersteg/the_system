import os
import json
import io
import re
from datetime import datetime
from collections import defaultdict
import glob
import shutil

# To handle messages from Drive
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

CHRONICLE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'chronicle')
EXPORTS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'exports')
TOKEN_PATH = os.path.expanduser('~/.google_calendar_token.json')
TARGET_RELATIONSHIPS_FOLDER = '1tocVx4JshCVTPjYtzumY_bHgnIwvzocr'

# Chronicle schema
# {
#   "timestamp": "ISO 8601 string",
#   "source": "email|drive|message",
#   "content": "Message text, Email summary, or Photo summary",
#   "metadata": {}
# }

def parse_datetime(dt_str, formats):
    for fmt in formats:
        try:
            return datetime.strptime(dt_str, fmt)
        except ValueError:
            continue
    return None

def consolidate_emails(chronicle_data):
    print("Consolidating Emails...")
    email_file = os.path.join(EXPORTS_DIR, 'Email_Tracker_All.jsonl')
    if not os.path.exists(email_file):
        print(f"Skipping emails, {email_file} not found.")
        return

    with open(email_file, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip(): continue
            try:
                data = json.loads(line)
                dt_str = data.get('timestamp', '')
                if not dt_str: continue
                
                # e.g., 2026-04-30 16:02
                dt = parse_datetime(dt_str, ['%Y-%m-%d %H:%M'])
                if not dt: continue

                date_key = dt.strftime('%Y-%m-%d')
                
                chronicle_entry = {
                    "timestamp": dt.isoformat(),
                    "source": "email",
                    "content": data.get('summary', '') or data.get('subject', ''),
                    "metadata": {
                        "sender": data.get('sender', ''),
                        "subject": data.get('subject', ''),
                        "labels": data.get('labels', ''),
                        "url": data.get('link', '')
                    }
                }
                chronicle_data[date_key].append(chronicle_entry)
            except Exception as e:
                pass

def consolidate_drive_files(chronicle_data):
    print("Consolidating Drive Files (Photos/Docs)...")
    drive_file = os.path.join(EXPORTS_DIR, 'Drive_Tracker_All.jsonl')
    if not os.path.exists(drive_file):
        print(f"Skipping drive, {drive_file} not found.")
        return

    with open(drive_file, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip(): continue
            try:
                data = json.loads(line)
                dt_str = data.get('timestamp', '')
                if not dt_str: continue # Many lack timestamps
                
                dt = parse_datetime(dt_str, ['%Y-%m-%d %H:%M', '%Y-%m-%d'])
                if not dt: continue

                date_key = dt.strftime('%Y-%m-%d')
                
                chronicle_entry = {
                    "timestamp": dt.isoformat(),
                    "source": "drive",
                    "content": data.get('summary', '') or data.get('finalName', ''),
                    "metadata": {
                        "originalName": data.get('originalName', ''),
                        "url": data.get('url', ''),
                        "targetPath": data.get('targetPath', '')
                    }
                }
                chronicle_data[date_key].append(chronicle_entry)
            except Exception as e:
                pass

def consolidate_messages_from_drive(chronicle_data):
    print("Consolidating WhatsApp/Messenger from Google Drive...")
    try:
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, ['https://www.googleapis.com/auth/drive'])
        drive_service = build('drive', 'v3', credentials=creds)
    except Exception as e:
        print("Failed to authenticate with Google Drive. Skipping messages.")
        return

    query_msg = "name = 'Messages' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    res = drive_service.files().list(q=query_msg, fields="files(id)").execute()
    files = res.get('files', [])
    if not files:
        print("Messages folder not found.")
        return
        
    target_folder_id = files[0]['id']
    query_live = f"'{target_folder_id}' in parents and mimeType = 'text/plain' and trashed = false"
    
    live_files = []
    page_token = None
    while True:
        res = drive_service.files().list(q=query_live, fields="nextPageToken, files(id, name)", pageToken=page_token, pageSize=1000).execute()
        live_files.extend(res.get('files', []))
        page_token = res.get('nextPageToken')
        if not page_token: break

    print(f"Found {len(live_files)} message export files to process.")
    LIVE_REGEX = re.compile(r'^\[(Instagram|Messenger|WhatsApp)\] \[(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]?[\s\-:]+([^:]+):\s*(.*)')

    for idx, f in enumerate(live_files):
        if idx > 0 and idx % 10 == 0:
            print(f"Processed {idx}/{len(live_files)} message files...")
            
        try:
            request = drive_service.files().get_media(fileId=f['id'])
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            content = fh.getvalue().decode('utf-8', errors='ignore')
        except Exception as e:
            continue
            
        for line in content.split('\n'):
            line = line.strip()
            if not line: continue
            
            m = LIVE_REGEX.match(line)
            if m:
                platform, date_str, time_str, sender, msg = m.groups()
                date_str = date_str.replace('.', '/')
                
                formats = ['%d/%m/%Y', '%m/%d/%Y', '%d/%m/%y', '%m/%d/%y', '%Y/%m/%d']
                is_ampm = 'am' in time_str.lower() or 'pm' in time_str.lower()
                dt = None
                for fmt in formats:
                    try:
                        if is_ampm: dt = datetime.strptime(f"{date_str} {time_str}", f"{fmt} %I:%M %p")
                        elif len(time_str.split(':')) == 3: dt = datetime.strptime(f"{date_str} {time_str}", f"{fmt} %H:%M:%S")
                        else: dt = datetime.strptime(f"{date_str} {time_str}", f"{fmt} %H:%M")
                        break
                    except ValueError: continue
                
                if dt:
                    date_key = dt.strftime('%Y-%m-%d')
                    chronicle_entry = {
                        "timestamp": dt.isoformat(),
                        "source": "message",
                        "content": msg,
                        "metadata": {
                            "platform": platform,
                            "sender": sender,
                            "contact_file": f['name']
                        }
                    }
                    chronicle_data[date_key].append(chronicle_entry)

def main():
    if not os.path.exists(CHRONICLE_DIR):
        os.makedirs(CHRONICLE_DIR)
        print(f"Created {CHRONICLE_DIR}")

    chronicle_data = defaultdict(list)
    
    consolidate_emails(chronicle_data)
    consolidate_drive_files(chronicle_data)
    consolidate_messages_from_drive(chronicle_data)
    
    print(f"Writing {len(chronicle_data)} daily partitioned files...")
    for date_key, entries in chronicle_data.items():
        # Sort by timestamp
        entries.sort(key=lambda x: x['timestamp'])
        
        file_path = os.path.join(CHRONICLE_DIR, f"{date_key}.json")
        
        # If file exists, merge and deduplicate
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    existing = json.load(f)
                    entries.extend(existing)
                except json.JSONDecodeError:
                    pass
        
        # Deduplicate (naive approach via stringifying)
        seen = set()
        unique_entries = []
        for e in entries:
            e_str = json.dumps(e, sort_keys=True)
            if e_str not in seen:
                seen.add(e_str)
                unique_entries.append(e)
                
        unique_entries.sort(key=lambda x: x['timestamp'])
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(unique_entries, f, indent=2, ensure_ascii=False)
            
    print("Consolidation complete.")

if __name__ == '__main__':
    main()
