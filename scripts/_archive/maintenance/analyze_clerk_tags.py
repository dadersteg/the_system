import os
from datetime import datetime
from collections import defaultdict
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

token_path = os.path.join('/Users/daniel/Documents/AGY/the_system/auth', 'token_drive.json')
creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
drive_service = build('drive', 'v3', credentials=creds)

def has_clerk_tag(file):
    desc = file.get('description', '')
    return bool(desc and ('#' in desc or '[CLERK PROCESSED]' in desc or 'Taxonomy:' in desc))

print("Fetching folders...")
folders = {}
page_token = None
while True:
    results = drive_service.files().list(
        q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields="nextPageToken, files(id, name, parents)",
        pageToken=page_token,
        pageSize=1000,
        corpora='allDrives',
        includeItemsFromAllDrives=True,
        supportsAllDrives=True
    ).execute()
    for f in results.get('files', []):
        folders[f['id']] = f
    page_token = results.get('nextPageToken')
    if not page_token:
        break

def get_3_level_path(file):
    parents = file.get('parents')
    if not parents:
        return "Root"
    
    path_parts = []
    current_id = parents[0]
    while current_id in folders:
        path_parts.insert(0, folders[current_id]['name'])
        parents = folders[current_id].get('parents')
        if parents:
            current_id = parents[0]
        else:
            break
    
    if not path_parts:
        return "Unknown"
        
    return " / ".join(path_parts[:3])

print("Fetching files...")
files = []
page_token = None
while True:
    results = drive_service.files().list(
        q="mimeType != 'application/vnd.google-apps.folder' and trashed = false",
        fields="nextPageToken, files(id, name, description, createdTime, parents)",
        pageToken=page_token,
        pageSize=1000,
        corpora='allDrives',
        includeItemsFromAllDrives=True,
        supportsAllDrives=True
    ).execute()
    files.extend(results.get('files', []))
    page_token = results.get('nextPageToken')
    if not page_token:
        break

print(f"Total files analyzed: {len(files)}")

intervals = defaultdict(lambda: {'total': 0, 'tagged': 0})
paths = defaultdict(lambda: {'total': 0, 'tagged': 0})

for f in files:
    tagged = has_clerk_tag(f)
    
    # Bucket by 6 months
    created_time = f.get('createdTime')
    if created_time:
        try:
            dt = datetime.strptime(created_time[:10], "%Y-%m-%d")
            half = 1 if dt.month <= 6 else 2
            interval_key = f"{dt.year} H{half}"
        except:
            interval_key = "Unknown"
    else:
        interval_key = "Unknown"
        
    intervals[interval_key]['total'] += 1
    if tagged:
        intervals[interval_key]['tagged'] += 1
        
    # Bucket by path
    path_key = get_3_level_path(f)
    paths[path_key]['total'] += 1
    if tagged:
        paths[path_key]['tagged'] += 1

print("\n=== CLERK TAGS BY 6-MONTH INTERVAL ===")
for k in sorted(intervals.keys()):
    d = intervals[k]
    if d['total'] > 0:
        pct = (d['tagged'] / d['total']) * 100
        print(f"{k}: {d['tagged']} / {d['total']} ({pct:.1f}%)")

print("\n=== CLERK TAGS BY FOLDER (Top 25, 3 Levels Deep) ===")
sorted_paths = sorted(paths.items(), key=lambda x: x[1]['total'], reverse=True)
for path, d in sorted_paths[:25]:
    if d['total'] > 0:
        pct = (d['tagged'] / d['total']) * 100
        print(f"{path}: {d['tagged']} / {d['total']} ({pct:.1f}%)")
