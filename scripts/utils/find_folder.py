import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"


service = get_service('drive', 'v3', token_file)
result = service.files().get(fileId='1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb', fields="name").execute()
print(result)
