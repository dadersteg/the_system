#!/usr/bin/env python3
"""Google Tasks to Google Sheets One-Way Synchronization & Maintenance Daemon.

This script executes a strict one-way synchronization from Google Tasks to Google Sheets:
1. Google Tasks is the authoritative operational source of truth.
2. Active and completed tasks are ingested from Google Tasks API across all lists.
3. Historical completed and deleted rows in the Google Sheet (5 Import - Google Tasks Log) are preserved.
4. Newly completed tasks are logged to the Sheet archive with completion timestamps.
5. Completed tasks are purged from the Google Tasks backend to maintain API performance and quota.
6. Clean, pure task titles (without category path prefixes) are maintained throughout.
7. Zero upstream mutations: The Google Sheet NEVER patches, overwrites, or reverts Google Tasks.
"""

import os
import re
import json
import datetime
import time
import argparse
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from lib.config import (
    TASK_REVIEW_GID,
    PRIVATE_TASK_REVIEW_GID,
    WORK_TASK_REVIEW_GID,
    PRIVATE_SPREADSHEET_ID,
    WORK_SPREADSHEET_ID,
    SHEET_TOKEN_PATH,
    PRIVATE_TOKEN_PATH,
    WORK_TOKEN_PATH,
    BASE_DIR
)
from lib.google_auth import get_service
from lib.task_normalizer import (
    normalize_milestone_title,
    extract_milestone_key,
    is_milestone_container
)


def load_unified_goals_mapping(base_dir=None):
    """Loads unified Personal and Work goals from the Markdown doc outputs.

    Returns:
        dict: Mapping of URN / normalized ID to Goal Name.
    """
    if base_dir is None:
        base_dir = BASE_DIR
        
    goals_map = {}
    
    md_files = [
        os.path.join(base_dir, 'docs', 'Principles, Goals, Methods and Habits (Personal) - Output (Active).md'),
        os.path.join(base_dir, 'docs', 'Principles, Goals, Methods and Habits (Work) - Output (Active).md')
    ]
    
    for fpath in md_files:
        if not os.path.exists(fpath):
            continue
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.startswith('|') and not line.startswith('| ---') and not line.startswith('| URN'):
                        cols = [c.strip() for c in line.split('|')[1:-1]]
                        if len(cols) >= 4:
                            urn = cols[0]
                            text = cols[3]
                            if urn and urn != 'URN' and text:
                                goals_map[urn] = text
        except Exception as e:
            print(f"Warning: Could not parse goals from {fpath}: {e}")
            
    return goals_map


def resolve_goal_name(goal_id, goals_map):
    """Resolves a raw Goal ID into its human-readable Goal Name.

    Args:
        goal_id (str): Raw Goal ID (e.g. '2026-MD-NEW-043', 'urn:goal:system:2024-3-041A', 'BAU').
        goals_map (dict): Loaded goals mapping.

    Returns:
        tuple: (normalized_goal_id, resolved_goal_name)
    """
    if not goal_id or str(goal_id).strip() in ['', 'N/A', 'TBD', 'None']:
        return "TBD", "TBD"
        
    raw_str = str(goal_id).strip()
    
    # 1. Direct exact match
    if raw_str in goals_map:
        return raw_str, goals_map[raw_str]
        
    # 2. Strip URN prefixes (e.g. urn:goal:system:, urn:goal:personal:, urn:goal:ce:)
    clean_id = re.sub(r'^urn:goal:[^:]+:', '', raw_str).strip()
    if clean_id in goals_map:
        return clean_id, goals_map[clean_id]
        
    # 3. Handle legacy numeric indices (e.g. '43' -> '2026-MD-NEW-043')
    if clean_id.isdigit():
        num = int(clean_id)
        cand_personal = f"2026-MD-NEW-{num:03d}"
        if cand_personal in goals_map:
            return cand_personal, goals_map[cand_personal]
        cand_work = f"2026-WORK-NEW-{num:03d}"
        if cand_work in goals_map:
            return cand_work, goals_map[cand_work]
            
    # 4. Handle Operational Maintenance / Baseline BAU
    clean_lower = clean_id.lower()
    if clean_lower in ['bau', 'maintenance', 'general maintenance', 'operational hygiene', 'hygiene', 'baseline']:
        return "BAU", "General Maintenance / Operational Hygiene (BAU)"
        
    return raw_str, f"Unknown Goal ({raw_str})"


