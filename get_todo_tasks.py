import json
import os
import sys

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token_tasks_work.json"
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

with open(token_file, 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

service = build('tasks', 'v1', credentials=creds)

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
