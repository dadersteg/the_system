#!/usr/bin/env python3
import os
import sys
import json
import argparse
from pathlib import Path

# Ensure workspace venv site-packages are loaded in sandboxed runs
for candidate_site in [
    Path(__file__).resolve().parent.parent.parent / "scratch" / "my_venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path(__file__).resolve().parent.parent.parent / "venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path("/Users/daniel/Documents/AGY/the_system/scratch/my_venv/lib/python3.14/site-packages"),
    Path("/Users/daniel/Developer/the_system/venv/lib/python3.14/site-packages"),
]:
    if candidate_site.exists() and str(candidate_site) not in sys.path:
        sys.path.insert(1, str(candidate_site))

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from googleapiclient.discovery import build
from lib.google_auth import get_service, get_credentials
from google.oauth2.credentials import Credentials

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

def find_task_by_title(service, title):
    try:
        lists = service.tasklists().list(maxResults=50).execute().get('items', [])
        for lst in lists:
            list_id = lst['id']
            # Search active and completed tasks
            page_token = None
            while True:
                response = service.tasks().list(
                    tasklist=list_id,
                    showCompleted=True,
                    showHidden=True,
                    maxResults=100,
                    pageToken=page_token
                ).execute()
                for task in response.get('items', []):
                    if task.get('title', '').strip() == title.strip():
                        return list_id, task
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
    except Exception as e:
        print(f"Error searching for task by title: {e}", file=sys.stderr)
    return None, None

