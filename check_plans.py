import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import urllib.request
import io

def get_file_content(file_id, token_file):
    try:
        with open(token_file, 'r') as f:
            creds_data = json.load(f)
        creds = Credentials(
            token=creds_data['token'],
            refresh_token=creds_data['refresh_token'],
            token_uri=creds_data['token_uri'],
            client_id=creds_data['client_id'],
            client_secret=creds_data['client_secret']
        )
        service = build('drive', 'v3', credentials=creds)
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

print("=== PMT FILE ===")
print(get_file_content("1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7", "auth/token_tasks_work.json")[:500])

print("\n=== PRIVATE FILE ===")
print(get_file_content("1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq", "auth/token.json")[:500])
