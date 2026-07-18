import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os
import sys

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token_tasks_work.json"


service = get_service('tasks', 'v1', token_file)

todo_list_id = "M05Gb0c1dG91bXlkQUJpVQ"

all_tasks = []
page_token = None
while True:
    results = service.tasks().list(
        tasklist=todo_list_id, 
        showCompleted=False, 
        showHidden=False, 
        maxResults=100,
        pageToken=page_token
    ).execute()
    
    items = results.get('items', [])
    all_tasks.extend(items)
    page_token = results.get('nextPageToken')
    if not page_token:
        break

with open('pmt_todo_tasks.json', 'w') as f:
    json.dump(all_tasks, f, indent=2)

print(f"Downloaded {len(all_tasks)} tasks.")
