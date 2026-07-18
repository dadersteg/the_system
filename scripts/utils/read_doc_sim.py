import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
from googleapiclient.discovery import build

def get_creds():
    return get_credentials('auth/token.json')

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
