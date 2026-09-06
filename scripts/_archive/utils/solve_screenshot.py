import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os
from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials

def main():
    # Delete Drive File
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json')
        drive_service = build('drive', 'v3', credentials=creds)
        file_id = '1zdLr14joq0kC345NCIBrHLFO0Sr5ugSo'
        try:
            drive_service.files().delete(fileId=file_id).execute()
            print(f"Successfully deleted file ID: {file_id}")
        except Exception as e:
            print(f"Drive API Error (delete): {e}")
            try:
                # If delete fails, try trash
                drive_service.files().update(fileId=file_id, body={'trashed': True}).execute()
                print(f"Successfully trashed file ID: {file_id}")
            except Exception as e2:
                print(f"Drive API Error (trash): {e2}")

    # Mark Task Complete
    ps = build('tasks', 'v1', credentials=get_credentials('token_tasks.json' if not os.path.exists('token_tasks_private.json') else 'token_tasks_private.json', 'creds.json' if not os.path.exists('creds_private.json') else 'creds_private.json', "Private Account"))
    
    for lst in ps.tasklists().list(maxResults=20).execute().get('items', []):
        for task in ps.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', []):
            if 'Delete empty screenshot' in task.get('title', ''):
                task['status'] = 'completed'
                ps.tasks().update(tasklist=lst['id'], task=task['id'], body=task).execute()
                print("Task 'Delete empty screenshot' marked as completed.")

if __name__ == '__main__':
    main()
