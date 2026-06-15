import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds_path = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
with open(creds_path, 'r') as f:
    creds_data = json.load(f)
creds = Credentials.from_authorized_user_info(creds_data)
drive_service = build('drive', 'v3', credentials=creds)

FOLDERS = {
    "Private": "1ylbggzC_eIJAMu-_AwPj7YJL1Z_uuoOJ",
    "PMT": "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"
}

FILES = [
    ("Email Tracker Digest (14 Days) - JSONL", "Email_Tracker_14d.jsonl", "text/plain"),
    ("Email Tracker Digest (14 Days) - CSV", "Email_Tracker_14d.csv", "text/csv"),
    ("Email Tracker Digest (All) - JSONL", "Email_Tracker_All.jsonl", "text/plain"),
    ("Email Tracker Digest (All) - CSV", "Email_Tracker_All.csv", "text/csv"),
    ("Drive Tracker Digest (14 Days) - JSONL", "Drive_Tracker_14d.jsonl", "text/plain"),
    ("Drive Tracker Digest (14 Days) - CSV", "Drive_Tracker_14d.csv", "text/csv"),
    ("Drive Tracker Digest (All) - JSONL", "Drive_Tracker_All.jsonl", "text/plain"),
    ("Drive Tracker Digest (All) - CSV", "Drive_Tracker_All.csv", "text/csv")
]

results = {"Private": {}, "PMT": {}}

for env, folder_id in FOLDERS.items():
    print(f"Checking {env} folder...")
    for title, filename, mimetype in FILES:
        # Check if exists
        q = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        res = drive_service.files().list(q=q, fields="files(id, name)").execute()
        files = res.get('files', [])
        
        if files:
            file_id = files[0]['id']
            print(f"  Found {filename}: {file_id}")
        else:
            file_metadata = {
                'name': filename,
                'parents': [folder_id],
                'mimeType': mimetype
            }
            file = drive_service.files().create(body=file_metadata, fields='id').execute()
            file_id = file.get('id')
            print(f"  Created {filename}: {file_id}")
            
        results[env][filename] = file_id

# Generate Systematic Overview Rows
print("\nSystematic Overview Rows JSON:")
rows = []
for title, filename, mimetype in FILES:
    priv_link = f"https://drive.google.com/file/d/{results['Private'][filename]}/view"
    pmt_link = f"https://drive.google.com/file/d/{results['PMT'][filename]}/view"
    rows.append([
        "Generated Outputs",
        title,
        filename,
        filename,
        priv_link,
        pmt_link
    ])

print(json.dumps(rows, indent=2))
