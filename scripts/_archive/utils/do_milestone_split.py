import os
import json
from googleapiclient.discovery import build
from sync_tasks_combined import get_credentials

def main():
    private_token = 'token_tasks_private.json' if os.path.exists('token_tasks_private.json') else 'token_tasks.json'
    private_creds = 'creds_private.json' if os.path.exists('creds_private.json') else 'creds.json'
    
    auth = get_credentials(private_token, private_creds, "Private Account")
    if not auth:
        print("Failed to get auth")
        return
        
    service = build('tasks', 'v1', credentials=auth)
    
    task_id = "a1pWb2x0Mk5fbWd3ekN5dQ"
    
    lists = service.tasklists().list().execute()
    tasklist_id = None
    task_obj = None

    for lst in lists.get('items', []):
        try:
            task_obj = service.tasks().get(tasklist=lst['id'], task=task_id).execute()
            tasklist_id = lst['id']
            break
        except Exception:
            continue

    if not tasklist_id:
        print("Task not found.")
        return

    print(f"Found task in list {tasklist_id}")

    new_title = "[Milestone] Apply for British passport name change"
    task_obj['title'] = new_title
    service.tasks().update(tasklist=tasklist_id, task=task_id, body=task_obj).execute()
    print("Renamed parent task to Milestone.")

    subtasks = [
        {"title": "Confirm with Skatteverket name registration (BLOCKED: Awaiting PostNord delivery)", "estimatedDuration": "5m"},
        {"title": "Contact PostNord re: Case 52988070 (Letter to Skatteverket stuck in customs)", "estimatedDuration": "15m"},
        {"title": "Follow up with Skatteverket re: Case FL202601362973", "estimatedDuration": "15m"},
        {"title": "Attend Swedish passport biometrics in Malmö", "estimatedDuration": "2h"},
        {"title": "Collect new Swedish passport from London Embassy", "estimatedDuration": "1h"},
        {"title": "Confirm with Skatteverket name registration", "estimatedDuration": "15m"},
        {"title": "Contact PostNord re: Case 52988070", "estimatedDuration": "15m"},
        {"title": "v1.0: Contact PostNord re: Case 52988070", "estimatedDuration": "15m"},
        {"title": "v2.0: Follow up with Skatteverket re: Case FL202601362973", "estimatedDuration": "15m"}
    ]

    for sub in subtasks:
        new_task = {
            "title": sub['title'],
            "notes": f"---SYSTEM_METADATA---\n{{\"duration\":\"{sub['estimatedDuration']}\"}}",
            "due": task_obj.get("due")
        }
        res = service.tasks().insert(tasklist=tasklist_id, parent=task_id, body=new_task).execute()
        print(f"Created sub-task: {res['title']}")

    print("Done! Check Google Tasks UI.")

if __name__ == "__main__":
    main()
