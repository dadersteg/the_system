import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"


service = get_service('tasks', 'v1', token_file)
tasks = service.tasks().list(tasklist='ZzZ0aHpMNDJzNEJmMnJhUw', showHidden=True).execute().get('items', [])
for task in tasks:
    print(f"ID: {task.get('id')}")
    print(f"Title: {task.get('title')}")
    print(f"Notes: {task.get('notes')}")
    print("-" * 40)
