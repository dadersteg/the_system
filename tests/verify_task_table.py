#!/usr/bin/env python3
import os
import sys
import warnings

# Suppress the DeprecationWarnings from google auth/api_core
warnings.filterwarnings("ignore", category=FutureWarning)

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = os.path.join(ROOT_DIR, "token_tasks_work.json")
MARKDOWN_FILE = os.path.join(ROOT_DIR, "../agy_pmt/artifacts/task_review_table.md")

def get_api_active_task_count():
    if not os.path.exists(TOKEN_FILE):
        print(f"Error: {TOKEN_FILE} not found.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(TOKEN_FILE)
    service = build('tasks', 'v1', credentials=creds)

    total_tasks = 0
    
    task_lists = []
    page_token = None
    while True:
        lists_results = service.tasklists().list(maxResults=100, pageToken=page_token).execute()
        task_lists.extend(lists_results.get('items', []))
        page_token = lists_results.get('nextPageToken')
        if not page_token:
            break

    for task_list in task_lists:
        list_id = task_list['id']
        page_token = None
        while True:
            tasks_results = service.tasks().list(
                tasklist=list_id,
                maxResults=100,
                showCompleted=False,
                showHidden=False,
                pageToken=page_token
            ).execute()
            
            items = tasks_results.get('items', [])
            for item in items:
                if item.get('status') == 'needsAction' and not item.get('deleted'):
                    total_tasks += 1

            page_token = tasks_results.get('nextPageToken')
            if not page_token:
                break
                
    return total_tasks

def get_markdown_table_row_count():
    if not os.path.exists(MARKDOWN_FILE):
        print(f"Error: Markdown file not found at {MARKDOWN_FILE}")
        sys.exit(1)

    row_count = 0
    with open(MARKDOWN_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    in_table = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('|') and stripped.endswith('|'):
            # Check if it's the separator row (e.g. |---|---|)
            if stripped.replace('|', '').replace('-', '').strip() == '':
                continue
                
            if in_table:
                cells = [c.strip() for c in stripped.split('|')[1:-1]]
                if not cells[0] or not cells[1]:
                    print(f"Error: Empty critical cell in row: {stripped}")
                    sys.exit(1)
                
                for idx, cell in enumerate(cells[2:], start=2):
                    if "ERROR: Processing Failed" in cell or "ERROR:" in cell:
                        print(f"Error: Fallback value found in column {idx}: {cell}")
                        sys.exit(1)
                    
            row_count += 1
            in_table = True
        else:
            if in_table:
                # Assuming single main table or we want to count all table rows.
                # If there are multiple tables, this might count their headers too.
                # But typically the file is just one large table.
                pass
                
    # Subtract 1 for the header row
    if row_count > 0:
        row_count -= 1
        
    return row_count

def main():
    print("Fetching active task count from Google Tasks API...")
    try:
        api_count = get_api_active_task_count()
        print(f"API Active Task Count: {api_count}")
    except Exception as e:
        print(f"Failed to fetch from API: {e}")
        sys.exit(1)
        
    print(f"Parsing markdown table at {MARKDOWN_FILE}...")
    try:
        md_count = get_markdown_table_row_count()
        print(f"Markdown Table Row Count: {md_count}")
    except Exception as e:
        print(f"Failed to parse markdown: {e}")
        sys.exit(1)
        
    if api_count <= 0:
        print("FAILURE: API Active Task Count must be > 0.")
        sys.exit(1)
        
    if md_count <= 0:
        print("FAILURE: Markdown Table Row Count must be > 0.")
        sys.exit(1)
        
    if api_count == md_count:
        print("SUCCESS: Counts match.")
        sys.exit(0)
    else:
        print(f"FAILURE: Counts do not match (API: {api_count}, Markdown: {md_count}).")
        sys.exit(1)

if __name__ == "__main__":
    main()
