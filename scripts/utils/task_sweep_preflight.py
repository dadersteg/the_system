#!/usr/bin/env python3
"""
scripts/utils/task_sweep_preflight.py
Static CLI utility for Task Master Sweep preflight check.
Replaces dynamic inline python (-c) to allow Antigravity to permanently auto-approve.

Usage:
  python3 scripts/utils/task_sweep_preflight.py
"""

import os
import sys
import time
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from lib.google_auth import get_credentials
from googleapiclient.discovery import build

LOCK_PATH = BASE_DIR / "scratch" / ".task_master_sweep.lock"
TOKEN_PATH = BASE_DIR / "auth" / "token_tasks.json"

def main():
    now = time.time()
    
    # 1. Mutex lock check
    if LOCK_PATH.exists():
        try:
            mtime = LOCK_PATH.stat().st_mtime
            if now - mtime < 180:
                print(json.dumps({"status": "LOCKED", "message": "Prior sweep currently active. Aborting run to guarantee 0 overlap."}))
                sys.exit(0)
        except Exception:
            pass
            
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(str(now), encoding="utf-8")
    
    # 2. Check Google Tasks (Importer + ToDo Hygiene)
    try:
        creds = get_credentials(str(TOKEN_PATH), account_name="Private Tasks")
        service = build('tasks', 'v1', credentials=creds)
        
        lists = service.tasklists().list(maxResults=50).execute().get('items', [])
        importer_id = next((l['id'] for l in lists if 'inbox' in l.get('title', '').lower() or 'importer' in l.get('title', '').lower()), None)
        todo_id = next((l['id'] for l in lists if l.get('title') == 'ToDo'), None)
        
        if not importer_id and lists:
            importer_id = lists[0]['id']
            
        importer_tasks = service.tasks().list(tasklist=importer_id, showCompleted=False).execute().get('items', []) if importer_id else []
        
        # Check active ToDo hygiene (undated tasks, missing milestones, stray items)
        todo_hygiene_issues = []
        if todo_id:
            todo_tasks = service.tasks().list(tasklist=todo_id, showCompleted=False, maxResults=100).execute().get('items', [])
            for t in todo_tasks:
                title = t.get('title', '')
                due = t.get('due')
                notes = t.get('notes', '')
                tid = t.get('id')
                is_milestone_epic = title.lower().startswith('[milestone]') or 'parent epic' in notes.lower()
                
                issues = []
                if not due and not is_milestone_epic:
                    issues.append("MISSING_DUE_DATE")
                if 'milestone:' not in notes.lower() and not is_milestone_epic:
                    issues.append("MISSING_MILESTONE")
                if title.startswith('99 Done -'):
                    issues.append("STRAY_STAGED_DONE")
                if title.startswith('99 To be deleted'):
                    issues.append("STRAY_QUARANTINE")
                    
                if issues:
                    todo_hygiene_issues.append({
                        "id": tid,
                        "title": title,
                        "issues": issues,
                        "due": due,
                        "notes_snippet": notes[:120]
                    })
                    
        # If BOTH Importer is clean and ToDo hygiene is spotless: Fast-Path Exit
        if not importer_tasks and not todo_hygiene_issues:
            if LOCK_PATH.exists():
                LOCK_PATH.unlink()
            try:
                from scripts.utils.heartbeat_lease import touch_heartbeat_lease
                touch_heartbeat_lease("TASK_MASTER", status="SUCCESS", details="Queue clean (0 importer, 0 todo defects)", silent=True)
            except Exception:
                pass
            print(json.dumps({"status": "CLEAN", "importer_count": 0, "todo_hygiene_defects": 0}))
            sys.exit(0)
            
        # Actionable items found
        try:
            from scripts.utils.heartbeat_lease import touch_heartbeat_lease
            touch_heartbeat_lease("TASK_MASTER", status="SUCCESS", details=f"Actionable: {len(importer_tasks)} importer, {len(todo_hygiene_issues)} todo defects", silent=True)
        except Exception:
            pass
            
        print(json.dumps({
            "status": "ACTIONABLE",
            "importer_count": len(importer_tasks),
            "importer_tasks": importer_tasks,
            "todo_hygiene_count": len(todo_hygiene_issues),
            "todo_hygiene_defects": todo_hygiene_issues,
            "todo_list_id": todo_id
        }, indent=2))
        sys.exit(0)
        
    except Exception as e:
        if LOCK_PATH.exists():
            LOCK_PATH.unlink()
        print(json.dumps({"status": "ERROR", "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
