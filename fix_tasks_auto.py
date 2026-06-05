import os
import json
from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials

def get_services():
    private_token = 'token_tasks_private.json' if os.path.exists('token_tasks_private.json') else 'token_tasks.json'
    private_creds = 'creds_private.json' if os.path.exists('creds_private.json') else 'creds.json'
    work_token = 'token_tasks_work.json'
    work_creds = 'creds_work.json'
    
    private_auth = get_credentials(private_token, private_creds, "Private Account")
    work_auth = get_credentials(work_token, work_creds, "Work Account")
    
    ps = build('tasks', 'v1', credentials=private_auth) if private_auth else None
    ws = build('tasks', 'v1', credentials=work_auth) if work_auth else None
    return ps, ws

def fix_tasks(service, name):
    if not service: return
    task_lists = service.tasklists().list(maxResults=20).execute().get('items', [])
    for lst in task_lists:
        list_id = lst['id']
        tasks = service.tasks().list(tasklist=list_id, showCompleted=False).execute().get('items', [])
        
        for task in tasks:
            title = task.get('title', '')
            
            # Deletions (Overlaps)
            if title in [
                'Add Tech Cost Efficiency & OPEX Control Goal', 
                'Schedule Follow-up Obstetric Scan', 
                'Verify The System file manifest accuracy', 
                'Review The System manifest spreadsheet', 
                'Debug Task Engine link clearing issue',
                'Review regulatory notification requirements for PlayMeTech Fund PCC Limited',
                'Return company computer' # covered by 'Track Revolut laptop return packaging'
            ]:
                print(f"Deleting duplicate task: {title}")
                service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                
            # Completions
            if title in [
                'Check whatsapp-bridge server logs', 
                'Integrate MacGyver Gemini gem into workflow',
                'Refactor \'the_system\' codebase'
            ]:
                print(f"Completing fixed task: {title}")
                task['status'] = 'completed'
                service.tasks().update(tasklist=list_id, task=task['id'], body=task).execute()

def main():
    ps, ws = get_services()
    fix_tasks(ps, "Private")
    fix_tasks(ws, "Work")
    print("Task cleanup completed.")

if __name__ == '__main__':
    main()
