import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/data/token_tasks_work.json')
service = build('tasks', 'v1', credentials=creds)

lists_results = service.tasklists().list(maxResults=100).execute()
task_lists = lists_results.get('items', [])
empty_tasks = 0
for tl in task_lists:
    page_token = None
    while True:
        tasks_results = service.tasks().list(
            tasklist=tl['id'], maxResults=100,
            showCompleted=False, showHidden=False,
            pageToken=page_token).execute()
        for t in tasks_results.get('items', []):
            if t.get('status') == 'needsAction' and not t.get('deleted'):
                title = t.get('title', '').strip()
                notes = t.get('notes', '').strip()
                if not title or not notes:
                    print(f"Task with empty title/notes: {t['id']}")
                    empty_tasks += 1
        page_token = tasks_results.get('nextPageToken')
        if not page_token:
            break
print("Total empty tasks:", empty_tasks)
