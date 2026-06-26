import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def list_tasks():
    with open('auth/token_tasks_work.json', 'r') as f:
        creds_data = json.load(f)
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    service = build('tasks', 'v1', credentials=creds)
    
    # Check default list
    results = service.tasks().list(tasklist='@default', showHidden=True, maxResults=100).execute()
    items = results.get('items', [])
    
    print(f"Found {len(items)} tasks in PMT Default list.")
    for i, t in enumerate(items[:20]):
        print(f"[{i}] {t['title']}")

list_tasks()
