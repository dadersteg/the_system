#!/usr/bin/env python3
"""
scripts/utils/get_task.py
Static CLI utility to fetch, inspect, and display Google Tasks.
Replaces dynamic inline python (-c) to allow Antigravity to permanently auto-approve.

Usage:
  python3 scripts/utils/get_task.py --id "<TASK_ID>" [--list-id "<LIST_ID>"]
  python3 scripts/utils/get_task.py --title "Elevator incident"
  python3 scripts/utils/get_task.py --list-name "ToDo" [--limit 20]
"""

import os
import sys
import json
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from lib.google_auth import get_service, get_credentials
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_tasks_service(profile="private"):
    token_name = 'token_tasks.json' if profile == 'private' else 'token_tasks_work.json'
    token_path = BASE_DIR / 'auth' / token_name
    if not token_path.exists():
        token_path = BASE_DIR / 'auth' / 'token.json'
    if not token_path.exists():
        print(f"Error: Token not found at {token_path}", file=sys.stderr)
        return None
    creds = get_credentials(str(token_path), account_name=f"{profile.capitalize()} Tasks")
    return build('tasks', 'v1', credentials=creds)

def main():
    parser = argparse.ArgumentParser(description="Inspect Google Tasks details cleanly.")
    parser.add_argument("--id", help="Task ID to fetch")
    parser.add_argument("--list-id", help="Task List ID (optional)")
    parser.add_argument("--list-name", help="List all tasks in this tasklist name or ID")
    parser.add_argument("--title", help="Search for task by title substring")
    parser.add_argument("--limit", type=int, default=50, help="Max results when listing (default: 50)")
    parser.add_argument("--profile", choices=["private", "work"], default="private", help="Account profile")
    parser.add_argument("--output-file", help="Write JSON output to file")
    args = parser.parse_args()

    service = get_tasks_service(args.profile)
    if not service:
        sys.exit(1)

    try:
        all_lists = service.tasklists().list(maxResults=50).execute().get('items', [])

        # Mode 1: List all tasks in a specific task list
        if args.list_name:
            target_list_id = None
            for lst in all_lists:
                if lst['id'] == args.list_name or lst.get('title', '').strip().lower() == args.list_name.strip().lower():
                    target_list_id = lst['id']
                    break
            if not target_list_id:
                print(f"Error: Task list '{args.list_name}' not found.", file=sys.stderr)
                sys.exit(1)

            res = service.tasks().list(tasklist=target_list_id, maxResults=args.limit, showCompleted=False).execute()
            tasks = res.get('items', [])
            payload = {"status": "SUCCESS", "list_id": target_list_id, "count": len(tasks), "tasks": tasks}
            if args.output_file:
                Path(args.output_file).write_text(json.dumps(payload, indent=2), encoding="utf-8")
                print(f"Wrote {len(tasks)} tasks to {args.output_file}")
            else:
                print(json.dumps(payload, indent=2))
            sys.exit(0)

        # Mode 2: Fetch by Task ID
        if args.id:
            if args.list_id:
                task = service.tasks().get(tasklist=args.list_id, task=args.id).execute()
                payload = {"status": "SUCCESS", "list_id": args.list_id, "task": task}
            else:
                # Search across lists to locate task
                found_task = None
                found_list_id = None
                for lst in all_lists:
                    try:
                        t = service.tasks().get(tasklist=lst['id'], task=args.id).execute()
                        if t:
                            found_task = t
                            found_list_id = lst['id']
                            break
                    except Exception:
                        continue
                if not found_task:
                    print(json.dumps({"status": "NOT_FOUND", "message": f"Task {args.id} not found in any list."}))
                    sys.exit(1)
                payload = {"status": "SUCCESS", "list_id": found_list_id, "task": found_task}

            if args.output_file:
                Path(args.output_file).write_text(json.dumps(payload, indent=2), encoding="utf-8")
                print(f"Wrote task to {args.output_file}")
            else:
                print(json.dumps(payload, indent=2))
            sys.exit(0)

        # Mode 3: Search by Title substring
        if args.title:
            matches = []
            for lst in all_lists:
                try:
                    res = service.tasks().list(tasklist=lst['id'], maxResults=100, showCompleted=True).execute()
                    for t in res.get('items', []):
                        if args.title.lower() in t.get('title', '').lower():
                            matches.append({"list_id": lst['id'], "list_title": lst.get('title'), "task": t})
                except Exception:
                    continue
            payload = {"status": "SUCCESS", "query": args.title, "count": len(matches), "matches": matches}
            if args.output_file:
                Path(args.output_file).write_text(json.dumps(payload, indent=2), encoding="utf-8")
                print(f"Wrote {len(matches)} matches to {args.output_file}")
            else:
                print(json.dumps(payload, indent=2))
            sys.exit(0)

        print("Error: Specify --id, --title, or --list-name.", file=sys.stderr)
        sys.exit(1)

    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
