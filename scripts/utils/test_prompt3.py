import json
import urllib.request
import urllib.error
import os

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

def test_gemini(text, filename):
    api_key = os.environ.get('WORK_GEMINI_API_KEY', 'AIzaSyBwAeZtFxURKlyQZsiOHofmYrHBxB5RWYA')
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    prompt = """
## ACTION EXTRACTION & CONFIRMATION MAPPING
1. EXTRACT ASSIGNED ACTIONS: If the file contains meeting notes, project plans, or explicit action items assigned to the user, extract them directly into the `tasks` array with a clear `title` (Action Verb + Object) and `notes`. 
2. FILE PROCESSING ACTIONS: Determine if any implicit action is required to respond to or process the file itself. Do NOT suggest generic actions like "review the file". 
3. If no action is needed from either of the above, return an empty array.
4. CONFIRMATION MAPPING: If the file is a confirmation or update for an existing task from the "OPEN GOOGLE TASKS" list, output its EXACT ID in the `mapped_task_id` field. If this file confirms the mapped task is complete (e.g. it is a receipt, ticket, confirmation letter, or result document), provide a detailed explanation in `mark_completed_reason`. Otherwise, output "None" for both.

Output schema for each file object must include:
{
  "filename": "...",
  "concat_path": "...",
  "summary": "...",
  "description": "...",
  "reasoning": "...",
  "mapped_task_id": "...", // Task ID or "None"
  "mark_completed_reason": "...", // Reason or "None"
  "tasks": [ { "title": "...", "notes": "..." } ]
}
"""
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"text": f"--- FILE [0] ---\nFilename: {filename}\nMETADATA_CONTEXT:\n- dateCreated: Unknown\n- folder_context: Unknown"},
                    {"text": f"CONTENT:\n{text[:8000]}"}
                ]
            }
        ],
        "generationConfig": {"response_mime_type": "application/json", "temperature": 0.1}
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"Results for {filename}:")
            print(result['candidates'][0]['content']['parts'][0]['text'])
    except urllib.error.HTTPError as e:
        print(f"API Error for {filename}: {e.read().decode('utf-8')}")

doc1_id = '1MLYWbrB5ZSw1lsapqEvpTu6PanAchLnQD2UFLGTcxO8'
doc2_id = '1kY1GohL4EMLvaVbh2xdgCYUK6qvK6fc8eEFI7A-p8lU'

print("Running AI Test...")
try:
    text1 = get_full_doc_text(doc1_id)
    test_gemini(text1, "Sync: Daniel <> Traders")
    
    print("\n----------------\n")
    
    text2 = get_full_doc_text(doc2_id)
    test_gemini(text2, "Mark / Daniel - Quick alignment before synch with traders")
except Exception as e:
    print(f"Failed: {e}")
