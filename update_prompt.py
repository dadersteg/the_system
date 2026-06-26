import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

def update_file(file_id, token_file, local_file):
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
    media = MediaFileUpload(local_file, mimetype='text/markdown')
    updated_file = service.files().update(
        fileId=file_id,
        media_body=media
    ).execute()
    return updated_file.get('id')

print("Updated File ID:", update_file("12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", "auth/token.json", "current_prompt.md"))
