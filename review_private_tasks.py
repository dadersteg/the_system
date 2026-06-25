import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def list_tasks():
    with open('auth/token.json', 'r') as f:
        creds_data = json.load(f)
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    service = build('tasks', 'v1', credentials=creds)
    
    private_ai_review = 'ZzZ0aHpMNDJzNEJmMnJhUw'
    
    results = service.tasks().list(tasklist=private_ai_review, showHidden=True, maxResults=100).execute()
    items = results.get('items', [])
    
    print(f"Found {len(items)} tasks in Private AI Review list.")
    for i, t in enumerate(items):
        status = t.get('status', 'needsAction')
        print(f"[{i}] {t['title']} (Status: {status})")

list_tasks()
