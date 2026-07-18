import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os
import sys
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
]

CREDS_PATH = 'creds_work.json'
TOKEN_PATH = 'token_work_setup.json'
TASKS_TOKEN_PATH = 'token_tasks_work.json'
OUTPUT_MD_PATH = 'setup_work_results.md'

def get_work_credentials():
    creds = None
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired work credentials...")
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Failed to refresh token: {e}. Re-authenticating...")
                creds = None
        
        if not creds:
            if not os.path.exists(CREDS_PATH):
                print(f"Error: Client secrets file '{CREDS_PATH}' not found.")
                print(f"Please place your OAuth client ID credentials in '{CREDS_PATH}'.")
                sys.exit(1)
            
            print("Please authenticate in the browser window that opens.")
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
            creds = flow.run_local_server(port=0, open_browser=True)
            
        with open(TOKEN_PATH, 'w') as token_file:
            token_file.write(creds.to_json())
            print(f"Credentials saved to {TOKEN_PATH}")
            
        with open(TASKS_TOKEN_PATH, 'w') as tasks_token_file:
            tasks_token_file.write(creds.to_json())
            print(f"Credentials duplicated to {TASKS_TOKEN_PATH} for task sync usage.")
            
    return creds

def delete_importer_if_exists(tasks_service):
    print("Checking for dummy 'Importer' list to delete...")
    try:
        lists = tasks_service.tasklists().list().execute().get('items', [])
        for lst in lists:
            if lst['title'].strip().lower() == 'importer':
                print(f"-> Deleting dummy list '{lst['title']}' (ID: {lst['id']})...")
                tasks_service.tasklists().delete(tasklist=lst['id']).execute()
                print("-> Dummy list deleted successfully.")
                break
    except Exception as e:
        print(f"Error deleting dummy Importer list: {e}")

def get_or_create_tasks_list(tasks_service, name):
    print(f"Checking for Tasks List: '{name}'...")
    try:
        lists = tasks_service.tasklists().list().execute().get('items', [])
        for lst in lists:
            if lst['title'].strip().lower() == name.lower():
                print(f"-> Found existing Tasks List: '{lst['title']}' (ID: {lst['id']})")
                return lst['id']
        
        print(f"-> Creating new Tasks List: '{name}'...")
        new_list = tasks_service.tasklists().insert(body={'title': name}).execute()
        print(f"-> Created Tasks List (ID: {new_list['id']})")
        return new_list['id']
    except Exception as e:
        print(f"Error checking/creating Tasks List '{name}': {e}")
        return None

def find_or_create_folder(drive_service, name, parent_id=None):
    print(f"Checking for Google Drive Folder: '{name}' (Parent: {parent_id or 'Root'})...")
    try:
        query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{name}' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        else:
            query += " and 'root' in parents"
            
        results = drive_service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
        if results:
            print(f"-> Found existing Folder: '{results[0]['name']}' (ID: {results[0]['id']})")
            return results[0]['id']
            
        print(f"-> Creating new Folder: '{name}'...")
        file_metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]
            
        new_folder = drive_service.files().create(body=file_metadata, fields='id').execute()
        print(f"-> Created Folder (ID: {new_folder['id']})")
        return new_folder['id']
    except Exception as e:
        print(f"Error checking/creating Folder '{name}': {e}")
        return None

def find_spreadsheets(drive_service):
    print("Searching for Master Spreadsheet in Work Drive...")
    try:
        query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
        results = drive_service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
        return results
    except Exception as e:
        print(f"Error searching for spreadsheets: {e}")
        return []

