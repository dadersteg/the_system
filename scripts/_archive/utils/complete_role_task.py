import os
from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials

ps = build('tasks', 'v1', credentials=get_credentials('../../token_tasks.json' if not os.path.exists('../../token_tasks_private.json') else '../../token_tasks_private.json', '../../creds.json' if not os.path.exists('../../creds_private.json') else '../../creds_private.json', "Private Account"))

def mark_complete():
    for lst in ps.tasklists().list(maxResults=20).execute().get('items', []):
        for task in ps.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', []):
            if 'Define roles: SystemsArchitect vs TaskMaster' in task.get('title', ''):
                task['status'] = 'completed'
                ps.tasks().update(tasklist=lst['id'], task=task['id'], body=task).execute()
                print("Task marked as completed.")

mark_complete()