def main():
    parser = argparse.ArgumentParser(description="Edit or complete a Google Task")
    parser.add_argument("--title", help="Title of the task to update (searches all lists)")
    parser.add_argument("--id", "--task-id", dest="id", help="Direct ID of the task to update (searches all lists if --list-id omitted)")
    parser.add_argument("--list-id", help="Task List ID (optional if using --id)")
    parser.add_argument("--target-list", help="Target list name or ID to move the task to")
    parser.add_argument("--new-title", help="New title to rename the task to")
    parser.add_argument("--status", choices=["completed", "needsAction"], help="Set status ('completed' or 'needsAction')")
    notes_group = parser.add_mutually_exclusive_group()
    notes_group.add_argument("--notes", help="Replace the notes with this text")
    notes_group.add_argument("--notes-file", help="Path to file containing notes to set")
    append_notes_group = parser.add_mutually_exclusive_group()
    append_notes_group.add_argument("--append-notes", help="Append this text to existing notes")
    append_notes_group.add_argument("--append-notes-file", help="Path to file containing notes to append")
    parser.add_argument("--due", help="Due date (YYYY-MM-DD)")
    parser.add_argument("--profile", choices=["private", "work"], default="private", help="Which account to use")
    args = parser.parse_args()

    if args.notes_file:
        p = os.path.abspath(args.notes_file)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                args.notes = f.read()
        else:
            print(f"Error: notes file not found at {p}", file=sys.stderr)
            sys.exit(1)
    elif args.append_notes_file:
        p = os.path.abspath(args.append_notes_file)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                args.append_notes = f.read()
        else:
            print(f"Error: append notes file not found at {p}", file=sys.stderr)
            sys.exit(1)

    if not args.title and not args.id:
        print("Error: You must specify either --title or --id/--task-id.")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.realpath(__file__))
    auth_dir = os.path.realpath(os.path.join(script_dir, '../../auth'))
    
    token_name = 'token_tasks.json' if args.profile == 'private' else 'token_tasks_work.json'
    token_path = os.path.join(auth_dir, token_name)

    service = get_service(token_path)
    if not service:
        print(f"Error: Could not connect to Google Tasks API for {args.profile} profile. Check your token file.")
        sys.exit(1)

    list_id = args.list_id
    task = None

    if args.id:
        if list_id:
            try:
                task = service.tasks().get(tasklist=list_id, task=args.id).execute()
            except Exception as e:
                print(f"Error fetching task by ID in list {list_id}: {e}", file=sys.stderr)
                sys.exit(1)
        else:
            # Search all lists for this task ID
            lists = service.tasklists().list(maxResults=50).execute().get('items', [])
            for lst in lists:
                try:
                    t = service.tasks().get(tasklist=lst['id'], task=args.id).execute()
                    if t:
                        task = t
                        list_id = lst['id']
                        break
                except Exception:
                    continue
            if not task:
                print(f"Error: Task with ID '{args.id}' not found in any list.", file=sys.stderr)
                sys.exit(1)
    else:
        print(f"Searching for task with title: '{args.title}'...")
        list_id, task = find_task_by_title(service, args.title)
        if not task:
            print(f"Error: Task with title '{args.title}' not found.")
            sys.exit(1)
        print(f"Found task: '{task.get('title')}' in list: '{list_id}'")

    # Prepare update
    body = {}
    
    if args.new_title:
        body['title'] = args.new_title
    
    # Google Tasks API update / patch needs specific fields or we can patch the resource.
    # We will use patch which is safer as we only send fields we want to modify.
    if args.status:
        body['status'] = args.status
        if args.status == 'completed':
            body['completed'] = None  # Google API sets this automatically or we omit it
    if args.due:
        body['due'] = f"{args.due}T00:00:00.000Z"
    if args.notes is not None or args.append_notes is not None or args.due is not None:
        existing = task.get('notes') or ''
        meta_delimiter = '---SYSTEM_METADATA---'
        
        existing_meta = {}
        if meta_delimiter in existing:
            parts = existing.split(meta_delimiter, 1)
            user_content = parts[0].rstrip()
            try:
                existing_meta = json.loads(parts[1].strip())
            except Exception:
                existing_meta = {}
        else:
            user_content = existing.rstrip()
            existing_meta = {}

        incoming = args.notes if args.notes is not None else (args.append_notes or "")
        incoming_meta = {}
        if meta_delimiter in incoming:
            in_parts = incoming.split(meta_delimiter, 1)
            incoming_body = in_parts[0].rstrip()
            try:
                incoming_meta = json.loads(in_parts[1].strip())
            except Exception:
                incoming_meta = {}
        else:
            incoming_body = incoming.rstrip()

        if args.notes is not None:
            new_content = incoming_body
        elif args.append_notes is not None:
            new_content = f"{user_content}\n\n{incoming_body}".rstrip() if user_content else incoming_body
        else:
            new_content = user_content

        # Merge metadata
        merged_meta = dict(existing_meta)
        merged_meta.update(incoming_meta)
        if args.due is not None:
            merged_meta['deadline'] = args.due

        if merged_meta:
            body['notes'] = f"{new_content}\n\n{meta_delimiter}\n{json.dumps(merged_meta)}"
        else:
            body['notes'] = new_content

    target_list_id = None
    target_list_title = None
    if args.target_list:
        lists = service.tasklists().list(maxResults=50).execute().get('items', [])
        for lst in lists:
            if lst['id'] == args.target_list or lst['title'].strip().lower() == args.target_list.strip().lower():
                target_list_id = lst['id']
                target_list_title = lst['title']
                break
        if not target_list_id:
            print(f"Error: Target list '{args.target_list}' not found.", file=sys.stderr)
            sys.exit(1)

    if not body and not target_list_id:
        print("No changes specified to update.")
        sys.exit(0)

    # Merge changes into existing task object
    for k, v in body.items():
        task[k] = v

    if target_list_id and target_list_id != list_id:
        src_list_title = next((lst.get('title', '') for lst in lists if lst.get('id') == list_id), "")
        if "recurring" in src_list_title.lower():
            print(f"⚠️ Recurring task detected in '{src_list_title}'. Moving across lists via delete-and-recreate permanently destroys Google Tasks recurrence schedule.", file=sys.stderr)
            if task.get('status') == 'completed' or (args.status and args.status == 'completed'):
                print(f"⚡ Intercepting: completing task in place in '{src_list_title}' to preserve recurrence schedule.", file=sys.stderr)
                updated = service.tasks().update(tasklist=list_id, task=task['id'], body=task).execute()
                print(f"✅ Success: Task marked completed in place in '{src_list_title}' ({list_id}). Recurrence preserved.")
                sys.exit(0)
            else:
                print(f"❌ Error: Cannot move recurring task from '{src_list_title}' to '{target_list_title}' without breaking recurrence.", file=sys.stderr)
                sys.exit(1)
        try:
            new_task_body = {
                'title': task.get('title'),
                'status': task.get('status', 'needsAction')
            }
            if task.get('notes'):
                new_task_body['notes'] = task['notes']
            if task.get('due'):
                new_task_body['due'] = task['due']

            inserted = service.tasks().insert(tasklist=target_list_id, body=new_task_body).execute()
            service.tasks().delete(tasklist=list_id, task=task['id']).execute()
            print(f"✅ Success: Task moved from {list_id} to '{target_list_title}' ({target_list_id}).")
            print(f"New ID: {inserted.get('id')}")
            print(f"Title: {inserted.get('title')}")
            print(f"Due: {inserted.get('due')}")
            print(f"Status: {inserted.get('status')}")
            sys.exit(0)
        except Exception as e:
            print(f"Error moving task to {args.target_list}: {e}", file=sys.stderr)
            sys.exit(1)

    try:
        updated = service.tasks().update(tasklist=list_id, task=task['id'], body=task).execute()
        print(f"✅ Success: Task updated on {args.profile} profile.")
        print(f"ID: {updated.get('id')}")
        print(f"Title: {updated.get('title')}")
        print(f"Due: {updated.get('due')}")
        print(f"Status: {updated.get('status')}")
    except Exception as e:
        print(f"Error updating task: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
