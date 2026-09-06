import os
import sys
import json
from datetime import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

def get_service_local(token_path):
    if not os.path.exists(token_path):
        return None
    creds = Credentials.from_authorized_user_file(token_path)
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        with open(token_path, 'w') as f:
            f.write(creds.to_json())
    return build('tasks', 'v1', credentials=creds)

auth_dir = '/Users/daniel/Documents/AGY/the_system/auth'
service = get_service_local(os.path.join(auth_dir, 'token_tasks.json'))
service_work = get_service_local(os.path.join(auth_dir, 'token_tasks_work.json'))

# Fetch all tasks in private
lists = service.tasklists().list(maxResults=50).execute().get('items', [])

for lst in lists:
    list_id = lst['id']
    page_token = None
    while True:
        response = service.tasks().list(tasklist=list_id, showCompleted=False, showHidden=True, maxResults=100, pageToken=page_token).execute()
        for task in response.get('items', []):
            title = task.get('title', '')
            
            if title == 'Fix/glue the closet door':
                service.tasks().patch(tasklist=list_id, task=task['id'], body={'due': '2026-07-26T00:00:00.000Z'}).execute()
                print("Updated Fix/glue the closet door")
                
            elif title == 'Track BFI event attendance':
                service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                print("Deleted Track BFI event attendance")
                
            elif title == 'Review and sign Makeup Artist Agreement for 2027 wedding':
                notes = task.get('notes', '')
                if 'Milestone:' not in notes:
                    notes = f"Milestone: [Milestone] Plan 2027 Wedding Logistics\n\n{notes}"
                service.tasks().patch(tasklist=list_id, task=task['id'], body={'due': '2026-07-26T00:00:00.000Z', 'notes': notes}).execute()
                print("Updated Makeup Artist Agreement")
                
            elif title in ['Investigate and restart antigravity-bridge ingestion service', 
                           'Investigate and restart TaskMasterEngine pipeline',
                           "Investigate and fix failed test in 'the_system' GitHub Actions workflow",
                           'Review GitHub Actions failure for the_system',
                           'Investigate and restart sheet-sync-maintenance cron job']:
                service.tasks().patch(tasklist=list_id, task=task['id'], body={'status': 'completed'}).execute()
                print(f"Completed {title}")
                
            elif title == 'Buy fresh basil':
                notes = task.get('notes', '')
                if 'Milestone:' not in notes:
                    notes = f"Milestone: [Milestone] General / Maintenance / BAU\n\n{notes}"
                service.tasks().patch(tasklist=list_id, task=task['id'], body={'notes': notes}).execute()
                print("Updated Buy fresh basil")
                
            elif title == 'Find and book new dentist':
                notes = task.get('notes', '')
                if 'Milestone:' not in notes:
                    notes = f"Milestone: [Milestone] General / Maintenance / BAU\n\n{notes}"
                service.tasks().patch(tasklist=list_id, task=task['id'], body={'notes': notes}).execute()
                print("Updated Find and book new dentist")
                
            elif title == 'Analyze shared video material':
                # Create in work profile
                if service_work:
                    work_lists = service_work.tasklists().list(maxResults=1).execute().get('items', [])
                    if work_lists:
                        w_list_id = work_lists[0]['id']
                        new_task = {'title': title, 'notes': task.get('notes', ''), 'due': task.get('due')}
                        service_work.tasks().insert(tasklist=w_list_id, body=new_task).execute()
                        print("Created 'Analyze shared video material' in Work profile")
                # Delete from private
                service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                print("Deleted 'Analyze shared video material' from Private profile")

        page_token = response.get('nextPageToken')
        if not page_token:
            break
