import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def search_tasks():
    auth_dir = 'auth'
    private_token = os.path.join(auth_dir, 'token_tasks_private.json')
    if not os.path.exists(private_token): private_token = os.path.join(auth_dir, 'token_tasks.json')
    
    if os.path.exists(private_token):
        creds = Credentials.from_authorized_user_file(private_token)
        service = build('tasks', 'v1', credentials=creds)
        print("Checking Private tasks...")
        lists = service.tasklists().list(maxResults=20).execute().get('items', [])
        for lst in lists:
            tasks = service.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', [])
            for t in tasks:
                if 'Zygimantas' in t.get('title', ''):
                    print(f"FOUND IN PRIVATE LIST: {lst['title']}")
                    print(json.dumps(t, indent=2))
                    return

    work_token = os.path.join(auth_dir, 'token_tasks_work.json')
    if os.path.exists(work_token):
        creds = Credentials.from_authorized_user_file(work_token)
        service = build('tasks', 'v1', credentials=creds)
        print("Checking Work tasks...")
        lists = service.tasklists().list(maxResults=20).execute().get('items', [])
        for lst in lists:
            tasks = service.tasks().list(tasklist=lst['id'], showCompleted=False).execute().get('items', [])
            for t in tasks:
                if 'Zygimantas' in t.get('title', ''):
                    print(f"FOUND IN WORK LIST: {lst['title']}")
                    print(json.dumps(t, indent=2))
                    return
    print("Not found.")

search_tasks()
