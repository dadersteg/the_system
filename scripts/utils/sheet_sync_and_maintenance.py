#!/usr/bin/env python3
"""Google Tasks and Google Sheets Synchronization and Maintenance Daemon.

This script synchronizes active tasks between Google Tasks and Google Sheets,
logs completed and deleted tasks, and cleans up completed tasks from the backend
to manage API quota and sheet readability.
"""

import os
import re
import json
import datetime
import time
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TASK_REVIEW_GID = 1580572397
PRIVATE_SPREADSHEET_ID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
WORK_SPREADSHEET_ID = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"


def get_sheets_service():
    """Authenticates and returns the Google Sheets API v4 service instance.

    Returns:
        googleapiclient.discovery.Resource: Sheets service instance.
    """
    token_path = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
    creds = Credentials.from_authorized_user_file(token_path)
    return build('sheets', 'v4', credentials=creds)


def get_tasks_service(token_path):
    """Authenticates and returns the Google Tasks API v1 service instance.

    Args:
        token_path (str): Path to the user authorized OAuth token file.

    Returns:
        googleapiclient.discovery.Resource: Tasks service instance.
    """
    creds = Credentials.from_authorized_user_file(token_path)
    return build('tasks', 'v1', credentials=creds)


def get_sheet_title_by_gid(sheets_service, spreadsheet_id, gid):
    """Looks up and returns the sheet title corresponding to a specific sheet GID.

    Args:
        sheets_service (googleapiclient.discovery.Resource): Sheets service instance.
        spreadsheet_id (str): Google Spreadsheet ID.
        gid (int): Sheet ID (GID).

    Returns:
        str or None: Sheet title if found, else None.
    """
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get('sheets', []):
        if sheet['properties']['sheetId'] == gid:
            return sheet['properties']['title']
    return None


def parse_metadata_and_clean_notes(notes):
    """Parses structural JSON and inline tags from task notes.

    Splits the system metadata segment from user-facing comments, extracting
    fields like duration, goal, category, and deadline.

    Args:
        notes (str): Raw notes/description of a task.

    Returns:
        tuple: (clean_notes, duration, goal, category, deadline)
    """
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


def delete_tasks_batch_with_retry(tasks_service, list_id, task_ids):
    """Deletes multiple tasks using BatchHttpRequest with chunking and retries.

    Args:
        tasks_service (googleapiclient.discovery.Resource): Tasks service instance.
        list_id (str): Google Tasks List ID.
        task_ids (list): List of Google Task IDs to delete.

    Returns:
        int: Number of successfully deleted tasks.
    """
    if not task_ids:
        return 0
        
    chunk_size = 50
    failed_ids = []
    successful_count = 0
    
    def make_callback(tid):
        def callback(request_id, response, exception):
            nonlocal successful_count
            if exception is not None:
                err_str = str(exception)
                if any(x in err_str for x in ["quotaExceeded", "rateLimitExceeded", "403", "429"]):
                    failed_ids.append(tid)
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
    """Retrieves all tasklists on the authenticated account.

    Args:
        tasks_service (googleapiclient.discovery.Resource): Tasks service instance.

    Returns:
        tuple: (dict mapping lowercase title to ID, raw list of tasklist items)
    """
    lists = tasks_service.tasklists().list(maxResults=50).execute().get('items', [])
    return {l['title'].lower().strip(): l['id'] for l in lists}, lists


