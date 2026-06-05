from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials
import os

ps = build('tasks', 'v1', credentials=get_credentials('token_tasks.json' if not os.path.exists('token_tasks_private.json') else 'token_tasks_private.json', 'creds.json' if not os.path.exists('creds_private.json') else 'creds_private.json', "Private Account"))
ws = build('tasks', 'v1', credentials=get_credentials('token_tasks_work.json', 'creds_work.json', "Work Account"))

def fix(service):
    if not service: return
    for lst in service.tasklists().list(maxResults=20).execute().get('items', []):
        for task in service.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', []):
            t = task.get('title', '')
            if 'Obstetric Scan' in t or 'manifest accuracy' in t or 'manifest spreadsheet' in t or 'link clearing issue' in t or 'regulatory notification' in t:
                print(f"Deleting '{t}'...")
                service.tasks().delete(tasklist=lst['id'], task=task['id']).execute()

fix(ps)
fix(ws)