def get_sheets_service():
    """Authenticates and returns the Google Sheets API v4 service instance."""
    return get_service('sheets', 'v4', SHEET_TOKEN_PATH, account_name="Sheets Log")


def get_tasks_service(token_path):
    """Authenticates and returns the Google Tasks API v1 service instance."""
    return get_service('tasks', 'v1', token_path, account_name="Tasks API")


def get_sheet_title_by_gid(sheets_service, spreadsheet_id, gid):
    """Looks up and returns the sheet title corresponding to a specific sheet GID."""
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get('sheets', []):
        if sheet['properties']['sheetId'] == gid:
            return sheet['properties']['title']
    return None


def build_column_index_map(header_row):
    """Dynamically maps column names to their 0-based array index."""
    normalized = {str(h).strip().lower(): idx for idx, h in enumerate(header_row)}
    
    return {
        "urn": normalized.get("urn", 0),
        "list_title": normalized.get("task list", 1),
        "category": normalized.get("category", 2),
        "sub_category": normalized.get("sub-category", 3),
        "milestone": normalized.get("milestone", 4),
        "title": normalized.get("task title", 5),
        "notes": normalized.get("notes", 6),
        "status": normalized.get("status", 7),
        "due_date": normalized.get("due date", 8),
        "completion_date": normalized.get("completion date", 9),
        "duration": normalized.get("duration", 10),
        "goal_id": normalized.get("goal id", 11),
        "goal_name": normalized.get("goal name", 12),
        "link": normalized.get("link", 13),
        "sys_comment": normalized.get("system comment", 14),
        "da_comment": normalized.get("da comment", 15),
        "task_id": normalized.get("task id", 16),
        "list_id": normalized.get("task list id", 17),
        "original_status": normalized.get("original status", 18)
    }


def parse_sheet_row_with_map(raw_row, col_map):
    """Extracts a structured task dictionary from a row using dynamic column mapping."""
    def get_val(key, default=""):
        idx = col_map.get(key)
        if idx is not None and idx < len(raw_row):
            return str(raw_row[idx]).strip()
        return default

    return {
        "urn": get_val("urn"),
        "list_title": get_val("list_title", "Inbox"),
        "category": get_val("category"),
        "sub_category": get_val("sub_category"),
        "milestone": get_val("milestone", "None"),
        "title": get_val("title", "Untitled"),
        "notes": get_val("notes"),
        "status": get_val("status", "needsAction"),
        "due_date": get_val("due_date"),
        "completion_date": get_val("completion_date"),
        "duration": get_val("duration", "N/A"),
        "goal_id": get_val("goal_id", "TBD"),
        "goal_name": get_val("goal_name", "TBD"),
        "link": get_val("link"),
        "sys_comment": get_val("sys_comment"),
        "da_comment": get_val("da_comment"),
        "task_id": get_val("task_id"),
        "list_id": get_val("list_id"),
        "original_status": get_val("original_status", "needsAction")
    }


def parse_metadata_and_clean_notes(notes):
    """Parses structural JSON and inline tags from task notes."""
    if not notes:
        return "", "N/A", "TBD", "N/A", "None"
    
    clean_notes = str(notes)
    duration = "N/A"
    goal = "TBD"
    category = "N/A"
    deadline = "None"
    
    parts = clean_notes.split('---SYSTEM_METADATA---')
    if len(parts) > 1:
        try:
            metadata = json.loads(parts[1].strip())
            duration = metadata.get("duration", "N/A")
            goal = metadata.get("goal", "TBD")
            category = metadata.get("category_path", "N/A")
            deadline = metadata.get("deadline", "None")
        except Exception:
            pass
        clean_notes = parts[0]
        
    clean_notes = re.sub(r'\[DEADLINE:[^\]]*\]\s*\|\s*\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]', '', clean_notes)
    clean_notes = re.sub(r'\[DURATION:[^\]]*\]\s*\|\s*\[GOAL:[^\]]*\]', '', clean_notes)
    clean_notes = clean_notes.strip()
    
    return clean_notes, duration, goal, category, deadline


