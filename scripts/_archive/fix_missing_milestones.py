import json
import re
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
with open(token_file, 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

tasks_service = build('tasks', 'v1', credentials=creds)

lists_to_check = [
    "RWNzLU50Qmp1QUZpalhqSg", # Private TODO
    "M05Gb0c1dG91bXlkQUJpVQ", # Work TODO
    "MDI4NDE2MzU3Nzc0OTkzOTU4NzQ6MDow", # Private Importer
    "MDYyMjMzMTg0OTMyNDE4MjM4MDk6MDow"  # Work Importer
]

for list_id in lists_to_check:
    print(f"Fetching tasks from list {list_id}...")
    try:
        response = tasks_service.tasks().list(tasklist=list_id, showCompleted=False, maxResults=100).execute()
        tasks = response.get('items', [])
        
        for t in tasks:
            notes = t.get('notes', '')
            if 'Milestone: None.' in notes or 'Milestone: None' in notes:
                print(f"Task: {t.get('title')}")
                new_notes = notes.replace(' | Milestone: None.', '').replace('Milestone: None.', '').replace(' | Milestone: None', '').replace('Milestone: None', '')
                
                print(f"  -> Cleaning notes to trigger AI review...")
                t['notes'] = new_notes
                tasks_service.tasks().patch(tasklist=list_id, task=t['id'], body={'notes': new_notes}).execute()
    except Exception as e:
        print(f"Error on list {list_id}: {e}")

print("Done.")
