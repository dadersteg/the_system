import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials

def list_tasks():
    service = get_service('tasks', 'v1', 'auth/token.json')
    
    private_ai_review = 'ZzZ0aHpMNDJzNEJmMnJhUw'
    
    results = service.tasks().list(tasklist=private_ai_review, showHidden=True, maxResults=100).execute()
    items = results.get('items', [])
    
    print(f"Found {len(items)} tasks in Private AI Review list.")
    for i, t in enumerate(items):
        status = t.get('status', 'needsAction')
        print(f"[{i}] {t['title']} (Status: {status})")

list_tasks()