def delete_task_with_retry(tasks_service, list_id, task_id):
    """Executes tasks().delete with rate limiting delay and exponential backoff."""
    time.sleep(0.3)
    max_retries = 3
    backoff = 1.0
    for attempt in range(max_retries):
        try:
            return tasks_service.tasks().delete(tasklist=list_id, task=task_id).execute()
        except Exception as e:
            if attempt < max_retries - 1 and any(x in str(e) for x in ["quotaExceeded", "rateLimitExceeded", "403", "429"]):
                time.sleep(backoff)
                backoff *= 2.0
            else:
                raise e


def delete_tasks_batch_with_retry(tasks_service, list_id, task_ids):
    """Deletes multiple completed tasks using BatchHttpRequest with chunking and retries."""
    if not task_ids:
        return 0
        
    chunk_size = 50
    successful_count = 0
    
    def make_callback(tid):
        def callback(request_id, response, exception):
            nonlocal successful_count
            if exception is not None:
                err_str = str(exception)
                if any(x in err_str for x in ["quotaExceeded", "rateLimitExceeded", "403", "429"]):
                    pass
                else:
                    print(f"Non-retryable error deleting task {tid}: {exception}")
            else:
                successful_count += 1
        return callback

    for i in range(0, len(task_ids), chunk_size):
        chunk = task_ids[i:i+chunk_size]
        max_retries = 3
        backoff = 2.0
        
        while chunk:
            failed_ids = []
            batch = tasks_service.new_batch_http_request()
            for tid in chunk:
                batch.add(
                    tasks_service.tasks().delete(tasklist=list_id, task=tid),
                    request_id=tid,
                    callback=make_callback(tid)
                )
            
            try:
                batch.execute()
            except Exception as e:
                print(f"Batch execution error: {e}")
                failed_ids = list(chunk)
                
            if failed_ids:
                max_retries -= 1
                if max_retries >= 0:
                    print(f"Batch deletion hit rate limits for {len(failed_ids)} tasks. Retrying chunk in {backoff}s...")
                    time.sleep(backoff)
                    backoff *= 2.0
                    chunk = list(failed_ids)
                else:
                    print(f"Failed to delete {len(failed_ids)} tasks in chunk after retries.")
                    break
            else:
                break
                
        time.sleep(0.5)
        
    return successful_count


def get_task_lists(tasks_service):
    """Retrieves all tasklists on the authenticated account."""
    lists = tasks_service.tasklists().list(maxResults=50).execute().get('items', [])
    return {l['title'].lower().strip(): l['id'] for l in lists}, lists


def fetch_all_api_tasks(tasks_service, task_lists):
    """Fetches all active and completed tasks across all lists into an in-memory dictionary.
    
    Returns:
        dict: Mapping of task_id -> (list_id, task_dict)
    """
    api_tasks = {}
    for lst in task_lists:
        list_id = lst['id']
        list_title = lst['title']
        page_token = None
        while True:
            try:
                res = tasks_service.tasks().list(
                    tasklist=list_id,
                    showCompleted=True,
                    showHidden=True,
                    maxResults=100,
                    pageToken=page_token
                ).execute()
            except Exception as e:
                print(f"Error fetching tasks for list '{list_title}': {e}")
                break
                
            for t in res.get('items', []):
                api_tasks[t['id']] = (list_id, t)
                
            page_token = res.get('nextPageToken')
            if not page_token:
                break
    return api_tasks


