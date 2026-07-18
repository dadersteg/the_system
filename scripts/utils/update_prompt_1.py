import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
from googleapiclient.http import MediaFileUpload

def update_file(file_id, token_file, local_file):
    service = get_service('drive', 'v3', token_file)
    media = MediaFileUpload(local_file, mimetype='text/markdown')
    updated_file = service.files().update(
        fileId=file_id,
        media_body=media
    ).execute()
    return updated_file.get('id')

print("Updated File ID:", update_file("12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", "auth/token.json", "current_prompt.md"))
