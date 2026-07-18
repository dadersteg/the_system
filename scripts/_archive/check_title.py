import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/data/token_tasks_work.json')
service = build('tasks', 'v1', credentials=creds)

lists_results = service.tasklists().list(maxResults=100).execute()
for tl in lists_results.get('items', []):
    page_token = None
    while True:
        tasks_results = service.tasks().list(
            tasklist=tl['id'], maxResults=100,
            showCompleted=False, showHidden=False,
            pageToken=page_token).execute()
        for t in tasks_results.get('items', []):
            if t.get('title', '').strip() == 'title':
                print(f"FOUND FAKE TASK! {t}")
        page_token = tasks_results.get('nextPageToken')
        if not page_token:
            break