def main():
    print("====================================================")
    print("      The System: Work Setup Automation Script      ")
    print("====================================================")
    
    creds = get_work_credentials()
    tasks_service = build('tasks', 'v1', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)
    
    # 1. Clean up dummy Importer tasks list if it exists
    delete_importer_if_exists(tasks_service)
    
    # 2. Setup Tasks Lists
    importer_list_id = get_or_create_tasks_list(tasks_service, "My Tasks")
    if not importer_list_id:
        # Fallback if "My Tasks" doesn't match for some reason
        importer_list_id = get_or_create_tasks_list(tasks_service, "My Task")
        
    other_list_names = ["AI Review", "TODO", "To be deleted", "Recurring"]
    task_list_ids = {"Importer": importer_list_id}
    for name in other_list_names:
        task_list_ids[name] = get_or_create_tasks_list(tasks_service, name)
        
    print("\n--- Google Tasks Lists Initialized ---")
    for name, id_ in task_list_ids.items():
        print(f"{name}: {id_}")
        
    # 3. Setup Google Drive Folders
    print("\nInitializing Google Drive Folders...")
    inbox_folder_id = find_or_create_folder(drive_service, "00 Inbox")
    
    dest_tbc_folder_id = find_or_create_folder(drive_service, "Destination TBC", inbox_folder_id)
    review_folder_id = find_or_create_folder(drive_service, "Manual Review", inbox_folder_id)
    
    print("\n--- Google Drive Folders Initialized ---")
    print(f"Ingestion Sources (00 Inbox): {inbox_folder_id}")
    print(f"Fallback Destination (Destination TBC): {dest_tbc_folder_id}")
    print(f"Manual Review Folder: {review_folder_id}")
    
    # 4. Find Spreadsheet Master Sheet candidates
    sheets = find_spreadsheets(drive_service)
    master_sheet_candidates = []
    print("\n--- Google Spreadsheet Master Sheet Candidates ---")
    for s in sheets:
        if "ts" in s['name'].lower() or "system" in s['name'].lower() or "task" in s['name'].lower():
            master_sheet_candidates.append(s)
            print(f"- {s['name']} (ID: {s['id']})")
            
    suggested_sheet_id = master_sheet_candidates[0]['id'] if master_sheet_candidates else "YOUR_WORK_MASTER_SPREADSHEET_ID_HERE"
    
    # Generate Google Apps Script code block (No Retro fields)
    gas_script = f"""function setupWorkUserProperties() {{
  var properties = {{
    "IMPORTER_LIST_ID": "{task_list_ids['Importer']}",
    "AI_REVIEW_LIST_ID": "{task_list_ids['AI Review']}",
    "TODO_LIST_ID": "{task_list_ids['TODO']}",
    "TO_BE_DELETED_LIST_ID": "{task_list_ids['To be deleted']}",
    "RECURRING_LIST_ID": "{task_list_ids['Recurring']}",
    
    "DRIVE_STND_SOURCES": "{inbox_folder_id}",
    "DRIVE_STND_DEST": "{dest_tbc_folder_id}",
    "DRIVE_REVIEW": "{review_folder_id}",
    
    "MASTER_SHEET_ID": "{suggested_sheet_id}",
    "WORKSPACE_FOLDER_ID": "1Jb5PhZnrqsP3uoUE20Lv75eO4zySPyTr"
  }};
  
  var props = PropertiesService.getUserProperties();
  props.setProperties(properties);
  
  Logger.log("=========================================");
  Logger.log("Work Environment User Properties Set Successfully!");
  Logger.log(JSON.stringify(properties, null, 2));
  Logger.log("=========================================");
}}"""

    # Generate results markdown file
    with open(OUTPUT_MD_PATH, 'w') as f:
        f.write("# Work Setup Results\n\n")
        f.write("Your Google Tasks and Drive folders have been initialized on your Work profile.\n\n")
        
        f.write("## 1. Google Tasks Lists\n")
        for name, id_ in task_list_ids.items():
            f.write(f"- **{name} (Importer mapped to My Tasks)**: `{id_}`\n" if name == "Importer" else f"- **{name}**: `{id_}`\n")
            
        f.write("\n## 2. Google Drive Folders\n")
        f.write(f"- **Ingestion Sources (00 Inbox)**: `{inbox_folder_id}`\n")
        f.write(f"- **Fallback Destination (Destination TBC)**: `{dest_tbc_folder_id}`\n")
        f.write(f"- **Manual Review (Manual Review)**: `{review_folder_id}`\n\n")
        
        f.write("## 3. Spreadsheet Candidate\n")
        if master_sheet_candidates:
            f.write(f"Based on Drive search, candidate is: **{master_sheet_candidates[0]['name']}** (`{suggested_sheet_id}`)\n\n")
        else:
            f.write("No candidate spreadsheet containing 'TS', 'System', or 'Task' was found in your Drive root. Please check your sheet ID manually.\n\n")
            
        f.write("## 4. Apps Script Setup Code\n")
        f.write("Copy this code block, open your Work Google Apps Script editor (`1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75`), create a new file or add to an existing file, paste it, and run `setupWorkScriptProperties` once. Afterwards, you can delete this code block from the editor.\n\n")
        f.write(f"```javascript\n{gas_script}\n```\n")

    print("\n====================================================")
    print(f"Setup details saved to: {OUTPUT_MD_PATH}")
    print("====================================================")
    print("Here is your copy-pasteable script block for Apps Script:\n")
    print(gas_script)
    print("\n====================================================")

if __name__ == '__main__':
    main()
