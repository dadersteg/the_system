import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_doc_text(token_file, doc_id):
    with open(token_file, 'r') as f:
        creds_data = json.load(f)
    
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    
    service = build('docs', 'v1', credentials=creds)
    doc = service.documents().get(documentId=doc_id).execute()
    
    text = ""
    for element in doc.get('body').get('content'):
        if 'paragraph' in element:
            for el in element.get('paragraph').get('elements'):
                if 'textRun' in el:
                    text += el.get('textRun').get('content')
    return text

doc1_id = '1MLYWbrB5ZSw1lsapqEvpTu6PanAchLnQD2UFLGTcxO8'
doc2_id = '1kY1GohL4EMLvaVbh2xdgCYUK6qvK6fc8eEFI7A-p8lU'

try:
    print("Doc 1:")
    print(get_doc_text('auth/token_tasks_work.json', doc1_id)[:500])
except Exception as e:
    print("PMT Token failed for Doc 1:", e)
    try:
        print(get_doc_text('auth/token.json', doc1_id)[:500])
    except Exception as e2:
        print("Personal Token failed for Doc 1:", e2)

try:
    print("\nDoc 2:")
    print(get_doc_text('auth/token_tasks_work.json', doc2_id)[:500])
except Exception as e:
    print("PMT Token failed for Doc 2:", e)
    try:
        print(get_doc_text('auth/token.json', doc2_id)[:500])
    except Exception as e2:
        print("Personal Token failed for Doc 2:", e2)
