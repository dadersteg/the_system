import os
import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import re
from datetime import datetime
from collections import defaultdict
from googleapiclient.discovery import build
import io
from googleapiclient.http import MediaIoBaseDownload

# Define directories
BASE_DIR = "/Users/daniel/Documents/AGY/the_system"
DB_DIR = "/Users/daniel/Developer/second_brain_db/data"
os.makedirs(DB_DIR, exist_ok=True)

# Auth
def get_drive_service():
    creds = Credentials.from_authorized_user_file(os.path.join(BASE_DIR, 'auth/token.json'))
    return build('drive', 'v3', credentials=creds)

def list_files_recursively(service, folder_id):
    files = []
    query = f"'{folder_id}' in parents and trashed=false"
    results = service.files().list(q=query, fields="nextPageToken, files(id, name, mimeType)").execute()
    items = results.get('files', [])
    for item in items:
        if item['mimeType'] == 'application/vnd.google-apps.folder':
            files.extend(list_files_recursively(service, item['id']))
        elif item['name'].endswith('.txt'):
            files.append(item)
    return files

def parse_chat_line(line, filename):
    # Try different regex for WhatsApp
    # Format 1: [01/01/2020 12:00:00] Sender: Message
    # Format 2: 01/01/2020, 12:00 - Sender: Message
    # Format 3: 01/01/2020, 12:00 am - Sender: Message
    m1 = re.match(r'\[(\d{2}/\d{2}/\d{4}) (\d{2}:\d{2}:\d{2})\] (.*?): (.*)', line)
    if m1:
        date_str, time_str, sender, content = m1.groups()
        dt = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%Y %H:%M:%S")
        return dt, {"type": "message", "source": "chat_export", "sender": sender, "content": content, "chat_name": filename}
    
    m2 = re.match(r'(\d{2}/\d{2}/\d{4}), (\d{2}:\d{2})(?: [aA][mM]|[pP][mM])? - (.*?): (.*)', line)
    if m2:
        date_str, time_str, sender, content = m2.groups()
        dt = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%Y %H:%M")
        return dt, {"type": "message", "source": "chat_export", "sender": sender, "content": content, "chat_name": filename}
        
    return None, None

def download_and_parse_chats(service, files):
    events = []
    total = len(files)
    for idx, f in enumerate(files):
        print(f"Downloading {idx+1}/{total}: {f['name']}")
        try:
            request = service.files().get_media(fileId=f['id'])
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
            content = fh.getvalue().decode('utf-8', errors='ignore')
        except Exception as e:
            if "Only files with binary content can be downloaded" in str(e):
                try:
                    request = service.files().export_media(fileId=f['id'], mimeType='text/plain')
                    fh = io.BytesIO()
                    downloader = MediaIoBaseDownload(fh, request)
                    done = False
                    while done is False:
                        status, done = downloader.next_chunk()
                    content = fh.getvalue().decode('utf-8', errors='ignore')
                except Exception as ex:
                    print(f"Error exporting {f['name']}: {ex}")
                    continue
            else:
                print(f"Error downloading {f['name']}: {e}")
                continue
        
        for line in content.split('\n'):
            line = line.strip()
            if not line: continue
            dt, event = parse_chat_line(line, f['name'])
            if dt and event:
                event['timestamp'] = dt.isoformat()
                events.append(event)
    return events

def parse_photo_register():
    path = os.path.join(BASE_DIR, "scratch/photo_register.json")
    events = []
    if not os.path.exists(path):
        return events
    with open(path, 'r') as f:
        data = json.load(f)
    for filename, item in data.items():
        ts = item.get('date') or item.get('timestamp')
        if not ts: continue
        events.append({
            "type": "photo",
            "source": "photo_register",
            "timestamp": ts,
            "filename": filename,
            "url": item.get('url'),
            "ai_analysis": item.get('ai_analysis')
        })
    return events

def parse_jsonl(filepath, source_type):
    events = []
    if not os.path.exists(filepath):
        return events
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                data = json.loads(line)
                data['source'] = source_type
                events.append(data)
            except:
                pass
    return events

def main():
    print("Starting Second Brain Database Consolidation...")
    service = get_drive_service()
    
    print("1. Fetching Historic Message Register from Drive...")
    chat_files = list_files_recursively(service, '17UhZsFz9DBwzukotWtS0cth0Xxwa6NB-')
    print(f"Found {len(chat_files)} chat export files.")
    chat_events = download_and_parse_chats(service, chat_files)
    
    print("2. Parsing local Photo Register...")
    photo_events = parse_photo_register()
    
    print("3. Parsing Clerk Email and Drive logs...")
    email_events = parse_jsonl(os.path.join(BASE_DIR, "exports/Email_Tracker_All.jsonl"), "email")
    drive_events = parse_jsonl(os.path.join(BASE_DIR, "exports/Drive_Tracker_All.jsonl"), "drive")
    
    all_events = chat_events + photo_events + email_events + drive_events
    print(f"Total events gathered: {len(all_events)}")
    
    # Group by YYYY-MM-DD
    grouped = defaultdict(list)
    date_regex = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    
    for event in all_events:
        ts = event.get('timestamp') or event.get('Date')
        if not ts or not isinstance(ts, str): continue
        try:
            # Parse prefix YYYY-MM-DD
            day_str = ts[:10]
            if date_regex.match(day_str):
                grouped[day_str].append(event)
            else:
                # Fallback check if it's a timestamp string that can be parsed
                try:
                    dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                    grouped[dt.strftime('%Y-%m-%d')].append(event)
                except ValueError:
                    pass
        except:
            pass
            
    print("Writing grouped partitioned files...")
    for day, evs in grouped.items():
        with open(os.path.join(DB_DIR, f"{day}.json"), 'w') as f:
            json.dump(evs, f, indent=2)
            
    print("Consolidation complete!")

if __name__ == "__main__":
    main()
