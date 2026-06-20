import os, sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_service(token_path):
    if not os.path.exists(token_path): return None
    creds = Credentials.from_authorized_user_file(token_path)
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        with open(token_path, 'w') as f: f.write(creds.to_json())
    return build('tasks', 'v1', credentials=creds)

def main():
    script_dir = os.path.dirname(os.path.realpath(__file__))
    work_token = os.path.join(script_dir, '../../auth', 'token_tasks_work.json')
    service = get_service(work_token)
    
    lists = service.tasklists().list().execute().get('items', [])
    ai_review_id = next((lst['id'] for lst in lists if "ai review" in lst['title'].lower()), None)
    
    tasks = service.tasks().list(tasklist=ai_review_id, showCompleted=False).execute().get('items', [])
    for t in tasks:
        print(f"Deleting: {t.get('title')}")
        service.tasks().delete(tasklist=ai_review_id, task=t['id']).execute()

if __name__ == "__main__": main()
