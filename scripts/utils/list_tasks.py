#!/usr/bin/env python3
import os
import sys
import json
import argparse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_service(token_path):
    if not os.path.exists(token_path):
        return None
    try:
        creds = Credentials.from_authorized_user_file(token_path)
        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            with open(token_path, 'w') as f:
                f.write(creds.to_json())
        return build('tasks', 'v1', credentials=creds)
    except Exception as e:
        print(f"Error loading credentials from {token_path}: {e}", file=sys.stderr)
        return None

def fetch_active_tasks(service):
    tasks_by_list = {}
    try:
        lists = service.tasklists().list(maxResults=50).execute().get('items', [])
        for lst in lists:
            list_id = lst['id']
            list_title = lst['title']
            if "deleted" in list_title.lower() or "quarantine" in list_title.lower():
                continue
            
            tasks = []
            page_token = None
            while True:
                response = service.tasks().list(tasklist=list_id, showCompleted=False, maxResults=100, pageToken=page_token).execute()
                tasks.extend(response.get('items', []))
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
            
            if tasks:
                tasks_by_list[list_title] = tasks
    except Exception as e:
        print(f"Error fetching tasks: {e}", file=sys.stderr)
    return tasks_by_list

def parse_args():
    parser = argparse.ArgumentParser(description="List active Google Tasks")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted text")
    parser.add_argument("--profile", choices=["private", "work"], help="Filter tasks by profile (private or work)")
    return parser.parse_args()

def main():
    args = parse_args()
    
    load_private = args.profile in [None, "private"]
    load_work = args.profile in [None, "work"]
    
    script_dir = os.path.dirname(os.path.realpath(__file__))
    auth_dir = os.path.realpath(os.path.join(script_dir, '../../auth'))
    
    private_token = os.path.join(auth_dir, 'token_tasks.json')
    work_token = os.path.join(auth_dir, 'token_tasks_work.json')
    
    service_p = get_service(private_token) if load_private else None
    service_w = get_service(work_token) if load_work else None
    
    same_account = False
    if service_p and service_w:
        try:
            lists_p = service_p.tasklists().list(maxResults=1).execute().get('items', [])
            lists_w = service_w.tasklists().list(maxResults=1).execute().get('items', [])
            if lists_p and lists_w and lists_p[0]['id'] == lists_w[0]['id']:
                same_account = True
        except Exception:
            pass

    tasks_p = fetch_active_tasks(service_p) if service_p else {}
    tasks_w = fetch_active_tasks(service_w) if service_w else {}
    
    if args.json:
        output = {
            "warning": "Both Private and Work tokens point to the same Google Account!" if same_account else None,
            "private": tasks_p,
            "work": tasks_w if not same_account else {}
        }
        print(json.dumps(output, indent=2))
        return

    if same_account:
        print("⚠️  WARNING: Both Private and Work OAuth tokens are authenticated to the same Google Account!")
        print("Please re-authenticate your Work account token to resolve duplication and routing issues.\n")

    print("====================================================")
    print("                ACTIVE GOOGLE TASKS                 ")
    print("====================================================")
    
    def print_sector(sector_title, tasks_dict):
        print(f"\n📂 {sector_title}")
        if not tasks_dict:
            print("  (No active tasks)")
            return
        for list_title, tasks in tasks_dict.items():
            print(f"\n  📋 {list_title}:")
            for t in tasks:
                title = t.get('title', 'Untitled Task')
                due = t.get('due')
                due_str = f" [Due: {due.split('T')[0]}]" if due else ""
                print(f"    - [ ] {title}{due_str}")

    if load_private:
        print_sector("Private Tasks", tasks_p)
    
    if load_work:
        if not same_account:
            print_sector("Work Tasks", tasks_w)
        else:
            print("\n💼 Work Tasks: (Hidden to prevent duplicates; please resolve account token collision)")
            
    print("\n====================================================")

if __name__ == '__main__':
    main()
