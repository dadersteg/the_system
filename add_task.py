import os
from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials

def main():
    work_token = 'token_tasks_work.json'
    work_creds = 'creds_work.json'
    work_auth = get_credentials(work_token, work_creds, "Work Account")
    
    if work_auth:
        ws = build('tasks', 'v1', credentials=work_auth)
        task_body = {
            'title': 'Integrate MacGyver Gemini gem into workflow',
            'notes': 'Context: 02 01 01',
            'due': '2099-12-31T00:00:00.000Z'
        }
        
        # Insert into the @default tasklist
        inserted = ws.tasks().insert(tasklist='@default', body=task_body).execute()
        print(f"Task inserted successfully with ID: {inserted['id']}")
    else:
        print("Failed to authenticate Work Account.")

if __name__ == '__main__':
    main()