def extract_clean_task_details(raw_title, raw_notes, default_category="N/A"):
    """Extracts clean title (never compound), Category, Sub-Category, and Milestone from task data."""
    clean_notes, duration, goal, category_from_meta, deadline = parse_metadata_and_clean_notes(raw_notes)
    
    # 1. Clean Title Purity: Strip any legacy compound category prefix
    title = (raw_title or "Untitled").strip()
    title_parts = title.split(" > ")
    computed_category = category_from_meta if category_from_meta != "N/A" else default_category
    computed_title = title
    
    if len(title_parts) >= 2:
        # Legacy title had '01 Private/04 Finances/Budgeting & Planning > Task Title'
        if computed_category == "N/A" or not computed_category:
            computed_category = " > ".join(title_parts[:-1]).strip()
        computed_title = title_parts[-1].strip()

    # Strip any leading LOS code or category pattern from non-milestone title
    if not computed_title.startswith("[Milestone]"):
        computed_title = re.sub(r'^\d{2}(?:\s+\d{2}){1,2}\s+', '', computed_title).strip()
        computed_title = re.sub(r'^0[12]\s+(?:Private|Work|Admin)[^>]*>\s*', '', computed_title, flags=re.IGNORECASE).strip()

    # 2. Category / Sub-Category split
    parent_category = computed_category
    sub_category = ""
    if " > " in computed_category:
        cat_parts = computed_category.split(" > ")
        parent_category = cat_parts[0].strip()
        sub_category = " > ".join(cat_parts[1:]).strip()
    elif "/" in computed_category:
        cat_parts = computed_category.split("/", 1)
        parent_category = cat_parts[0].strip()
        sub_category = cat_parts[1].strip()

    # Fallback to Context: line in notes if still N/A
    if parent_category == "N/A" or not parent_category:
        ctx_match = re.search(r'Context:\s*(.*)$', raw_notes, re.MULTILINE)
        if ctx_match:
            ctx_val = ctx_match.group(1).strip()
            if "/" in ctx_val:
                p_parts = ctx_val.split("/", 1)
                parent_category = p_parts[0].strip()
                sub_category = p_parts[1].strip()
            elif " > " in ctx_val:
                p_parts = ctx_val.split(" > ", 1)
                parent_category = p_parts[0].strip()
                sub_category = p_parts[1].strip()
            else:
                parent_category = ctx_val

    # 3. Milestone resolution
    milestone = "None"
    if computed_title.startswith("[Milestone]"):
        milestone = "Milestone"
    else:
        m_match = re.search(r'Milestone:\s*(.*)$', raw_notes, re.MULTILINE)
        if m_match:
            m_val = m_match.group(1).strip()
            if m_val.lower() not in ["none", ""]:
                milestone = m_val

    # 4. Structured Comments & Links
    sys_comment = ""
    da_comment = ""
    sys_match = re.search(r'^SYS:\s*(.*)$', raw_notes, re.MULTILINE)
    if sys_match:
        sys_comment = sys_match.group(1).strip()
    da_match = re.search(r'^DA:\s*(.*)$', raw_notes, re.MULTILINE)
    if da_match:
        da_comment = da_match.group(1).strip()

    link = ""
    link_match = re.search(r'https?://[^\s]+', clean_notes)
    if link_match:
        link = link_match.group(0)
        clean_notes = clean_notes.replace(link, "").strip()

    return {
        "computed_title": computed_title,
        "parent_category": parent_category,
        "sub_category": sub_category,
        "milestone": milestone,
        "clean_notes": clean_notes,
        "duration": duration,
        "goal": goal,
        "deadline": deadline,
        "link": link,
        "sys_comment": sys_comment,
        "da_comment": da_comment
    }


