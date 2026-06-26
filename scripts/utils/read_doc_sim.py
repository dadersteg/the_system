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
doc1 = read_doc(creds, "1MLYWbrB5ZSw1lsapqEvpTu6PanAchLnQD2UFLGTcxO8")
doc2 = read_doc(creds, "1kY1GohL4EMLvaVbh2xdgCYUK6qvK6fc8eEFI7A-p8lU")

print("--- DOC 1 ---")
print(doc1)
print("--- DOC 2 ---")
print(doc2)
