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

def search_files(creds):
    service = build('drive', 'v3', credentials=creds)
    # Search for files with "Notes by Gemini" in the name
    response = service.files().list(
        q="name contains 'Notes by Gemini' and mimeType='application/vnd.google-apps.document' and trashed=false",
        fields="files(id, name, createdTime)",
        orderBy="createdTime desc",
        pageSize=10
    ).execute()
    return response.get('files', [])

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
files = search_files(creds)

file_data = {}
for f in files:
    # Double check if it's from today or yesterday
    if "2026/06/26" in f['name'] or "2026-06-26" in f.get('createdTime', ''):
         file_data[f['name']] = read_doc(creds, f['id'])
         print("Added:", f['name'])

with open('sim_data.json', 'w') as f:
    json.dump(file_data, f)

print(f"Downloaded content for {len(file_data)} files.")
