import os, json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

private_token = os.path.join('auth', 'token_tasks_private.json')
if not os.path.exists(private_token): private_token = os.path.join('auth', 'token_tasks.json')
creds = Credentials.from_authorized_user_file(private_token)
service = build('tasks', 'v1', credentials=creds)

lists = service.tasklists().list(maxResults=20).execute().get('items', [])
for lst in lists:
    tasks = service.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', [])
    for t in tasks:
        if 'Handbook' in t.get('title', ''):
            print(f"List: {lst['title']}")
            print(json.dumps(t, indent=2))
