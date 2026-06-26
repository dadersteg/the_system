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

names = [
    "Notes - 202606 Mark Daniel Bi-Daily 1-1",
    "Planning Operations - 202606 Daniel Joseph H2 Planning Notes"
]

for name in names:
    response = service.files().list(
        q=f"name='{name}'",
        fields="files(id, name, createdTime, trashed)",
    ).execute()
    for f in response.get('files', []):
        print(f"{f['id']} | {f['name']} | Trashed: {f.get('trashed')}")
