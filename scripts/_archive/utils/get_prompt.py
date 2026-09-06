import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import io

def get_file_content(file_id, token_file):
    try:
        service = get_service('drive', 'v3', token_file)
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        from googleapiclient.http import MediaIoBaseDownload
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        return fh.getvalue().decode('utf-8')
    except Exception as e:
        return f"Error: {e}"

print(get_file_content("12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", "auth/token.json"))
