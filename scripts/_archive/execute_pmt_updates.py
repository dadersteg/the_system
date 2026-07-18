import json
import os
import sys

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

# 1. Complete Clause 7
t1 = get_task_by_title_match(tasks, "Clause 7")
if t1:
    t1['status'] = 'completed'
    service.tasks().update(tasklist=todo_list_id, task=t1['id'], body=t1).execute()
    print("Completed Clause 7.")

# 2. Delete Guidepoint
t2 = get_task_by_title_match(tasks, "Guidepoint")
if t2:
    service.tasks().delete(tasklist=todo_list_id, task=t2['id']).execute()
    print("Deleted Guidepoint.")

# 3. Merge Employment Contracts
t3a = get_task_by_title_match(tasks, "Review employees employment contracts")
t3b = get_task_by_title_match(tasks, "Review standard employment contract and NDA templates")
if t3a and t3b:
    t3a['title'] = "Finalize standard employment contract and NDA templates with Anna"
    notes = t3a.get('notes', '') + "\n" + t3b.get('notes', '')
    t3a['notes'] = notes
    service.tasks().update(tasklist=todo_list_id, task=t3a['id'], body=t3a).execute()
    service.tasks().delete(tasklist=todo_list_id, task=t3b['id']).execute()
    print("Merged Employment Contracts.")

# 5. Merge Company Data Part 2.1 & 2.2
t5a = get_task_by_title_match(tasks, "Compile and document company data and files structure (Part 2.1)")
t5b = get_task_by_title_match(tasks, "Compile and document company data and files structure (Part 2.2)")
if t5a and t5b:
    t5a['title'] = "Compile and document company data and files structure (Part 2)"
    notes = t5a.get('notes', '') + "\n" + t5b.get('notes', '')
    t5a['notes'] = notes
    service.tasks().update(tasklist=todo_list_id, task=t5a['id'], body=t5a).execute()
    service.tasks().delete(tasklist=todo_list_id, task=t5b['id']).execute()
    print("Merged Company Data.")

# 6-9. Renames
renames = [
    ("Review external Apps Script edits", "Audit and document external Apps Script edits"),
    ("Review Tennis Trading resource list", "Integrate Tennis Trading resource list into inventory"),
    ("Review operational updates from 1-1", "Process operational updates from 1-1 with Mark Daniel"),
    ("Review Persona Prompt Generator", "Adjust COO persona tone in Prompt Generator")
]

for old_query, new_title in renames:
    t = get_task_by_title_match(tasks, old_query)
    if t:
        t['title'] = new_title
        service.tasks().update(tasklist=todo_list_id, task=t['id'], body=t).execute()
        print(f"Renamed: {new_title}")

print("All updates applied to live Google Tasks.")
