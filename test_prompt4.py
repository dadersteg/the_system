import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_full_doc_text(doc_id):
    with open('auth/token.json', 'r') as f:
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

print("--- DOC 1 ---")
print(get_full_doc_text(doc1_id))
print("\n--- DOC 2 ---")
print(get_full_doc_text(doc2_id))
