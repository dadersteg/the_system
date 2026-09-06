#!/usr/bin/env python3
"""
sync_sheet_overrides_to_gmail.py
================================
Bidirectional Synchronization Worker (Google Sheets -> Gmail).
Scans '5 Import - Email Triage Log' for manual overrides in 'Revised Labels (Override)' (Column P),
applies the new labels and archive/delete states to the corresponding threads in Gmail,
and marks 'Override Status' (Column Q) as 'APPLIED - YYYY-MM-DD HH:MM'.

Usage:
  python3 scripts/utils/sync_sheet_overrides_to_gmail.py [--dry-run] [--lookback-rows 500] [--all]
"""

import os
import sys
import re
import argparse
from datetime import datetime

# Append project root
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(BASE_DIR)

from lib.google_auth import get_service
from lib.config import PRIVATE_SPREADSHEET_ID, AUTH_DIR

TOKEN_PATH = os.path.join(AUTH_DIR, 'token.json')
CREDS_PATH = os.path.join(AUTH_DIR, 'credentials.json')

TRIAGE_LOG_GID = 2131515996

PROCESSED_FLAG = '99 Label_Reviewed'
TEMP_DELETE_LABEL = '99 To be deleted'
SYSTEM_LABELS_TO_KEEP = {'INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH', PROCESSED_FLAG}