def sync_and_maintain_account(sheets_service, token_path, spreadsheet_id, label, dry_run=False):
    """Runs the strict ONE-WAY sync (Google Tasks -> Google Sheets) and maintenance cycle.

    1. Fetches existing spreadsheet rows from '5 Import - Google Tasks Log' to preserve completed archive.
    2. Fetches all active and completed tasks from Google Tasks API.
    3. Ingests and formats active tasks into clean spreadsheet rows.
    4. Logs newly completed tasks into the archive.
    5. Clears and rewrites the clean table to Google Sheets.
    6. Wipes completed tasks in bulk from Google Tasks backend to maintain quota.
    """
    print(f"\n=================== One-Way Sync (Tasks -> Sheets) for {label} ({spreadsheet_id}) ===================")
    tasks_service = get_tasks_service(token_path)
    sheet_api = sheets_service.spreadsheets()
    
    target_gid = PRIVATE_TASK_REVIEW_GID if label.lower() == 'private' else WORK_TASK_REVIEW_GID
    sheet_title = get_sheet_title_by_gid(sheets_service, spreadsheet_id, target_gid)
    if not sheet_title:
        sheet_title = "5 Import - Google Tasks Log"
    print(f"Target sheet title: '{sheet_title}' (GID: {target_gid})")
    
    goals_map = load_unified_goals_mapping(BASE_DIR)
    print(f"Loaded unified goals dictionary with {len(goals_map)} entries.")

    # 1. Fetch existing log rows from spreadsheet to inspect headers and preserve completed history
    existing_ids = set()
    completed_rows = []
    existing_rows = []
    col_map = build_column_index_map([
        "URN", "Task List", "Category", "Sub-Category", "Milestone",
        "Task Title", "Notes", "Status", "Due Date", "Completion Date",
        "Duration", "Goal ID", "Goal Name", "Link", "System Comment",
        "DA Comment", "Task ID", "Task List ID", "Original Status"
    ])
    
    try:
        res = sheet_api.values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_title}'!A1:S"
        ).execute()
        raw_values = res.get("values", [])
        
        if raw_values:
            header_row = raw_values[0]
            col_map = build_column_index_map(header_row)
            existing_rows = raw_values[1:]
        else:
            existing_rows = []

        # Process preserved completed rows
        for r in existing_rows:
            sheet_task = parse_sheet_row_with_map(r, col_map)
            tid = sheet_task["task_id"]
            status = sheet_task["status"]
            
            if status in ["Completed", "Deleted"]:
                if tid:
                    existing_ids.add(tid)
                completed_rows.append(r)
                
        print(f"Loaded existing sheet: {len(existing_rows)} rows total, preserved {len(completed_rows)} completed/deleted tasks.")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to read existing log rows. Error: {e}")
        raise RuntimeError(f"Aborting sync to prevent data loss due to read failure on '{sheet_title}'.")

    # 2. Get active list mappings and fetch all current API tasks
    list_map, task_lists = get_task_lists(tasks_service)
    api_tasks_by_id = fetch_all_api_tasks(tasks_service, task_lists)
    print(f"Fetched {len(api_tasks_by_id)} tasks from Google Tasks API across {len(task_lists)} lists.")

    # 3. Process Authoritative Tasks from Google Tasks API
    new_completed_rows = []
    ids_to_delete_from_completed = []
    active_rows = []
    export_ts = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
    
    active_row_counter = 1

    for lst in task_lists:
        list_id = lst['id']
        list_title = lst['title']
        is_recurring = "recurring" in list_title.lower()
        
        # Get tasks belonging to this list
        list_tasks = [t for (l_id, t) in api_tasks_by_id.values() if l_id == list_id]
        
        for task in list_tasks:
            task_id = task['id']
            status = task.get('status', 'needsAction')
            raw_title = task.get('title', 'Untitled')
            raw_notes = task.get('notes', '')
            
            details = extract_clean_task_details(raw_title, raw_notes)
            norm_goal_id, goal_name = resolve_goal_name(details["goal"], goals_map)
            
            # Handle Completed Tasks
            if status == 'completed':
                if task_id not in existing_ids:
                    urn = f"urn:task:completed-{export_ts[:8]}-{task_id[:4]}"
                    comp_time = task.get('completed', task.get('updated', datetime.datetime.now(datetime.UTC).isoformat()))
                    
                    new_completed_rows.append([
                        urn,
                        list_title,
                        details['parent_category'],
                        details['sub_category'],
                        details['milestone'],
                        details['computed_title'],
                        details['clean_notes'],
                        "Completed",
                        details['deadline'] if details['deadline'] != "None" else "",
                        comp_time[:10],
                        details['duration'],
                        norm_goal_id,
                        goal_name,
                        details['link'],
                        details['sys_comment'],
                        details['da_comment'],
                        task_id,
                        list_id,
                        "completed"
                    ])
                    existing_ids.add(task_id)
                
                ids_to_delete_from_completed.append({"list_id": list_id, "task_id": task_id})
            
            # Handle Active Tasks (needsAction)
            else:
                if is_recurring:
                    continue  # Recurring tasks are managed separately in the Recurring list
                    
                due_date = task.get('due', '')
                if due_date:
                    due_date = due_date[:10]  # YYYY-MM-DD
                    
                urn = f"urn:task:{export_ts}-{active_row_counter:04d}"
                active_row_counter += 1
                
                active_rows.append([
                    urn,
                    list_title,
                    details['parent_category'],
                    details['sub_category'],
                    details['milestone'],
                    details['computed_title'],
                    details['clean_notes'],
                    status,
                    due_date,
                    "",  # Completion Date
                    details['duration'],
                    norm_goal_id,
                    goal_name,
                    details['link'],
                    details['sys_comment'],
                    details['da_comment'],
                    task_id,
                    list_id,
                    status
                ])

    # 4. Combined payload: active tasks on top, preserved completed/deleted on bottom
    headers = [
        "URN", 
        "Task List", 
        "Category", 
        "Sub-Category",
        "Milestone",
        "Task Title", 
        "Notes", 
        "Status", 
        "Due Date", 
        "Completion Date", 
        "Duration", 
        "Goal ID", 
        "Goal Name", 
        "Link", 
        "System Comment", 
        "DA Comment", 
        "Task ID", 
        "Task List ID", 
        "Original Status"
    ]
    combined_data = active_rows + completed_rows + new_completed_rows

    payload = [headers] + combined_data

    if dry_run:
        print(f"[DRY-RUN] Would write {len(payload)} rows to {label} '{sheet_title}' (Active: {len(active_rows)}, Preserved: {len(completed_rows)}, New Completed: {len(new_completed_rows)}).")
    else:
        try:
            print(f"Clearing spreadsheet '{sheet_title}' for {label}...")
            sheet_api.values().clear(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_title}'!A1:S"
            ).execute()
            
            write_range = f"'{sheet_title}'!A1:S{len(payload)}"
            print(f"Writing {len(payload)} rows to {label} '{sheet_title}' (Active: {len(active_rows)}, Preserved Completed: {len(completed_rows)}, New Completed: {len(new_completed_rows)})...")
            sheet_api.values().update(
                spreadsheetId=spreadsheet_id,
                range=write_range,
                valueInputOption="USER_ENTERED",
                body={"values": payload}
            ).execute()
            print(f"Spreadsheet update successful for {label}!")
            
        except Exception as e:
            print(f"CRITICAL ERROR: Failed to update spreadsheet for {label}. Aborting task deletion to prevent data loss. Error: {e}")
            return

    # 5. Purge completed tasks from Google Tasks backend
    if not dry_run and ids_to_delete_from_completed:
        print(f"\nPurging {len(ids_to_delete_from_completed)} completed tasks from Google Tasks backend...")
        tasks_by_list = {}
        for item in ids_to_delete_from_completed:
            tasks_by_list.setdefault(item["list_id"], []).append(item["task_id"])
            
        total_deleted = 0
        for l_id, t_ids in tasks_by_list.items():
            cnt = delete_tasks_batch_with_retry(tasks_service, l_id, t_ids)
            total_deleted += cnt
            print(f"Purged {cnt}/{len(t_ids)} completed tasks from list {l_id}.")
            
        print(f"Completed tasks cleanup complete. Successfully purged {total_deleted} tasks.")


