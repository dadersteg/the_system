import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import io
import os
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

creds = Credentials.from_authorized_user_file('token.json')
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

service = build('drive', 'v3', credentials=creds)
file_id = '13DZH8k-Sy1uAvElcmCEnpdFraI13RX23ry80vIXcfD4'
request = service.files().export_media(fileId=file_id, mimeType='text/plain')
fh = io.FileIO('strategic_goals.txt', 'wb')
downloader = MediaIoBaseDownload(fh, request)
done = False
while done is False:
    status, done = downloader.next_chunk()
    print(f"Download {int(status.progress() * 100)}%.")
