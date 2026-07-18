import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"


service = get_service('drive', 'v3', token_file)
results = service.files().list(q="name contains 'Work - 202606 Google Tasks.md'", fields="files(id, name, parents, shared, createdTime, modifiedTime)").execute()
for f in results.get('files', []):
    print(f)
