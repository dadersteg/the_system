import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os


drive_service = get_service('drive', 'v3', "auth/token.json")
request = drive_service.files().get_media(fileId="12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW")
content = request.execute().decode('utf-8')
print("---CONTENT_START---")
print(content[:500])
print("...")
print(content[-500:])
print("---CONTENT_END---")
