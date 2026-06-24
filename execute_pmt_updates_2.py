import json

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token_tasks_work.json"
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

with open(token_file, 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

service = build('tasks', 'v1', credentials=creds)
todo_list_id = "M05Gb0c1dG91bXlkQUJpVQ"

with open('pmt_todo_tasks.json', 'r') as f:
    tasks = json.load(f)

def get_task_by_title_match(tasks, query):
    for t in tasks:
        if query.lower() in t.get('title', '').lower():
            return t
    return None

# 1. Delete Redundant Calendar Items
t1 = get_task_by_title_match(tasks, "Attend 1-1 planning call with Emanuele")
if t1:
    service.tasks().delete(tasklist=todo_list_id, task=t1['id']).execute()
    print("Deleted Emanuele 1-1")

t2 = get_task_by_title_match(tasks, "Attend 1-1 planning call with Anna")
if t2:
    service.tasks().delete(tasklist=todo_list_id, task=t2['id']).execute()
    print("Deleted Anna 1-1")

# 2. Complete Scorecards & Planning
t3 = get_task_by_title_match(tasks, "Present draft scorecards to Emmanuel for feedback")
if t3:
    t3['status'] = 'completed'
    service.tasks().update(tasklist=todo_list_id, task=t3['id'], body=t3).execute()
    print("Completed scorecards.")

t4 = get_task_by_title_match(tasks, "Schedule 1-1 Planning Framework Meetings")
if t4:
    t4['status'] = 'completed'
    service.tasks().update(tasklist=todo_list_id, task=t4['id'], body=t4).execute()
    print("Completed Framework meetings.")

# 3. Delete Patricia call
t5 = get_task_by_title_match(tasks, "Schedule 10-minute introductory call with Patricia Angeline")
if t5:
    service.tasks().delete(tasklist=todo_list_id, task=t5['id']).execute()
    print("Deleted Patricia call.")

print("Follow-up updates applied.")