def sync_and_maintain_account(sheets_service, token_path, spreadsheet_id, label):
    """Runs the full sync and maintenance cycle for a single Google account.

    Fetches existing logs, lists completed/active tasks, synchronizes changes
    to the target Google Sheet, and deletes completed tasks in bulk.

    Args:
        sheets_service (googleapiclient.discovery.Resource): Sheets service instance.
        token_path (str): Path to Tasks OAuth token.
        spreadsheet_id (str): Spreadsheet ID to update.
        label (str): Human-readable account identifier (e.g., 'Private', 'Work').
    """
    print(f"\n=================== Sync & Maintenance for {label} ({spreadsheet_id}) ===================")
    tasks_service = get_tasks_service(token_path)
    sheet_api = sheets_service.spreadsheets()
    
    sheet_title = get_sheet_title_by_gid(sheets_service, spreadsheet_id, TASK_REVIEW_GID)
    if not sheet_title:
        sheet_title = "5 Import - Google Tasks Log"
    print(f"Target sheet title: '{sheet_title}'")
    
    # 1. Fetch existing log rows from spreadsheet to build existing_ids set
    existing_ids = set()
    completed_rows = []
    existing_rows = []
    try:
        res = sheet_api.values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_title}'!A2:Q5000"
        ).execute()
        existing_rows = res.get("values", [])

        for r in existing_rows:
            if len(r) > 14:
                tid = r[14]
                status = r[6]
                if status in ["Completed", "Deleted"]:
                    if tid:
                        existing_ids.add(tid)
                    completed_rows.append(r)
        print(f"Loaded existing sheet: {len(existing_rows)} rows total, preserved {len(completed_rows)} completed/deleted tasks.")
    except Exception as e:
        print(f"No existing log rows read or error: {e}. Presuming 0 completed tasks.")

    # 2. Get active list mappings
    list_map, task_lists = get_task_lists(tasks_service)
    
    # 3. Process tasks from active lists (sync completed/active tasks in a single pass)
    new_completed_rows = []
    ids_to_delete_from_completed = []
    active_tasks_temp = []
    export_ts = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
    
    for lst in task_lists:
        list_id = lst['id']
        list_title = lst['title']
        
        # Skip delete list (handled separately)
        if "deleted" in list_title.lower():
            continue
            
        is_recurring = "recurring" in list_title.lower()
        print(f"Fetching completed and active tasks in list '{list_title}'...")
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
                
            items = res.get('items', [])
            for task in items:
                task_id = task['id']
                status = task.get('status', 'needsAction')
                
                if status == 'completed':
                    if task_id not in existing_ids:
                        title = task.get('title', 'Untitled')
                        raw_notes = task.get('notes', '')
                        
                        clean_notes, duration, goal, category, deadline = parse_metadata_and_clean_notes(raw_notes)
                        
                        # Extract links
                        link = ""
                        if task.get('links'):
                            email_link_obj = next((l for l in task['links'] if l.get('type') == 'email'), None)
                            if email_link_obj:
                                link = email_link_obj.get('link', '')
                        if not link:
                            link_match = re.search(r'https?://[^\s]+', clean_notes)
                            if link_match:
                                link = link_match.group(0)
                                clean_notes = clean_notes.replace(link, "").strip()
                                
                        title_parts = title.split(" > ")
                        computed_category = category
                        computed_title = title
                        if len(title_parts) >= 2:
                            computed_category = " > ".join(title_parts[:-1]).strip()
                            computed_title = title_parts[-1].strip()
                            
                        parent_category = computed_category
                        sub_category = ""
                        if " > " in computed_category:
                            cat_parts = computed_category.split(" > ")
                            parent_category = cat_parts[0].strip()
                            sub_category = " > ".join(cat_parts[1:]).strip()
                            
                        sys_comment = ""
                        da_comment = ""
                        sys_match = re.search(r'^SYS:\s*(.*)$', raw_notes, re.MULTILINE)
                        if sys_match:
                            sys_comment = sys_match.group(1).strip()
                        da_match = re.search(r'^DA:\s*(.*)$', raw_notes, re.MULTILINE)
                        if da_match:
                            da_comment = da_match.group(1).strip()
                            
                        urn = f"urn:task:completed-{export_ts[:8]}-{task_id[:4]}"
                        comp_time = task.get('completed', task.get('updated', datetime.datetime.now(datetime.UTC).isoformat()))
                        
                        new_completed_rows.append([
                            urn,
                            list_title,
                            parent_category,
                            sub_category,
                            computed_title,
                            clean_notes,
                            "Completed",
                            deadline if deadline != "None" else "",
                            comp_time[:10],
                            duration,
                            goal,
                            link,
                            sys_comment,
                            da_comment,
                            task_id,
                            list_id,
                            "completed"
                        ])
                        existing_ids.add(task_id)
                    
                    ids_to_delete_from_completed.append({"list_id": list_id, "task_id": task_id})
                
                else:  # Active task (needsAction or status that isn't completed)
                    if is_recurring:
                        continue
                        
                    title = task.get('title', 'Untitled')
                    raw_notes = task.get('notes', '')
                    due_date = task.get('due', '')
                    if due_date:
                        due_date = due_date[:10]  # YYYY-MM-DD
                        
                    clean_notes, duration, goal, category, deadline = parse_metadata_and_clean_notes(raw_notes)
                    
                    # Extract links
                    link = ""
                    if task.get('links'):
                        email_link_obj = next((l for l in task['links'] if l.get('type') == 'email'), None)
                        if email_link_obj:
                            link = email_link_obj.get('link', '')
                    if not link:
                        link_match = re.search(r'https?://[^\s]+', clean_notes)
                        if link_match:
                            link = link_match.group(0)
                            clean_notes = clean_notes.replace(link, "").strip()
                    
                    title_parts = title.split(" > ")
                    computed_category = category
                    computed_title = title
                    if len(title_parts) >= 2:
                        computed_category = " > ".join(title_parts[:-1]).strip()
                        computed_title = title_parts[-1].strip()
                    
                    parent_category = computed_category
                    sub_category = ""
                    if " > " in computed_category:
                        cat_parts = computed_category.split(" > ")
                        parent_category = cat_parts[0].strip()
                        sub_category = " > ".join(cat_parts[1:]).strip()
                        
                    sys_comment = ""
                    da_comment = ""
                    sys_match = re.search(r'^SYS:\s*(.*)$', raw_notes, re.MULTILINE)
                    if sys_match:
                        sys_comment = sys_match.group(1).strip()
                    da_match = re.search(r'^DA:\s*(.*)$', raw_notes, re.MULTILINE)
                    if da_match:
                        da_comment = da_match.group(1).strip()
                        
                    active_tasks_temp.append({
                        'list_title': list_title,
                        'parent_category': parent_category,
                        'sub_category': sub_category,
                        'computed_title': computed_title,
                        'clean_notes': clean_notes,
                        'status': status,
                        'due_date': due_date,
                        'duration': duration,
                        'goal': goal,
                        'link': link,
                        'sys_comment': sys_comment,
                        'da_comment': da_comment,
                        'task_id': task_id,
                        'list_id': list_id
                    })
                    
            page_token = res.get('nextPageToken')
            if not page_token:
                break
                
    # Format active rows with URNs
    active_rows = []
    for row_counter, t in enumerate(active_tasks_temp, start=1):
        urn = f"urn:task:{export_ts}-{row_counter:04d}"
        active_rows.append([
            urn,
            t['list_title'],
            t['parent_category'],
            t['sub_category'],
            t['computed_title'],
            t['clean_notes'],
            t['status'],
            t['due_date'],
            "",  # Completion Date
            t['duration'],
            t['goal'],
            t['link'],
            t['sys_comment'],
            t['da_comment'],
            t['task_id'],
            t['list_id'],
            t['status']
        ])

    # 4. Process tasks from "To Be Deleted" list (sync to log, delete from backend)
    delete_list_id = list_map.get("to be deleted")
    ids_to_delete_from_tobe_deleted = []
    if delete_list_id:
        print("Checking 'To Be Deleted' list...")
        page_token = None
        while True:
            try:
                res = tasks_service.tasks().list(
                    tasklist=delete_list_id,
                    showCompleted=True,
                    showHidden=True,
                    maxResults=100,
                    pageToken=page_token
                ).execute()
            except Exception as e:
                print(f"Error fetching delete list: {e}")
                break
                
            items = res.get('items', [])
            for task in items:
                task_id = task['id']
                if task_id not in existing_ids:
                    title = task.get('title', 'Untitled')
                    raw_notes = task.get('notes', '')
                    
                    clean_notes, duration, goal, category, deadline = parse_metadata_and_clean_notes(raw_notes)
                    
                    # Extract links
                    link = ""
                    if task.get('links'):
                        email_link_obj = next((l for l in task['links'] if l.get('type') == 'email'), None)
                        if email_link_obj:
                            link = email_link_obj.get('link', '')
                    if not link:
                        link_match = re.search(r'https?://[^\s]+', clean_notes)
                        if link_match:
                            link = link_match.group(0)
                            clean_notes = clean_notes.replace(link, "").strip()
                            
                    title_parts = title.split(" > ")
                    computed_category = category
                    computed_title = title
                    if len(title_parts) >= 2:
                        computed_category = " > ".join(title_parts[:-1]).strip()
                        computed_title = title_parts[-1].strip()
                        
                    parent_category = computed_category
                    sub_category = ""
                    if " > " in computed_category:
                        cat_parts = computed_category.split(" > ")
                        parent_category = cat_parts[0].strip()
                        sub_category = " > ".join(cat_parts[1:]).strip()
                        
                    sys_comment = ""
                    da_comment = ""
                    sys_match = re.search(r'^SYS:\s*(.*)$', raw_notes, re.MULTILINE)
                    if sys_match:
                        sys_comment = sys_match.group(1).strip()
                    da_match = re.search(r'^DA:\s*(.*)$', raw_notes, re.MULTILINE)
                    if da_match:
                        da_comment = da_match.group(1).strip()
                        
                    urn = f"urn:task:completed-{export_ts[:8]}-{task_id[:4]}"
                    comp_time = task.get('completed', task.get('updated', datetime.datetime.now(datetime.UTC).isoformat()))
                    
                    new_completed_rows.append([
                        urn,
                        "To be Deleted",
                        parent_category,
                        sub_category,
                        computed_title,
                        clean_notes,
                        "Deleted",
                        deadline if deadline != "None" else "",
                        comp_time[:10],
                        duration,
                        goal,
                        link,
                        sys_comment,
                        da_comment,
                        task_id,
                        delete_list_id,
                        "completed"
                    ])
                    existing_ids.add(task_id)
                
                ids_to_delete_from_tobe_deleted.append(task_id)
                    
            page_token = res.get('nextPageToken')
            if not page_token:
                break

    # 5. Combined payload: active tasks on top, preserved completed/deleted on bottom
    headers = [
        "URN", 
        "Task List", 
        "Category", 
        "Sub-Category",
        "Task Title", 
        "Notes", 
        "Status", 
        "Due Date", 
        "Completion Date", 
        "Duration", 
        "Goal", 
        "Link", 
        "System Comment", 
        "DA Comment", 
        "Task ID", 
        "Task List ID", 
        "Original Status"
    ]
    combined_data = active_rows + completed_rows + new_completed_rows

    # Check if anything has actually changed (excluding the URN at index 0)
    has_changes = False
    if len(existing_rows) != len(combined_data):
        has_changes = True
    else:
        for r_exist, r_new in zip(existing_rows, combined_data):
            r_exist_padded = (r_exist + [""] * 17)[:17]
            r_new_padded = (r_new + [""] * 17)[:17]
            if r_exist_padded[1:] != r_new_padded[1:]:
                has_changes = True
                break

    if not has_changes:
        print(f"No changes detected in tasks data for {label}. Skipping spreadsheet update.")
        return

    payload = [headers] + combined_data

    try:
        print(f"Clearing spreadsheet '{sheet_title}' for {label}...")
        sheet_api.values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_title}'!A1:Q5000"
        ).execute()
        
        write_range = f"'{sheet_title}'!A1:Q{len(payload)}"
        print(f"Writing {len(payload)} rows to {label} '{sheet_title}' (Active: {len(active_rows)}, Preserved Completed: {len(completed_rows)}, New Completed: {len(new_completed_rows)})...")
        sheet_api.values().update(
            spreadsheetId=spreadsheet_id,
            range=write_range,
            valueInputOption="USER_ENTERED",
            body={"values": payload}
        ).execute()
        print(f"Spreadsheet update successful for {label}!")
        
        # Only proceed with wiping Google Tasks if the spreadsheet commit was successful
        completed_count = 0
        deleted_count = 0
        if ids_to_delete_from_completed:
            # Group deletions by list_id to optimize requests
            tasks_by_list = {}
            for item in ids_to_delete_from_completed:
                tasks_by_list.setdefault(item["list_id"], []).append(item["task_id"])
            
            for list_id, task_ids in tasks_by_list.items():
                completed_count += delete_tasks_batch_with_retry(tasks_service, list_id, task_ids)
            print(f"Wiped {completed_count} completed tasks from {label} Google Tasks backend.")
            
        if ids_to_delete_from_tobe_deleted and delete_list_id:
            deleted_count = delete_tasks_batch_with_retry(tasks_service, delete_list_id, ids_to_delete_from_tobe_deleted)
            print(f"Wiped {deleted_count} deleted tasks from {label} 'To Be Deleted' list.")
            
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to update spreadsheet for {label}. Aborting task deletion to prevent data loss. Error: {e}")
        
    print(f"{label} sync & maintenance complete!")


def main():
    """Main daemon entry point."""
    sheets_service = get_sheets_service()
    
    # Private Spreadsheet
    sync_and_maintain_account(
        sheets_service, 
        '/Users/daniel/Documents/AGY/the_system/auth/token_tasks.json', 
        PRIVATE_SPREADSHEET_ID, 
        'Private'
    )
    
    # Work Spreadsheet
    sync_and_maintain_account(
        sheets_service, 
        '/Users/daniel/Documents/AGY/the_system/auth/token_tasks_work.json', 
        WORK_SPREADSHEET_ID, 
        'Work'
    )


if __name__ == "__main__":
    main()