def extract_thread_id(link_val):
    if not link_val or not isinstance(link_val, str):
        return None
    m = re.search(r'#(?:all|inbox|trash|label\/[^\/]+)\/([a-f0-9]+)', link_val, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    parts = link_val.rstrip('/').split('/')
    last = parts[-1]
    if re.match(r'^[a-f0-9]{10,}$', last, re.IGNORECASE):
        return last.lower()
    return None

def get_or_create_label_id(gmail_service, label_name, label_map):
    """
    Returns the Gmail label ID for a given label name, creating it if it does not exist.
    """
    clean_name = label_name.strip()
    if not clean_name:
        return None

    if clean_name in label_map:
        return label_map[clean_name]

    # Create label in Gmail
    try:
        res = gmail_service.users().labels().create(
            userId='me',
            body={
                'name': clean_name,
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
        ).execute()
        label_id = res['id']
        label_map[clean_name] = label_id
        print(f"  + Created new Gmail label: '{clean_name}' (ID: {label_id})")
        return label_id
    except Exception as e:
        # Check if already exists (race condition)
        if 'already exists' in str(e).lower():
            labels_res = gmail_service.users().labels().list(userId='me').execute()
            for l in labels_res.get('labels', []):
                if l['name'].lower() == clean_name.lower():
                    label_map[clean_name] = l['id']
                    return l['id']
        print(f"  ! Error creating label '{clean_name}': {e}")
        return None

ACTION_VERBS = {
    'ARCHIVE': 'archive',
    'ARCHIVED': 'archive',
    'INBOX': 'inbox',
    'TEMP_DELETE': 'temp_delete',
    '99 TO BE DELETED': 'temp_delete',
    'DELETE': 'temp_delete',
    'TRASH': 'trash',
    'READ': 'read',
    'UNREAD': 'unread'
}

def parse_override_input(raw_input):
    """
    Parses comma-separated input from Column P into (category_labels, actions_dict).
    """
    if not raw_input or not isinstance(raw_input, str):
        return [], {}

    tokens = [t.strip() for t in raw_input.split(',') if t.strip()]
    labels = []
    actions = {
        'inbox_status': None, # 'ARCHIVED', 'INBOX', 'TEMP_DELETE', 'TRASH'
        'read_state': None    # 'READ', 'UNREAD'
    }

    for token in tokens:
        upper = token.upper()
        if upper in ('ARCHIVE', 'ARCHIVED'):
            actions['inbox_status'] = 'ARCHIVED'
        elif upper == 'INBOX':
            actions['inbox_status'] = 'INBOX'
        elif upper in ('TEMP_DELETE', '99 TO BE DELETED', 'DELETE'):
            actions['inbox_status'] = 'TEMP_DELETE'
            labels.append(TEMP_DELETE_LABEL)
        elif upper == 'TRASH':
            actions['inbox_status'] = 'TRASH'
        elif upper == 'READ':
            actions['read_state'] = 'READ'
        elif upper == 'UNREAD':
            actions['read_state'] = 'UNREAD'
        else:
            labels.append(token)

    return list(set(labels)), actions

def compute_label_diff(current_labels, override_label_names, label_map):
    """
    Computes (add_label_ids, remove_label_ids) for Gmail.Users.Threads.modify.
    """
    target_names = set([l.strip() for l in override_label_names if l.strip()])
    
    add_ids = []
    for name in target_names:
        lid = label_map.get(name)
        if lid:
            add_ids.append(lid)

    remove_ids = []
    for cur_id in current_labels:
        # Don't remove system flags or target labels
        cur_name = None
        for name, lid in label_map.items():
            if lid == cur_id:
                cur_name = name
                break

        if cur_name:
            if cur_name not in target_names and cur_name not in SYSTEM_LABELS_TO_KEEP:
                remove_ids.append(cur_id)

    return list(set(add_ids)), list(set(remove_ids))

def sync_sheet_overrides(dry_run=False, lookback_rows=500, scan_all=False):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Sheet -> Gmail Override Sync (Labels, Read, Archive, Delete)...")
    if dry_run:
        print(">>> DRY RUN MODE ACTIVE (No changes will be written to Gmail or Google Sheets) <<<")

    sheets_service = get_service('sheets', 'v4', TOKEN_PATH, CREDS_PATH, account_name="Sheets")
    gmail_service = get_service('gmail', 'v1', TOKEN_PATH, CREDS_PATH, account_name="Gmail")

    # Fetch existing Gmail labels map (Name -> ID)
    labels_res = gmail_service.users().labels().list(userId='me').execute()
    label_map = {l['name']: l['id'] for l in labels_res.get('labels', [])}
    print(f"Loaded {len(label_map)} existing Gmail labels.")

    # Fetch Sheet Data
    sheet_meta = sheets_service.spreadsheets().get(spreadsheetId=PRIVATE_SPREADSHEET_ID).execute()
    sheet_title = "5 Import - Email Triage Log"
    for s in sheet_meta.get('sheets', []):
        if str(s['properties']['sheetId']) == str(TRIAGE_LOG_GID):
            sheet_title = s['properties']['title']
            break

    print(f"Reading spreadsheet tab '{sheet_title}'...")
    data_res = sheets_service.spreadsheets().values().get(
        spreadsheetId=PRIVATE_SPREADSHEET_ID,
        range=f"'{sheet_title}'!A1:Q",
        valueRenderOption='FORMATTED_VALUE'
    ).execute()
    rows = data_res.get('values', [])
    if len(rows) <= 1:
        print("No data found in sheet.")
        return

    headers = [str(h).strip().lower() for h in rows[0]]
    link_idx = headers.index('link') if 'link' in headers else 8
    final_lbl_idx = headers.index('final label set') if 'final label set' in headers else 7
    inbox_idx = headers.index('inbox status') if 'inbox status' in headers else 9
    read_idx = headers.index('read state') if 'read state' in headers else 10
    override_idx = headers.index('revised labels (override)') if 'revised labels (override)' in headers else 15
    status_idx = headers.index('override status') if 'override status' in headers else 16
    subject_idx = headers.index('subject') if 'subject' in headers else 3

    start_row_idx = 1
    if not scan_all and lookback_rows and len(rows) > lookback_rows:
        start_row_idx = max(1, len(rows) - lookback_rows)
        print(f"Scanning latest {len(rows) - start_row_idx} rows (rows {start_row_idx + 1} to {len(rows)})...")
    else:
        print(f"Scanning all {len(rows) - 1} rows...")

    pending_overrides = []
    for r_idx in range(start_row_idx, len(rows)):
        row = rows[r_idx]
        override_val = row[override_idx].strip() if len(row) > override_idx and row[override_idx] else ""
        status_val = row[status_idx].strip() if len(row) > status_idx and row[status_idx] else ""
        link_val = row[link_idx].strip() if len(row) > link_idx and row[link_idx] else ""
        subject_val = row[subject_idx].strip() if len(row) > subject_idx and row[subject_idx] else "(No Subject)"

        if override_val and not status_val.startswith("APPLIED"):
            thread_id = extract_thread_id(link_val)
            if thread_id:
                target_labels, actions = parse_override_input(override_val)
                pending_overrides.append({
                    "sheet_row": r_idx + 1,
                    "thread_id": thread_id,
                    "subject": subject_val,
                    "target_labels": target_labels,
                    "actions": actions,
                    "override_raw": override_val
                })

    print(f"Found {len(pending_overrides)} pending overrides to apply.")

    if not pending_overrides:
        print("✓ All spreadsheet overrides are already applied and in sync.")
        return

    applied_count = 0
    sheet_updates = []
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M')

    for item in pending_overrides:
        tid = item["thread_id"]
        row_num = item["sheet_row"]
        raw_labels = item["target_labels"]
        actions = item["actions"]
        subj = item["subject"]

        print(f"\nProcessing Row {row_num} [{tid}]: '{subj[:40]}...'")
        print(f"  Target Labels: {raw_labels} | Actions: {actions}")

        try:
            # 1. Ensure all target labels exist in Gmail
            target_label_ids = []
            for lbl_name in raw_labels:
                if not dry_run:
                    lid = get_or_create_label_id(gmail_service, lbl_name, label_map)
                else:
                    lid = label_map.get(lbl_name, "NEW_LABEL_ID")
                if lid:
                    target_label_ids.append(lid)

            # 2. Fetch current thread state from Gmail
            cur_label_ids = []
            if not dry_run:
                thread_obj = gmail_service.users().threads().get(userId='me', id=tid, format='minimal').execute()
                for msg in thread_obj.get('messages', []):
                    cur_label_ids.extend(msg.get('labelIds', []))
                cur_label_ids = list(set(cur_label_ids))

            # 3. Compute Add/Remove diff for category labels
            add_ids, remove_ids = compute_label_diff(cur_label_ids, raw_labels, label_map)

            # 4. Handle Read / Unread actions
            if actions['read_state'] == 'READ':
                remove_ids.append('UNREAD')
            elif actions['read_state'] == 'UNREAD':
                add_ids.append('UNREAD')

            # 5. Handle Archive / Inbox / Trash actions
            if actions['inbox_status'] == 'ARCHIVED':
                remove_ids.append('INBOX')
            elif actions['inbox_status'] == 'INBOX':
                add_ids.append('INBOX')
            elif actions['inbox_status'] == 'TEMP_DELETE':
                if TEMP_DELETE_LABEL in label_map:
                    add_ids.append(label_map[TEMP_DELETE_LABEL])
                remove_ids.append('INBOX')
            elif actions['inbox_status'] == 'TRASH':
                if not dry_run:
                    gmail_service.users().threads().trash(userId='me', id=tid).execute()
                    print(f"  ✓ Moved thread {tid} to TRASH in Gmail")

            add_ids = list(set(add_ids))
            remove_ids = list(set(remove_ids))

            print(f"  Label Diff -> Add: {len(add_ids)}, Remove: {len(remove_ids)}")

            # 6. Apply modifications to Gmail
            if not dry_run and actions['inbox_status'] != 'TRASH':
                modify_body = {}
                if add_ids:
                    modify_body['addLabelIds'] = add_ids
                if remove_ids:
                    modify_body['removeLabelIds'] = remove_ids

                if modify_body:
                    gmail_service.users().threads().modify(
                        userId='me',
                        id=tid,
                        body=modify_body
                    ).execute()
                print(f"  ✓ Applied changes to Gmail thread {tid}")

            # 7. Prepare spreadsheet row updates
            applied_status = f"APPLIED - {now_str}"
            final_label_str = ", ".join(raw_labels) if raw_labels else (row[final_lbl_idx] if len(row) > final_lbl_idx else "")

            if raw_labels:
                sheet_updates.append({
                    "range": f"'{sheet_title}'!H{row_num}",
                    "values": [[final_label_str]]
                })
            if actions['inbox_status']:
                sheet_updates.append({
                    "range": f"'{sheet_title}'!J{row_num}",
                    "values": [[actions['inbox_status']]]
                })
            if actions['read_state']:
                sheet_updates.append({
                    "range": f"'{sheet_title}'!K{row_num}",
                    "values": [[actions['read_state']]]
                })

            sheet_updates.append({
                "range": f"'{sheet_title}'!Q{row_num}",
                "values": [[applied_status]]
            })
            applied_count += 1

        except Exception as e:
            print(f"  ! Error applying override to thread {tid}: {e}")
            if not dry_run:
                sheet_updates.append({
                    "range": f"'{sheet_title}'!Q{row_num}",
                    "values": [[f"ERROR: {str(e)[:50]}"]]
                })

    # Write updates back to Google Sheets
    if sheet_updates and not dry_run:
        print(f"\nWriting {len(sheet_updates)} status updates back to Google Sheets...")
        sheets_service.spreadsheets().values().batchUpdate(
            spreadsheetId=PRIVATE_SPREADSHEET_ID,
            body={
                "valueInputOption": "USER_ENTERED",
                "data": sheet_updates
            }
        ).execute()
        print(f"✓ Successfully updated {applied_count} rows in Google Sheets.")

    print(f"\n[DONE] Bidirectional sync complete. Applied {applied_count}/{len(pending_overrides)} overrides.")

def main():
    parser = argparse.ArgumentParser(description="Bidirectional sync from Google Sheets overrides to Gmail.")
    parser.add_argument('--dry-run', action='store_true', help="Preview actions without modifying Gmail or Google Sheets.")
    parser.add_argument('--lookback-rows', type=int, default=500, help="Number of recent rows to check (default: 500).")
    parser.add_argument('--all', action='store_true', help="Scan all rows in the sheet.")
    args = parser.parse_args()

    sync_sheet_overrides(
        dry_run=args.dry_run,
        lookback_rows=args.lookback_rows,
        scan_all=args.all
    )

if __name__ == '__main__':
    main()
