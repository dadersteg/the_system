#!/usr/bin/env python3
import os
import sys
import json
import re
import hashlib
import base64
import argparse
import time
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_standardized_task_hash(title, notes, due, status, strip_title_tags):
    title = title or ""
    notes = notes or ""
    due = due or ""
    status = status or ""
    
    tag_regex = re.compile(r'(?:\[(?:DEADLINE|DURATION|GOAL):[^\]]*\]\s*\|?\s*)+')
    
    # 1. Process Title
    if strip_title_tags:
        title = tag_regex.sub("", title)
    title = " ".join(title.split()).strip()
    
    # 2. Process Notes
    parts = notes.split('---SYSTEM_METADATA---')
    base_notes = parts[0]
    lines = base_notes.splitlines()
    filtered_lines = []
    
    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith("SYS:"):
            continue
            
        no_tags = tag_regex.sub("", line)
        if re.match(r'^[ \t|]*$', no_tags):
            continue
            
        filtered_lines.append(no_tags)
        
    notes_str = " ".join(filtered_lines)
    notes_str = " ".join(notes_str.split()).strip()
    
    # 3. Process Due & Status
    due = " ".join(due.split()).strip()
    status = " ".join(status.split()).strip()
    
    # 4. Combine and hash
    content = f"{title}|{notes_str}|{due}|{status}"
    hasher = hashlib.md5(content.encode('utf-8'))
    return base64.b64encode(hasher.digest()).decode('utf-8')

def get_service(token_path):
    if not os.path.exists(token_path):
        print(f"Token file not found: {token_path}")
        return None
    creds = Credentials.from_authorized_user_file(token_path)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build('tasks', 'v1', credentials=creds)

def fetch_all_pages(request_method, **kwargs):
    """Fetches all pages from a paginated Google API list method, with retry and backoff."""
    items = []
    page_token = None
    max_retries = 3
    while True:
        if page_token:
            kwargs['pageToken'] = page_token
        elif 'pageToken' in kwargs:
            del kwargs['pageToken']
            
        retries = 0
        response = None
        while retries <= max_retries:
            try:
                response = request_method(**kwargs).execute()
                break
            except Exception as e:
                retries += 1
                if retries > max_retries:
                    print(f"Error fetching page after {max_retries} retries: {e}")
                    raise e
                print(f"Error fetching page (retry {retries}/{max_retries}): {e}")
                time.sleep(2 ** retries)
                
        items.extend(response.get('items', []))
        page_token = response.get('nextPageToken')
        if not page_token:
            break
    return items

def audit_profile(profile_name, token_path):
    print(f"=== Auditing Profile: {profile_name} ===")
    service = get_service(token_path)
    if not service:
        return None
    
    try:
        lists = fetch_all_pages(service.tasklists().list, maxResults=100)
    except Exception as e:
        print(f"Error listing task lists: {e}")
        return None

    mismatches = 0
    total_active_tasks = 0

    for lst in lists:
        list_title = lst['title']
        list_id = lst['id']
        if any(k in list_title.lower() for k in ["deleted", "quarantine"]):
            continue
        print(f"Checking list: {list_title}")
        
        try:
            tasks = fetch_all_pages(service.tasks().list, tasklist=list_id, showCompleted=False, showHidden=False)
        except Exception as e:
            print(f"  Error fetching tasks for list {list_title}: {e}")
            continue

        for t in tasks:
            total_active_tasks += 1
            title = t.get('title', '')
            notes = t.get('notes', '') or ''
            due = t.get('due', '')
            status = t.get('status', '')
            task_id = t.get('id', '')
            
            is_assigned = bool(t.get('assignmentInfo') or (t.get('webViewLink') and ('docs.google.com' in t.get('webViewLink') or 'chat.google.com' in t.get('webViewLink'))))
            
            metadata_str = ""
            existing_hash = None
            
            if notes:
                parts = notes.split('---SYSTEM_METADATA---')
                if len(parts) > 1:
                    metadata_str = parts[1].strip()
            
            if metadata_str:
                try:
                    meta = json.loads(metadata_str)
                    existing_hash = meta.get('ai_hash')
                except Exception:
                    pass

            computed_hash = get_standardized_task_hash(title, notes, due, status, True)
            
            if is_assigned:
                # Skipping assigned task in Python audit as their hashes are in GAS Script Properties
                continue

            if not existing_hash:
                print(f"  [MISMATCH] Task: '{title}' (ID: {task_id}) - Missing metadata/ai_hash")
                mismatches += 1
            elif existing_hash != computed_hash:
                print(f"  [MISMATCH] Task: '{title}' (ID: {task_id}) - Hash mismatch. Existing: {existing_hash}, Computed: {computed_hash}")
                mismatches += 1

    print(f"Profile {profile_name} Complete: Checked {total_active_tasks} active tasks, found {mismatches} mismatches.\n")
    return mismatches

def main():
    parser = argparse.ArgumentParser(description="Verify all tasks metadata and hashes.")
    parser.add_argument('--profile', choices=['private', 'work', 'both'], default='both', help='Profile to audit')
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    profiles = []
    if args.profile in ['private', 'both']:
        profiles.append(('Private', os.path.join(base_dir, 'auth', 'token_tasks.json')))
    if args.profile in ['work', 'both']:
        profiles.append(('Work', os.path.join(base_dir, 'auth', 'token_tasks_work.json')))

    total_mismatches = 0
    for name, path in profiles:
        mismatches = audit_profile(name, path)
        if mismatches is not None:
            total_mismatches += mismatches
            
    if total_mismatches > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == '__main__':
    main()
