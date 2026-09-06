#!/usr/bin/env python3
"""
sync_email_inbox_status.py
==========================
Synchronizes the 'Inbox Status' column in '5 Import - Email Triage Log'
(Master Spreadsheet) against live Gmail thread state using high-speed
set-based query reconciliation.

Usage:
  python3 sync_email_inbox_status.py [--dry-run] [--lookback-days 60] [--all]
"""

import os
import sys
import re
import argparse
from datetime import datetime, timezone, timedelta

# Append project root
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(BASE_DIR)

from lib.google_auth import get_service
from lib.config import PRIVATE_SPREADSHEET_ID, AUTH_DIR

EMAIL_LOG_GID = 2131515996
TOKEN_PATH = os.path.join(AUTH_DIR, 'token.json')
CREDS_PATH = os.path.join(AUTH_DIR, 'credentials.json')

def extract_thread_id(link_val):
    if not link_val or not isinstance(link_val, str):
        return None
    m = re.search(r'#(?:all|inbox|trash|label\/[^\/]+)\/([a-f0-9]+)', link_val, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    # Fallback to last path segment if hex
    parts = link_val.rstrip('/').split('/')
    last = parts[-1]
    if re.match(r'^[a-f0-9]{10,}$', last, re.IGNORECASE):
        return last.lower()
    return None

def fetch_gmail_id_sets(gmail_service):
    """
    Fetches all current thread IDs in Inbox, Trash, Temp Delete, and Unread in batch searches.
    """
    inbox_ids = set()
    trash_ids = set()
    temp_delete_ids = set()
    unread_ids = set()

    # 1. Fetch all threads in inbox
    print("Fetching active threads from Gmail 'in:inbox'...")
    page_token = None
    while True:
        resp = gmail_service.users().threads().list(
            userId='me', q='in:inbox', maxResults=500, pageToken=page_token
        ).execute()
        threads = resp.get('threads', [])
        for t in threads:
            inbox_ids.add(t['id'].lower())
        page_token = resp.get('nextPageToken')
        if not page_token or len(inbox_ids) >= 3000:
            break

    # 2. Fetch threads in trash from last 30 days
    print("Fetching trash threads from Gmail 'in:trash newer_than:30d'...")
    page_token = None
    while True:
        resp = gmail_service.users().threads().list(
            userId='me', q='in:trash newer_than:30d', maxResults=500, pageToken=page_token
        ).execute()
        threads = resp.get('threads', [])
        for t in threads:
            trash_ids.add(t['id'].lower())
        page_token = resp.get('nextPageToken')
        if not page_token or len(trash_ids) >= 3000:
            break

    # 3. Fetch threads with '99 To be deleted' label
    print("Fetching threads with '99 To be deleted' label...")
    try:
        page_token = None
        while True:
            resp = gmail_service.users().threads().list(
                userId='me', q='label:"99 To be deleted"', maxResults=500, pageToken=page_token
            ).execute()
            threads = resp.get('threads', [])
            for t in threads:
                temp_delete_ids.add(t['id'].lower())
            page_token = resp.get('nextPageToken')
            if not page_token or len(temp_delete_ids) >= 3000:
                break
    except Exception as e:
        print(f"Note: Could not query '99 To be deleted' label: {e}")

    # 4. Fetch unread threads
    print("Fetching unread threads from Gmail 'is:unread'...")
    try:
        page_token = None
        while True:
            resp = gmail_service.users().threads().list(
                userId='me', q='is:unread', maxResults=500, pageToken=page_token
            ).execute()
            threads = resp.get('threads', [])
            for t in threads:
                unread_ids.add(t['id'].lower())
            page_token = resp.get('nextPageToken')
            if not page_token or len(unread_ids) >= 3000:
                break
    except Exception as e:
        print(f"Note: Could not query 'is:unread': {e}")

    print(f"Found {len(inbox_ids)} threads in Inbox, {len(trash_ids)} in Trash, {len(temp_delete_ids)} flagged 99 To be deleted, {len(unread_ids)} unread.")
    return inbox_ids, trash_ids, temp_delete_ids, unread_ids

def get_sheet_title(sheets_service, spreadsheet_id, gid):
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get('sheets', []):
        if sheet['properties']['sheetId'] == gid:
            return sheet['properties']['title']
    return "5 Import - Email Triage Log"

def sync_email_status(dry_run=False, lookback_days=None, process_all=False):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Email Status & Read State Sync...")
    
    gmail_service = get_service('gmail', 'v1', TOKEN_PATH, CREDS_PATH, account_name="Gmail")
    sheets_service = get_service('sheets', 'v4', TOKEN_PATH, CREDS_PATH, account_name="Sheets")
    
    sheet_title = get_sheet_title(sheets_service, PRIVATE_SPREADSHEET_ID, EMAIL_LOG_GID)
    print(f"Reading spreadsheet tab '{sheet_title}'...")

    range_name = f"'{sheet_title}'!A1:Q"
    res = sheets_service.spreadsheets().values().get(
        spreadsheetId=PRIVATE_SPREADSHEET_ID,
        range=range_name,
        valueRenderOption='UNFORMATTED_VALUE'
    ).execute()
    rows = res.get('values', [])
    
    if not rows:
        print("No rows found in sheet.")
        return

    headers = [str(h).strip().lower() for h in rows[0]]
    try:
        link_idx = headers.index('link')
        status_idx = headers.index('inbox status')
        read_idx = headers.index('read state')
    except ValueError as e:
        print(f"Required header not found: {e}")
        return

    ts_idx = headers.index('timestamp') if 'timestamp' in headers else 0

    inbox_ids, trash_ids, temp_delete_ids, unread_ids = fetch_gmail_id_sets(gmail_service)

    now = datetime.now()
    cutoff_date = (now - timedelta(days=lookback_days)) if lookback_days and not process_all else None

    updates = []
    stats = {
        'checked': 0,
        'inbox_to_archived': 0,
        'archived_to_inbox': 0,
        'to_temp_delete': 0,
        'unread_to_read': 0,
        'read_to_unread': 0,
        'status_unchanged': 0,
        'read_unchanged': 0,
        'skipped_out_of_window': 0
    }

    for row_num, row in enumerate(rows[1:], start=2):
        if len(row) <= link_idx:
            continue
            
        link_val = str(row[link_idx]) if row[link_idx] else ""
        thread_id = extract_thread_id(link_val)
        if not thread_id:
            continue

        curr_status = str(row[status_idx]).strip() if len(row) > status_idx and row[status_idx] is not None else ""
        curr_read = str(row[read_idx]).strip() if len(row) > read_idx and row[read_idx] is not None else ""

        # Filter by lookback window unless process_all is True or row is currently marked INBOX or UNREAD
        if cutoff_date and curr_status != "INBOX" and curr_read != "UNREAD":
            ts_val = row[ts_idx] if len(row) > ts_idx else None
            row_date = None
            if isinstance(ts_val, (int, float)):
                row_date = datetime(1899, 12, 30) + timedelta(days=ts_val)
            elif isinstance(ts_val, str) and len(ts_val) >= 10:
                try:
                    row_date = datetime.strptime(ts_val[:10], '%Y-%m-%d')
                except Exception:
                    pass
            if row_date and row_date < cutoff_date:
                stats['skipped_out_of_window'] += 1
                continue

        stats['checked'] += 1

        # Determine real live inbox status
        if thread_id in inbox_ids:
            real_status = "INBOX"
        elif thread_id in trash_ids or thread_id in temp_delete_ids:
            real_status = "TEMP_DELETE"
        elif curr_status == "TEMP_DELETE":
            real_status = "TEMP_DELETE"
        else:
            real_status = "ARCHIVED"

        # Determine real live read state
        real_read = "UNREAD" if thread_id in unread_ids else "READ"

        status_changed = (real_status != curr_status)
        read_changed = (real_read != curr_read)

        if status_changed:
            if curr_status == "INBOX" and real_status == "ARCHIVED":
                stats['inbox_to_archived'] += 1
            elif curr_status == "ARCHIVED" and real_status == "INBOX":
                stats['archived_to_inbox'] += 1
            elif real_status == "TEMP_DELETE":
                stats['to_temp_delete'] += 1
        else:
            stats['status_unchanged'] += 1

        if read_changed:
            if curr_read == "UNREAD" and real_read == "READ":
                stats['unread_to_read'] += 1
            elif curr_read == "READ" and real_read == "UNREAD":
                stats['read_to_unread'] += 1
        else:
            stats['read_unchanged'] += 1

        if status_changed or read_changed:
            updates.append({
                'row': row_num,
                'status_col_letter': chr(ord('A') + status_idx),
                'read_col_letter': chr(ord('A') + read_idx),
                'old_status': curr_status,
                'new_status': real_status,
                'old_read': curr_read,
                'new_read': real_read,
                'status_changed': status_changed,
                'read_changed': read_changed,
                'subject': str(row[headers.index('subject')]) if 'subject' in headers and len(row) > headers.index('subject') else "",
                'thread_id': thread_id
            })

    print(f"\n--- Sync Summary ---")
    print(f"Total Rows Evaluated: {stats['checked']}")
    print(f"Inbox Status Transitions: {stats['inbox_to_archived'] + stats['archived_to_inbox'] + stats['to_temp_delete']}")
    print(f"  * INBOX -> ARCHIVED: {stats['inbox_to_archived']}")
    print(f"  * ARCHIVED -> INBOX: {stats['archived_to_inbox']}")
    print(f"  * -> TEMP_DELETE: {stats['to_temp_delete']}")
    print(f"Read State Transitions: {stats['unread_to_read'] + stats['read_to_unread']}")
    print(f"  * UNREAD -> READ: {stats['unread_to_read']}")
    print(f"  * READ -> UNREAD: {stats['read_to_unread']}")
    if cutoff_date:
        print(f"Rows Skipped (Older than {lookback_days} days & already archived/read): {stats['skipped_out_of_window']}")

    if not updates:
        print("\nAll evaluated rows are fully in sync with Gmail!")
        return

    # Print sample of updates
    print("\nSample Updates (first 10):")
    for u in updates[:10]:
        changes = []
        if u['status_changed']:
            changes.append(f"Status: [{u['old_status']}] -> [{u['new_status']}]")
        if u['read_changed']:
            changes.append(f"Read: [{u['old_read']}] -> [{u['new_read']}]")
        print(f"  Row {u['row']}: {', '.join(changes)} | {u['subject'][:45]} ({u['thread_id']})")

    if dry_run:
        print("\n[DRY RUN] No changes were written to Google Sheets.")
        return

    # Batch write updates to Google Sheets
    print(f"\nApplying updates for {len(updates)} rows to Google Sheets...")
    
    data_payload = []
    for u in updates:
        if u['status_changed'] and u['read_changed']:
            cell_range = f"'{sheet_title}'!{u['status_col_letter']}{u['row']}:{u['read_col_letter']}{u['row']}"
            data_payload.append({
                'range': cell_range,
                'values': [[u['new_status'], u['new_read']]]
            })
        elif u['status_changed']:
            cell_range = f"'{sheet_title}'!{u['status_col_letter']}{u['row']}"
            data_payload.append({
                'range': cell_range,
                'values': [[u['new_status']]]
            })
        elif u['read_changed']:
            cell_range = f"'{sheet_title}'!{u['read_col_letter']}{u['row']}"
            data_payload.append({
                'range': cell_range,
                'values': [[u['new_read']]]
            })

    # Chunk into batches of 500
    batch_size = 500
    for i in range(0, len(data_payload), batch_size):
        chunk = data_payload[i:i+batch_size]
        body = {
            'valueInputOption': 'USER_ENTERED',
            'data': chunk
        }
        sheets_service.spreadsheets().values().batchUpdate(
            spreadsheetId=PRIVATE_SPREADSHEET_ID,
            body=body
        ).execute()
        print(f"  Committed batch {i//batch_size + 1}/{(len(data_payload)-1)//batch_size + 1} ({len(chunk)} ranges)")

    print("\n✓ Successfully synchronized Inbox Status and Read State in Google Sheets!")

def main():
    parser = argparse.ArgumentParser(description="Synchronize Google Sheets Email Triage Log 'Inbox Status' with Gmail.")
    parser.add_argument('--dry-run', action='store_true', help="Preview changes without writing to spreadsheet.")
    parser.add_argument('--lookback-days', type=int, default=60, help="Lookback window in days (default: 60). Note: all INBOX rows are checked regardless.")
    parser.add_argument('--all', action='store_true', help="Check ALL historical rows regardless of timestamp.")
    args = parser.parse_args()

    sync_email_status(dry_run=args.dry_run, lookback_days=args.lookback_days, process_all=args.all)

if __name__ == '__main__':
    main()
