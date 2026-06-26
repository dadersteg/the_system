import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import io

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

def search_files(creds, queries):
    service = build('drive', 'v3', credentials=creds)
    results = []
    for q in queries:
        response = service.files().list(
            q=f"name='{q}' and mimeType='application/vnd.google-apps.document' and trashed=false",
            fields="files(id, name)"
        ).execute()
        files = response.get('files', [])
        if files:
            results.append(files[0])
    return results

def read_doc(creds, document_id):
    service = build('docs', 'v1', credentials=creds)
    doc = service.documents().get(documentId=document_id).execute()
    text = ""
    for content in doc.get('body').get('content', []):
        if 'paragraph' in content:
            for element in content['paragraph']['elements']:
                if 'textRun' in element:
                    text += element['textRun']['content']
    return text

creds = get_creds()
filenames = [
    "Notes - 202606 Mark Daniel Bi-Daily 1-1",
    "Planning Operations - 202606 Daniel Joseph H2 Planning Notes",
    "Planning Operations - 202606 Research Team Weekly Sharing Meeting Notes",
    "Planning Operations - 202606 Daniel Sergey H2 Planning Notes",
    "Planning Operations - 202606 Daniel Artem H2 Planning Notes"
]
files = search_files(creds, filenames)

import json
file_data = {}
for f in files:
    file_data[f['name']] = read_doc(creds, f['id'])

with open('sim_data.json', 'w') as f:
    json.dump(file_data, f)

print(f"Downloaded content for {len(files)} files.")
