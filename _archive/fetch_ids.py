import os
import json
import csv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    token_path = 'token.json'
    if not os.path.exists(token_path):
        print("token.json not found")
        return

    creds = Credentials.from_authorized_user_file(
        token_path, 
        ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)

    files_to_find = [
        "sync_tasks_combined.py", "check_system_health.py", "deploy.sh",
        "System_ID_Manifest.json", "creds_private.json", "creds_work.json",
        "client_secret.json", "token_tasks.json", "token_tasks_work.json",
        "requirements.txt", "rules.agy", "WoS_Taxonomy.json", "WoS_Taxonomy.csv",
        "DB_Execution.csv", "DB_Performance.csv", "Google Tasks.md",
        "Google Tasks (Combined).md", "Google Tasks (Work).md",
        "TS - Task Master > 1 Day Execution Plan (Private).md",
        "TS - Task Master > 1 Day Execution Plan.md",
        "TS - Task Master > 7 Day Roadmap.md",
        "TS - Task Master > 28 Day Strategic Pruning.md",
        "TS - Task Master > 84 Day Strategic Reflection.md",
        "TS - Task Master > Global Priority Review.md",
        "Task_Correction_Dossier.md", "Strategic_Next_Steps_Report.md",
        "Task_Master_Prompt.md", "Task_Master_84_Day_Prompt.md",
        "Task_Master_28_Day_Prompt.md", "Task_Master_7_Day_Prompt.md",
        "TS - Task Master > 1 Day Operations Prompt.md",
        "TS - Categorisation (Work).md", "TS - Categorisation.md",
        "TS Categorisation WoS.md", "System_Topology_Manifest.csv"
    ]

    print("Fetching files from Drive...")
    
    # Simple cache to resolve paths
    folders_cache = {}
    def get_folder_path(folder_id):
        if not folder_id: return ""
        if folder_id in folders_cache: return folders_cache[folder_id]
        try:
            f = drive_service.files().get(fileId=folder_id, fields="name, parents").execute()
            parent = f.get('parents', [None])[0]
            if parent:
                path = get_folder_path(parent) + "/" + f.get('name')
            else:
                path = "/" + f.get('name')
            folders_cache[folder_id] = path
            return path
        except:
            return ""

    results = []
    for filename in files_to_find:
        try:
            # Query by exact name
            q = f"name = '{filename}' and trashed = false"
            response = drive_service.files().list(q=q, fields="files(id, name, parents)", pageSize=1).execute()
            items = response.get('files', [])
            if items:
                file_id = items[0]['id']
                parent_id = items[0].get('parents', [None])[0]
                path = get_folder_path(parent_id)
                results.append((filename, file_id, path))
                print(f"Found: {filename} -> {file_id} in {path}")
            else:
                results.append((filename, "NOT FOUND ON DRIVE", "N/A"))
                print(f"Not found: {filename}")
        except Exception as e:
            results.append((filename, f"ERROR: {e}", "N/A"))
            print(f"Error finding {filename}: {e}")

    # Write to local CSV
    with open('/Users/daniel/Documents/AGY/the_system/System_Topology_Manifest_Drive.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Filename", "Google Drive ID", "Drive Path"])
        for r in results:
            writer.writerow(r)
    print("Saved to /Users/daniel/Documents/AGY/the_system/System_Topology_Manifest_Drive.csv")

if __name__ == '__main__':
    main()
