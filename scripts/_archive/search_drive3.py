import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_creds():
    with open('auth/token.json', 'r') as f:
        creds_data = json.load(f)
    return Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )

service = build('drive', 'v3', credentials=get_creds())
# Search for files with "Notes" in the name created today
response = service.files().list(
    q="name contains 'Notes' and mimeType='application/vnd.google-apps.document' and trashed=false",
    fields="files(id, name, createdTime)",
    orderBy="createdTime desc",
    pageSize=20
).execute()

for f in response.get('files', []):
    print(f"{f['createdTime']} | {f['name']}")

