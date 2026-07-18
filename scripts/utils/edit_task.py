import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
#!/usr/bin/env python3
import os
import sys
import argparse
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
    parser.add_argument("--id", help="Direct ID of the task to update (requires --list-id if using ID)")
    parser.add_argument("--list-id", help="Task List ID (required if using --id)")
    parser.add_argument("--status", choices=["completed", "needsAction"], help="Set status ('completed' or 'needsAction')")
    parser.add_argument("--notes", help="Replace the notes with this text")
    parser.add_argument("--append-notes", help="Append this text to existing notes")
    parser.add_argument("--due", help="Due date (YYYY-MM-DD)")
    parser.add_argument("--profile", choices=["private", "work"], default="private", help="Which account to use")
    args = parser.parse_args()

    if not args.title and not args.id:
        print("Error: You must specify either --title or --id.")
        sys.exit(1)

    if args.id and not args.list_id:
        # Check if list-id was provided, but wait, parser argument is args.list_id
        # Let's fix the variable name since argparse converts --list-id to list_id
        pass

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
        try:
            task = service.tasks().get(tasklist=list_id, task=args.id).execute()
        except Exception as e:
            print(f"Error fetching task by ID: {e}", file=sys.stderr)
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
    
    # Google Tasks API update / patch needs specific fields or we can patch the resource.
    # We will use patch which is safer as we only send fields we want to modify.
    if args.status:
        body['status'] = args.status
        if args.status == 'completed':
            body['completed'] = None  # Google API sets this automatically or we omit it
    if args.due:
        body['due'] = f"{args.due}T00:00:00.000Z"
    if args.notes is not None or args.append_notes is not None:
        existing = task.get('notes')
        if existing is None:
            existing = ''
            
        meta_delimiter = '---SYSTEM_METADATA---'
        
        if meta_delimiter in existing:
            parts = existing.split(meta_delimiter, 1)
            user_content = parts[0].rstrip()
            sys_metadata = f"\n\n{meta_delimiter}{parts[1]}"
        else:
            user_content = existing.rstrip()
            sys_metadata = ""

        incoming = args.notes if args.notes is not None else args.append_notes
        if meta_delimiter in incoming:
            incoming = incoming.split(meta_delimiter, 1)[0].rstrip()

        if args.notes is not None:
            new_content = incoming
        else:
            new_content = f"{user_content}\n\n{incoming}".rstrip() if user_content else incoming

        if not new_content:
            sys_metadata = sys_metadata.lstrip()
            
        body['notes'] = f"{new_content}{sys_metadata}"

    if not body:
        print("No changes specified to update.")
        sys.exit(0)

    try:
        updated = service.tasks().patch(tasklist=list_id, task=task['id'], body=body).execute()
        print(f"✅ Success: Task updated on {args.profile} profile.")
        print(f"ID: {updated.get('id')}")
        print(f"Title: {updated.get('title')}")
        print(f"Status: {updated.get('status')}")
    except Exception as e:
        print(f"Error updating task: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