def main():
    parser = argparse.ArgumentParser(description="Google Tasks to Google Sheets One-Way Sync & Maintenance")
    parser.add_argument("--profile", choices=["private", "work", "both"], default="both", help="Which profile to sync")
    parser.add_argument("--dry-run", action="store_true", help="Perform dry-run without writing to Sheet or deleting tasks")
    args = parser.parse_args()

    sheets_service = get_sheets_service()
    if not sheets_service:
        print("Error: Could not authenticate Google Sheets service.")
        sys.exit(1)

    if args.profile in ["private", "both"]:
        if os.path.exists(PRIVATE_TOKEN_PATH) and PRIVATE_SPREADSHEET_ID:
            sync_and_maintain_account(sheets_service, PRIVATE_TOKEN_PATH, PRIVATE_SPREADSHEET_ID, "Private", dry_run=args.dry_run)
        else:
            print("Private profile token or spreadsheet ID missing. Skipping Private.")

    if args.profile in ["work", "both"]:
        if os.path.exists(WORK_TOKEN_PATH) and WORK_SPREADSHEET_ID:
            sync_and_maintain_account(sheets_service, WORK_TOKEN_PATH, WORK_SPREADSHEET_ID, "Work", dry_run=args.dry_run)
        else:
            print("Work profile token or spreadsheet ID missing. Skipping Work.")

    print("\n✅ One-Way Sync & Maintenance complete.")


if __name__ == "__main__":
    main()
