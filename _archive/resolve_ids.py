import os
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

    # Read from System_File_Registry.csv
    registry_file = '/Users/mac/AGY/System_File_Registry.csv'
    if not os.path.exists(registry_file):
        print("System_File_Registry.csv not found")
        return

    # Cache for paths
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
    
    with open(registry_file, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) < 4: continue
            env, typ, logical_name, gdrive_id = row[0], row[1], row[2], row[3]
            
            # Skip Null or Dynamic
            if gdrive_id == "Dynamic (See Master Sheet)" or "(Null" in gdrive_id:
                results.append([logical_name, env, gdrive_id, "N/A", "N/A"])
                continue

            try:
                # Query Google Drive by ID
                finfo = drive_service.files().get(fileId=gdrive_id, fields="name, parents").execute()
                name = finfo.get('name', 'Unknown')
                parent = finfo.get('parents', [None])[0]
                path = get_folder_path(parent)
                
                print(f"Resolved {logical_name}: {name} at {path}")
                results.append([logical_name, env, gdrive_id, name, path])
            except Exception as e:
                print(f"Error fetching ID {gdrive_id}: {e}")
                results.append([logical_name, env, gdrive_id, f"ERROR: {e}", "N/A"])

    # Map back to CSV
    with open('/Users/mac/AGY/System_Topology_Manifest.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Logical Reference (Code)", "Environment", "Google Drive ID", "Actual File/Folder Name on Drive", "Drive Path", "Description"])
        for r in results:
            writer.writerow([r[0], r[1], r[2], r[3], r[4], "Automatically retrieved from System_File_Registry.csv mappings"])
            
    print("Done writing to System_Topology_Manifest.csv")

if __name__ == '__main__':
    main()
