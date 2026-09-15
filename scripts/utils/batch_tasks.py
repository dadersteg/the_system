#!/usr/bin/env python3
"""batch_tasks.py - Transactional Batch Google Tasks Processor for The System (Private & Work).

Provides batch execution parity with CE's `run.sh tasks batch` for Plan Sync and Task Verify.
Supports:
  - stage_done: Prepend '99 Done - ', append SYS reason, update tracker_ref, move to 'AI Review'.
  - redate: Update due date, append SYS blocker reason.
  - create: Create task in target list (default 'ToDo') with ---SYSTEM_METADATA---.
  - delete: Soft-delete to 'To be Deleted' list or hard delete via API.

Usage:
  python3 scripts/utils/batch_tasks.py --file payload.json --dry-run
  python3 scripts/utils/batch_tasks.py --file payload.json --profile private
  python3 scripts/utils/batch_tasks.py --file payload.json --profile work
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure venv site-packages are reachable
for candidate in [
    Path(__file__).resolve().parent.parent.parent / "scratch" / "my_venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path(__file__).resolve().parent.parent.parent / "venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path("/Users/daniel/Documents/AGY/the_system/scratch/my_venv/lib/python3.14/site-packages"),
    Path("/Users/daniel/Developer/the_system/venv/lib/python3.14/site-packages"),
]:
    if candidate.exists() and str(candidate) not in sys.path:
        sys.path.insert(1, str(candidate))

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

METADATA_MARKER = "---SYSTEM_METADATA---"


def get_service(profile: str, custom_home: Optional[str] = None):
    home = Path(custom_home).expanduser() if custom_home else Path(__file__).resolve().parent.parent.parent
    auth_dir = home / "auth"
    token_file = "token_tasks.json" if profile == "private" else "token_tasks_work.json"
    token_path = auth_dir / token_file

    if not token_path.exists():
        sys.exit(f"Error: Token not found at {token_path}. Profile: {profile}")

    try:
        creds = Credentials.from_authorized_user_file(str(token_path))
        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            with open(token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        return build("tasks", "v1", credentials=creds)
    except Exception as e:
        sys.exit(f"Error initializing Google Tasks API service ({token_path}): {e}")


def load_tasklists(service) -> Dict[str, str]:
    """Map list title -> list ID."""
    res = service.tasklists().list(maxResults=100).execute()
    items = res.get("items", [])
    return {item["title"]: item["id"] for item in items}


def find_task_by_id(service, task_id: str, lists: Dict[str, str]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    for lname, lid in lists.items():
        try:
            t = service.tasks().get(tasklist=lid, task=task_id).execute()
            if t and t.get("id") == task_id:
                return lid, t
        except Exception:
            continue
    return None, None


def split_notes_and_meta(notes: str) -> Tuple[str, Dict[str, Any]]:
    notes = notes or ""
    if METADATA_MARKER in notes:
        body, raw_meta = notes.split(METADATA_MARKER, 1)
        try:
            meta = json.loads(raw_meta.strip() or "{}")
        except Exception:
            meta = {}
        return body.rstrip(), meta
    return notes.rstrip(), {}


def format_notes(human_body: str, meta: Dict[str, Any]) -> str:
    human_body = human_body.rstrip()
    if not meta:
        return human_body
    meta_json = json.dumps(meta, ensure_ascii=False)
    if not human_body:
        return f"{METADATA_MARKER}\n{meta_json}"
    return f"{human_body}\n\n{METADATA_MARKER}\n{meta_json}"


_TAG_RE = re.compile(r"(?:\[(?:DEADLINE|DURATION|GOAL):[^\]]*\]\s*\|?\s*)+")


def task_hash(title: str, notes: str, due: Optional[str], status: str) -> str:
    """Byte-for-byte port of GAS getStandardizedTaskHash and CE common.task_hash."""
    t = re.sub(r"\s+", " ", _TAG_RE.sub("", title or "")).strip()
    kept = []
    for line in re.split(r"\r?\n", (notes or "").split(METADATA_MARKER)[0]):
        if line.strip().startswith("SYS:"):
            continue
        no_tags = _TAG_RE.sub("", line)
        if re.fullmatch(r"[ \t|]*", no_tags):
            continue
        kept.append(no_tags)
    n = re.sub(r"\s+", " ", " ".join(kept)).strip()
    d = re.sub(r"\s+", " ", due or "").strip()
    st = re.sub(r"\s+", " ", status or "").strip()
    return base64.b64encode(hashlib.md5(f"{t}|{n}|{d}|{st}".encode("utf-8")).digest()).decode("ascii")


def stamp_ai_hash(title: str, notes: str, due: Optional[str], status: str) -> str:
    """Recompute ai_hash for the final task state and write it into the metadata JSON."""
    head, meta = split_notes_and_meta(notes)
    meta["ai_hash"] = task_hash(title, notes, due, status)
    return format_notes(head, meta)


def is_recurring_list(list_title: str) -> bool:
    return "recurring" in (list_title or "").lower()


def parse_batch_payload(raw_data: Any) -> List[Dict[str, Any]]:
    """Normalizes both list-of-actions and dict-of-buckets into a flat list of operations."""
    if isinstance(raw_data, list):
        for op in raw_data:
            if "action" not in op and "op" in op:
                op["action"] = op["op"]
        return raw_data
    if isinstance(raw_data, dict):
        ops = []
        for action_name in ["stage_done", "complete", "redate", "create", "delete", "link_only", "link"]:
            for item in raw_data.get(action_name, []):
                item_copy = dict(item)
                item_copy["action"] = action_name
                ops.append(item_copy)
        return ops
    raise ValueError("Payload must be a JSON array or a dictionary of buckets.")


def execute_batch(service, ops: List[Dict[str, Any]], dry_run: bool = False) -> Dict[str, int]:
    lists = load_tasklists(service)
    id_to_title = {v: k for k, v in lists.items()}
    todo_lid = lists.get("ToDo") or lists.get("00 Todo") or lists.get("Todo")
    ai_review_lid = lists.get("AI Review")
    delete_lid = lists.get("To be Deleted")

    counts = {"applied": 0, "skipped": 0, "failed": 0}

    for idx, op in enumerate(ops, 1):
        action = op.get("action", "").lower()
        tid = op.get("id")
        reason = op.get("reason", "").strip()
        tracker_ref = op.get("tracker_ref", "").strip()

        print(f"\n[{idx}/{len(ops)}] Action: {action.upper()}")

        if action == "stage_done":
            src_lid, task = find_task_by_id(service, tid, lists)
            if not task:
                print(f"  ❌ Failed: Task {tid!r} not found.", file=sys.stderr)
                counts["failed"] += 1
                continue

            src_title = id_to_title.get(src_lid, "")
            orig_title = task.get("title", "")

            # RECURRING TASK GUARD:
            # Moving recurring tasks across lists via delete-and-recreate permanently destroys
            # Google Tasks recurrence. Intercept and complete in place instead.
            if is_recurring_list(src_title):
                print(f"  ⚡ Recurring task detected in '{src_title}'. Staging via delete-and-recreate would destroy recurrence schedule.")
                print(f"  ⚡ Intercepting: completing in place ('status': 'completed') to preserve recurrence.")
                if dry_run:
                    print(f"  [DRY-RUN] Would mark completed in place: '{orig_title}' in list '{src_title}'")
                    counts["applied"] += 1
                    continue
                try:
                    service.tasks().patch(tasklist=src_lid, task=tid, body={"status": "completed"}).execute()
                    print(f"  ✅ Completed in place: '{orig_title}' in '{src_title}' (recurrence preserved)")
                    counts["applied"] += 1
                except Exception as e:
                    print(f"  ❌ Error completing recurring task {tid}: {e}", file=sys.stderr)
                    counts["failed"] += 1
                continue

            if not ai_review_lid:
                print("  ❌ Failed: 'AI Review' list not found in account.", file=sys.stderr)
                counts["failed"] += 1
                continue
            new_title = orig_title if orig_title.startswith("99 Done - ") else f"99 Done - {orig_title}"
            body, meta = split_notes_and_meta(task.get("notes", ""))
            
            if reason:
                sys_line = f"SYS: {reason}"
                if sys_line not in body:
                    body = f"{body}\n\n{sys_line}".strip() if body else sys_line
            if tracker_ref:
                meta["tracker_ref"] = tracker_ref

            new_notes = format_notes(body, meta)
            new_notes = stamp_ai_hash(new_title, new_notes, task.get("due"), task.get("status", "needsAction"))

            if dry_run:
                print(f"  [DRY-RUN] Would stage done: '{orig_title}' -> '{new_title}'")
                print(f"  [DRY-RUN] Destination: 'AI Review' (from list {src_lid})")
                if reason:
                    print(f"  [DRY-RUN] Appending note: SYS: {reason}")
                counts["applied"] += 1
                continue

            try:
                # If already in AI Review, just patch
                if src_lid == ai_review_lid:
                    service.tasks().patch(tasklist=ai_review_lid, task=tid, body={
                        "title": new_title,
                        "notes": new_notes
                    }).execute()
                else:
                    # Insert in AI Review, delete from source
                    new_item = {
                        "title": new_title,
                        "notes": new_notes,
                        "status": "needsAction",
                        "due": task.get("due")
                    }
                    service.tasks().insert(tasklist=ai_review_lid, body=new_item).execute()
                    service.tasks().delete(tasklist=src_lid, task=tid).execute()
                print(f"  ✅ Staged done: '{new_title}' in AI Review")
                counts["applied"] += 1
            except Exception as e:
                print(f"  ❌ Error staging task {tid}: {e}", file=sys.stderr)
                counts["failed"] += 1

        elif action == "redate":
            new_due = op.get("due") or op.get("new_due")
            if not new_due:
                print(f"  ❌ Failed: Missing 'due' date for redate operation on task {tid}.", file=sys.stderr)
                counts["failed"] += 1
                continue
            src_lid, task = find_task_by_id(service, tid, lists)
            if not task:
                print(f"  ❌ Failed: Task {tid!r} not found.", file=sys.stderr)
                counts["failed"] += 1
                continue

            orig_due = (task.get("due") or "")[:10]
            body, meta = split_notes_and_meta(task.get("notes", ""))
            if reason:
                sys_line = f"SYS: {reason}"
                if sys_line not in body:
                    body = f"{body}\n\n{sys_line}".strip() if body else sys_line
            if tracker_ref:
                meta["tracker_ref"] = tracker_ref

            new_notes = format_notes(body, meta)
            due_rfc = f"{new_due}T00:00:00.000Z"

            if dry_run:
                print(f"  [DRY-RUN] Would redate: '{task.get('title')}' ({orig_due} -> {new_due})")
                if reason:
                    print(f"  [DRY-RUN] Appending note: SYS: {reason}")
                counts["applied"] += 1
                continue

            try:
                service.tasks().patch(tasklist=src_lid, task=tid, body={
                    "due": due_rfc,
                    "notes": new_notes
                }).execute()
                print(f"  ✅ Redated: '{task.get('title')}' -> {new_due}")
                counts["applied"] += 1
            except Exception as e:
                print(f"  ❌ Error redating task {tid}: {e}", file=sys.stderr)
                counts["failed"] += 1

        elif action == "create":
            title = op.get("title", "").strip()
            if not title:
                print("  ❌ Failed: Task title required for create operation.", file=sys.stderr)
                counts["failed"] += 1
                continue

            target_list_name = op.get("list", "ToDo")
            target_lid = lists.get(target_list_name) or todo_lid
            if not target_lid:
                print(f"  ❌ Failed: Target list '{target_list_name}' not found.", file=sys.stderr)
                counts["failed"] += 1
                continue

            human_notes = op.get("notes", "").strip()
            meta = {}
            if tracker_ref:
                meta["tracker_ref"] = tracker_ref
            if op.get("goal"):
                meta["goal"] = op["goal"]
            if op.get("category"):
                meta["category_path"] = op["category"]
            if op.get("milestone"):
                meta["milestone"] = op["milestone"]

            full_notes = format_notes(human_notes, meta)
            due_str = op.get("due")
            due_rfc = f"{due_str}T00:00:00.000Z" if due_str else None

            payload = {
                "title": title,
                "notes": full_notes,
                "status": "needsAction",
            }
            if due_rfc:
                payload["due"] = due_rfc

            if dry_run:
                print(f"  [DRY-RUN] Would create task: '{title}' in list '{target_list_name}'")
                if tracker_ref:
                    print(f"  [DRY-RUN] Tracker ref: {tracker_ref}")
                if due_str:
                    print(f"  [DRY-RUN] Due: {due_str}")
                counts["applied"] += 1
                continue

            try:
                created = service.tasks().insert(tasklist=target_lid, body=payload).execute()
                print(f"  ✅ Created task: '{title}' (ID: {created.get('id')}) in {target_list_name}")
                counts["applied"] += 1
            except Exception as e:
                print(f"  ❌ Error creating task '{title}': {e}", file=sys.stderr)
                counts["failed"] += 1

        elif action == "delete":
            src_lid, task = find_task_by_id(service, tid, lists)
            if not task:
                print(f"  ❌ Failed: Task {tid!r} not found.", file=sys.stderr)
                counts["failed"] += 1
                continue

            soft = op.get("soft", True)
            if soft and delete_lid:
                if dry_run:
                    print(f"  [DRY-RUN] Would soft-delete: '{task.get('title')}' -> move to 'To be Deleted'")
                    counts["applied"] += 1
                    continue
                try:
                    service.tasks().insert(tasklist=delete_lid, body={
                        "title": task.get("title"),
                        "notes": task.get("notes"),
                        "status": "needsAction",
                        "due": task.get("due")
                    }).execute()
                    service.tasks().delete(tasklist=src_lid, task=tid).execute()
                    print(f"  ✅ Soft-deleted: '{task.get('title')}' moved to 'To be Deleted'")
                    counts["applied"] += 1
                except Exception as e:
                    print(f"  ❌ Error soft-deleting task {tid}: {e}", file=sys.stderr)
                    counts["failed"] += 1
            else:
                if dry_run:
                    print(f"  [DRY-RUN] Would permanently delete: '{task.get('title')}'")
                    counts["applied"] += 1
                    continue
                try:
                    service.tasks().delete(tasklist=src_lid, task=tid).execute()
                    print(f"  ✅ Permanently deleted: '{task.get('title')}'")
                    counts["applied"] += 1
                except Exception as e:
                    print(f"  ❌ Error permanently deleting task {tid}: {e}", file=sys.stderr)
                    counts["failed"] += 1

        elif action in ("link_only", "link"):
            src_lid, task = find_task_by_id(service, tid, lists)
            if not task:
                print(f"  ❌ Failed: Task {tid!r} not found.", file=sys.stderr)
                counts["failed"] += 1
                continue
            if not tracker_ref:
                print("  ❌ Failed: Missing tracker_ref for link operation.", file=sys.stderr)
                counts["failed"] += 1
                continue

            body, meta = split_notes_and_meta(task.get("notes", ""))
            meta["tracker_ref"] = tracker_ref
            new_notes = format_notes(body, meta)
            new_notes = stamp_ai_hash(task.get("title", ""), new_notes, task.get("due"), task.get("status", "needsAction"))

            if dry_run:
                print(f"  [DRY-RUN] Would stamp tracker_ref '{tracker_ref}' (and restamp ai_hash) on task '{task.get('title')}'")
                counts["applied"] += 1
                continue

            try:
                service.tasks().patch(tasklist=src_lid, task=tid, body={"notes": new_notes}).execute()
                print(f"  ✅ Linked: '{task.get('title')}' -> {tracker_ref} (restamped ai_hash)")
                counts["applied"] += 1
            except Exception as e:
                print(f"  ❌ Error linking task {tid}: {e}", file=sys.stderr)
                counts["failed"] += 1

        elif action == "complete":
            src_lid, task = find_task_by_id(service, tid, lists)
            if not task:
                print(f"  ❌ Failed: Task {tid!r} not found.", file=sys.stderr)
                counts["failed"] += 1
                continue

            src_title = id_to_title.get(src_lid, src_lid)
            orig_title = task.get("title", "")

            if dry_run:
                print(f"  [DRY-RUN] Would mark completed in place: '{orig_title}' in list '{src_title}'")
                counts["applied"] += 1
                continue

            try:
                service.tasks().patch(tasklist=src_lid, task=tid, body={"status": "completed"}).execute()
                print(f"  ✅ Completed in place: '{orig_title}' in '{src_title}'")
                counts["applied"] += 1
            except Exception as e:
                print(f"  ❌ Error completing task {tid}: {e}", file=sys.stderr)
                counts["failed"] += 1
        else:
            print(f"  ⚠️ Unknown action: {action!r}; skipped.")
            counts["skipped"] += 1

    return counts


def main():
    parser = argparse.ArgumentParser(description="Batch Google Tasks Executor for The System")
    parser.add_argument("--file", "-f", required=True, help="Path to JSON batch file")
    parser.add_argument("--profile", choices=["private", "work"], default="private", help="Profile to target")
    parser.add_argument("--dry-run", action="store_true", help="Simulate execution without modifying tasks")
    parser.add_argument("--the-system-home", help="Path to the_system checkout")
    args = parser.parse_args()

    payload_path = Path(args.file).expanduser()
    if not payload_path.exists():
        sys.exit(f"Batch file not found: {payload_path}")

    try:
        raw_data = json.loads(payload_path.read_text(encoding="utf-8"))
    except Exception as e:
        sys.exit(f"Failed to parse batch JSON: {e}")

    ops = parse_batch_payload(raw_data)
    if not ops:
        print("No operations found in batch file.")
        sys.exit(0)

    print(f"=== The System Batch Tasks Runner ===")
    print(f"Profile:  {args.profile}")
    print(f"Payload:  {payload_path} ({len(ops)} operations)")
    print(f"Mode:     {'DRY-RUN (Read-Only)' if args.dry_run else 'LIVE EXECUTION'}")

    service = get_service(args.profile, args.the_system_home)
    counts = execute_batch(service, ops, dry_run=args.dry_run)

    print("\n=====================================")
    print(f"Batch Summary: {counts['applied']} applied, {counts['skipped']} skipped, {counts['failed']} failed.")
    print("=====================================")


if __name__ == "__main__":
    main()
