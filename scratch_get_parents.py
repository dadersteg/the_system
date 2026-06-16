import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds_path = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
with open(creds_path, 'r') as f:
    creds_data = json.load(f)
creds = Credentials.from_authorized_user_info(creds_data)
drive_service = build('drive', 'v3', credentials=creds)

results = drive_service.files().list(q="name = '05_project_pmt' and mimeType = 'application/vnd.google-apps.folder'", fields="files(id, name, parents)").execute()
files = results.get('files', [])
if not files:
    print("Folder not found.")
else:
    for f in files:
        print(f"Name: {f['name']}, ID: {f['id']}, Parents: {f.get('parents', [])}")
        
        # let's traverse up to see if any parent is MacMini Documents etc
        current_id = f['id']
        while current_id:
            res = drive_service.files().get(fileId=current_id, fields="id, name, parents").execute()
            print(f" -> {res['name']} ({res['id']})")
            parents = res.get('parents', [])
            if parents:
                current_id = parents[0]
            else:
                break
