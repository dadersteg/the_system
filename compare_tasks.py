import os, sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT_DIR = '/Users/daniel/Documents/the_system'
TOKEN_FILE = os.path.join(ROOT_DIR, "token_tasks_work.json")
MARKDOWN_FILE = os.path.join(ROOT_DIR, "../agy_quantum21/artifacts/task_review_table.md")

creds = Credentials.from_authorized_user_file(TOKEN_FILE)
service = build('tasks', 'v1', credentials=creds)

total_tasks_analyze = []
page_token = None
tasklists = []
while True:
    results = service.tasklists().list(maxResults=100, pageToken=page_token).execute()
    tasklists.extend(results.get('items', []))
    page_token = results.get('nextPageToken')
    if not page_token:
        break
for tl in tasklists:
    page_token = None
    while True:
        tasks_results = service.tasks().list(
            tasklist=tl['id'], maxResults=100,
            showCompleted=False, showHidden=False,
            pageToken=page_token).execute()
        for t in tasks_results.get('items', []):
            if t.get('status') == 'needsAction' and not t.get('deleted'):
                total_tasks_analyze.append(t)
        page_token = tasks_results.get('nextPageToken')
        if not page_token:
            break

print("Analyze tasks count:", len(total_tasks_analyze))

total_tasks_verify = []
lists_results = service.tasklists().list(maxResults=100).execute()
task_lists = lists_results.get('items', [])
for task_list in task_lists:
    list_id = task_list['id']
    page_token = None
    while True:
        tasks_results = service.tasks().list(
            tasklist=list_id, maxResults=100,
            showCompleted=False, showHidden=False,
            pageToken=page_token).execute()
        for item in tasks_results.get('items', []):
            if item.get('status') == 'needsAction' and not item.get('deleted'):
                total_tasks_verify.append(item)
        page_token = tasks_results.get('nextPageToken')
        if not page_token:
            break

print("Verify tasks count:", len(total_tasks_verify))
