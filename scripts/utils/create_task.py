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

def main():
    parser = argparse.ArgumentParser(description="Create a task in Google Tasks")
    parser.add_argument("--title", required=True, help="Title of the task")
    parser.add_argument("--notes", help="Notes / description of the task")
    parser.add_argument("--due", help="Due date (YYYY-MM-DD)")
    parser.add_argument("--profile", choices=["private", "work"], default="private", help="Which account to use")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.realpath(__file__))
    auth_dir = os.path.realpath(os.path.join(script_dir, '../../auth'))
    
    token_name = 'token_tasks.json' if args.profile == 'private' else 'token_tasks_work.json'
    token_path = os.path.join(auth_dir, token_name)

    service = get_service(token_path)
    if not service:
        print(f"Error: Could not connect to Google Tasks API for {args.profile} profile. Check your token file.")
        sys.exit(1)

    task_body = {
        'title': args.title
    }
    if args.notes:
        task_body['notes'] = args.notes
    if args.due:
        # Google Tasks API requires RFC 3339 format, e.g. YYYY-MM-DDT00:00:00.000Z
        task_body['due'] = f"{args.due}T00:00:00.000Z"

    try:
        # Insert into the default tasklist
        inserted = service.tasks().insert(tasklist='@default', body=task_body).execute()
        print(f"✅ Success: Task created on {args.profile} profile.")
        print(f"ID: {inserted.get('id')}")
        print(f"Title: {inserted.get('title')}")
    except Exception as e:
        print(f"Error creating task: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
