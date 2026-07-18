import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials

def list_tasks():
    service = get_service('tasks', 'v1', 'auth/token_tasks_work.json')
    
    # Check default list
    results = service.tasks().list(tasklist='@default', showHidden=True, maxResults=100).execute()
    items = results.get('items', [])
    
    print(f"Found {len(items)} tasks in PMT Default list.")
    for i, t in enumerate(items[:20]):
        print(f"[{i}] {t['title']}")

list_tasks()
