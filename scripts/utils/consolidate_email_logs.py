#!/usr/bin/env python3
"""
consolidate_email_logs.py
=========================
Consolidates, maps, normalizes, deduplicates, and sorts the two email tracking
tabs ('5 Import - Email Triage Log' and '5 Import - Retro Emails Log') from the
Master Google Spreadsheet into a unified analysis dataset.

Outputs:
  - CSV file (default: exports/Consolidated_Emails_Log.csv)
  - SQLite Database (default: exports/emails.db)
  - Optional Google Sheet tab sync (--write-to-sheet)

Usage:
  python3 scripts/utils/consolidate_email_logs.py [--write-to-sheet] [--sort-order desc|asc]
"""

import os
import sys
import re
import sqlite3
import csv
import argparse
from datetime import datetime, timezone, timedelta

# Append project root
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(BASE_DIR)

from lib.google_auth import get_service
from lib.config import PRIVATE_SPREADSHEET_ID, AUTH_DIR

TOKEN_PATH = os.path.join(AUTH_DIR, 'token.json')
CREDS_PATH = os.path.join(AUTH_DIR, 'credentials.json')

TRIAGE_LOG_GID = 2131515996
RETRO_LOG_GID = 67786861

STANDARD_COLUMNS = [
    "Timestamp",
    "Received First Message",
    "Received Last Message",
    "Subject",
    "AI Categories",
    "SS Labels",
    "Alias Labels",
    "Final Label Set",
    "Link",
    "Inbox Status",
    "Read State",
    "Sender",
    "AI Summary",
    "AI Action Items",
    "Task Synced",
    "Revised Labels (Override)",
    "Override Status"
]

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

from email.utils import parsedate_to_datetime

SWEDISH_MONTH_MAP = {
    'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr', 'maj': 'May', 'jun': 'Jun',
    'jul': 'Jul', 'aug': 'Aug', 'sep': 'Sep', 'okt': 'Oct', 'nov': 'Nov', 'dec': 'Dec'
}

def parse_date(val):
    """
    Parses a date from float serial number, RFC 2822 string, Swedish date string, or ISO string
    and returns (datetime_obj, formatted_iso_str).
    """
    if val is None or val == "":
        return None, ""

    # Check for numeric / float serial date (Sheets serial: days since 1899-12-30)
    if isinstance(val, (int, float)):
        try:
            if val > 10000:
                dt = datetime(1899, 12, 30) + timedelta(days=val)
                return dt, dt.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
        return None, ""

    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None, ""

        # Check if string is a small integer / corrupted value (e.g. "4")
        if re.match(r'^\d{1,4}$', s):
            return None, ""

        # Check if string is actually a numeric float (e.g. "46111.59027")
        try:
            fval = float(s)
            if fval > 10000:
                dt = datetime(1899, 12, 30) + timedelta(days=fval)
                return dt, dt.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            pass

        # Normalize Swedish months
        s_norm = s
        for sw, en in SWEDISH_MONTH_MAP.items():
            s_norm = re.sub(rf'\b{sw}\b', en, s_norm, flags=re.IGNORECASE)

        # Try RFC 2822 / email date format
        try:
            dt = parsedate_to_datetime(s_norm)
            if dt is not None:
                if dt.tzinfo is not None:
                    dt_utc = dt.astimezone(timezone.utc).replace(tzinfo=None)
                else:
                    dt_utc = dt
                return dt_utc, dt_utc.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass

        # Try various standard datetime formats
        date_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%Y-%m-%d',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%S.%fZ',
            '%Y-%m-%dT%H:%M:%SZ',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y %H:%M',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y %H:%M',
            '%d %b %Y %H:%M:%S',
            '%d %b %Y %H:%M',
            '%d %B %Y %H:%M:%S',
            '%d %B %Y %H:%M'
        ]
        for fmt in date_formats:
            try:
                dt = datetime.strptime(s_norm, fmt)
                return dt, dt.strftime('%Y-%m-%d %H:%M:%S')
            except ValueError:
                continue

        # If it starts with YYYY-MM-DD
        if len(s) >= 10 and re.match(r'^\d{4}-\d{2}-\d{2}', s):
            return None, s

        return None, ""

    return None, ""

def get_sheet_meta(sheets_service, spreadsheet_id):
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheet_map = {}
    for sheet in meta.get('sheets', []):
        props = sheet['properties']
        sheet_map[props['sheetId']] = props['title']
    return sheet_map

def find_header_row_and_map(rows):
    """
    Finds which row contains the headers by scanning for keywords 'link' and 'subject'.
    Returns (header_row_index, col_index_map).
    """
    for idx, row in enumerate(rows[:5]):
        row_lower = [str(c).strip().lower() for c in row]
        if 'link' in row_lower and ('subject' in row_lower or 'sender' in row_lower):
            col_map = {}
            for col_idx, col_name in enumerate(row):
                clean_name = str(col_name).strip().lower()
                for std in STANDARD_COLUMNS:
                    if std.lower() == clean_name:
                        col_map[std] = col_idx
                        break
            return idx, col_map
    return 0, {std: idx for idx, std in enumerate(STANDARD_COLUMNS)}

def fetch_and_normalize_sheet(sheets_service, spreadsheet_id, sheet_title, source_label):
    print(f"Fetching '{sheet_title}' from Google Sheets...")
    res = sheets_service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{sheet_title}'!A1:Q",
        valueRenderOption='UNFORMATTED_VALUE'
    ).execute()
    rows = res.get('values', [])
    if not rows:
        print(f"  Warning: No data in '{sheet_title}'.")
        return []

    header_row_idx, col_map = find_header_row_and_map(rows)
    print(f"  Header identified at row {header_row_idx + 1}. Mapped {len(col_map)}/{len(STANDARD_COLUMNS)} columns.")

    data_rows = rows[header_row_idx + 1:]
    print(f"  Processing {len(data_rows)} data rows from {source_label}...")

    normalized_records = []
    for row in data_rows:
        rec = {}
        for col_name in STANDARD_COLUMNS:
            idx = col_map.get(col_name)
            rec[col_name] = row[idx] if idx is not None and idx < len(row) and row[idx] is not None else ""

        # Normalize date strings & extract sort key
        ts_dt, ts_str = parse_date(rec["Timestamp"])
        first_dt, first_str = parse_date(rec["Received First Message"])
        last_dt, last_str = parse_date(rec["Received Last Message"])

        # Fallback if Received Last Message is missing/corrupted
        if not last_str:
            last_str = first_str or ts_str
            last_dt = first_dt or ts_dt
        if not first_str:
            first_str = last_str or ts_str
            first_dt = last_dt or ts_dt

        rec["Timestamp"] = ts_str
        rec["Received First Message"] = first_str
        rec["Received Last Message"] = last_str

        # Primary sort timestamp: Received Last Message -> Received First Message -> Timestamp
        sort_dt = last_dt or first_dt or ts_dt or datetime(1970, 1, 1)
        rec["_sort_dt"] = sort_dt
        rec["_source"] = source_label

        thread_id = extract_thread_id(str(rec.get("Link", "")))
        rec["_thread_id"] = thread_id

        normalized_records.append(rec)

    return normalized_records

def consolidate_email_logs(write_to_sheet=False, target_tab=None, sort_order="desc", output_csv=None, output_sqlite=None):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Email Logs Consolidation...")

    sheets_service = get_service('sheets', 'v4', TOKEN_PATH, CREDS_PATH, account_name="Sheets")
    sheet_map = get_sheet_meta(sheets_service, PRIVATE_SPREADSHEET_ID)

    triage_title = sheet_map.get(TRIAGE_LOG_GID, "5 Import - Email Triage Log")
    retro_title = sheet_map.get(RETRO_LOG_GID, "5 Import - Retro Emails Log")

    # 1. Fetch & normalize both tables
    triage_records = fetch_and_normalize_sheet(sheets_service, PRIVATE_SPREADSHEET_ID, triage_title, "Triage Log")
    retro_records = fetch_and_normalize_sheet(sheets_service, PRIVATE_SPREADSHEET_ID, retro_title, "Retro Log")

    print(f"\n--- Deduplication & Merging ---")
    print(f"Triage Log Rows: {len(triage_records)}")
    print(f"Retro Log Rows:  {len(retro_records)}")

    # Deduplicate: Keep Triage Log version if same thread_id is in both
    seen_threads = set()
    combined_records = []
    duplicate_count = 0

    # Add Triage Log records first (priority 1)
    for r in triage_records:
        tid = r["_thread_id"]
        if tid:
            seen_threads.add(tid)
        combined_records.append(r)

    # Add Retro Log records if thread_id not seen
    for r in retro_records:
        tid = r["_thread_id"]
        if tid and tid in seen_threads:
            duplicate_count += 1
            continue
        if tid:
            seen_threads.add(tid)
        combined_records.append(r)

    print(f"Overlap / Duplicates Skipped: {duplicate_count}")
    print(f"Total Unified Unique Rows:   {len(combined_records)}")

    # 2. Sort by date
    is_desc = (sort_order.lower() == "desc")
    combined_records.sort(key=lambda x: x["_sort_dt"], reverse=is_desc)

    dates_valid = [r["_sort_dt"] for r in combined_records if r["_sort_dt"] > datetime(1970, 1, 2)]
    if dates_valid:
        min_date = min(dates_valid).strftime('%Y-%m-%d')
        max_date = max(dates_valid).strftime('%Y-%m-%d')
        print(f"Consolidated Date Span: {min_date} to {max_date} (Sorted: {'Newest -> Oldest' if is_desc else 'Oldest -> Newest'})")

    # 3. Export to CSV
    if not output_csv:
        output_csv = os.path.join(BASE_DIR, 'exports', 'Consolidated_Emails_Log.csv')
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)

    print(f"\nWriting consolidated CSV to '{output_csv}'...")
    with open(output_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(STANDARD_COLUMNS)
        for r in combined_records:
            writer.writerow([r[c] for c in STANDARD_COLUMNS])
    print(f"✓ Saved {len(combined_records)} rows to CSV.")

    # 4. Export to SQLite DB
    if not output_sqlite:
        output_sqlite = os.path.join(BASE_DIR, 'exports', 'emails.db')
    os.makedirs(os.path.dirname(output_sqlite), exist_ok=True)

    print(f"Writing SQLite database to '{output_sqlite}'...")
    conn = sqlite3.connect(output_sqlite)
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS emails")
    cursor.execute("""
        CREATE TABLE emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT,
            timestamp TEXT,
            received_first TEXT,
            received_last TEXT,
            subject TEXT,
            ai_categories TEXT,
            ss_labels TEXT,
            alias_labels TEXT,
            final_label_set TEXT,
            link TEXT,
            inbox_status TEXT,
            read_state TEXT,
            sender TEXT,
            ai_summary TEXT,
            ai_action_items TEXT,
            task_synced TEXT,
            revised_labels TEXT,
            override_status TEXT,
            source TEXT
        )
    """)

    db_rows = []
    for r in combined_records:
        db_rows.append((
            r["_thread_id"],
            r["Timestamp"],
            r["Received First Message"],
            r["Received Last Message"],
            r["Subject"],
            r["AI Categories"],
            r["SS Labels"],
            r["Alias Labels"],
            r["Final Label Set"],
            r["Link"],
            r["Inbox Status"],
            r["Read State"],
            r["Sender"],
            r["AI Summary"],
            r["AI Action Items"],
            r["Task Synced"],
            r["Revised Labels (Override)"],
            r["Override Status"],
            r["_source"]
        ))

    cursor.executemany("""
        INSERT INTO emails (
            thread_id, timestamp, received_first, received_last, subject,
            ai_categories, ss_labels, alias_labels, final_label_set, link,
            inbox_status, read_state, sender, ai_summary, ai_action_items,
            task_synced, revised_labels, override_status, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, db_rows)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_thread_id ON emails(thread_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_received_last ON emails(received_last)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sender ON emails(sender)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inbox_status ON emails(inbox_status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_read_state ON emails(read_state)")

    conn.commit()
    conn.close()
    print(f"✓ Saved {len(combined_records)} rows with indexes to SQLite ('emails' table).")

    # 5. Optional Google Sheets Sync
    if write_to_sheet:
        if not target_tab:
            target_tab = triage_title # "5 Import - Email Triage Log"
        print(f"\nSyncing consolidated table directly to Google Sheets tab '{target_tab}'...")

        # Find target sheet ID
        target_sheet_id = None
        temp_tab_id = None
        for gid, name in sheet_map.items():
            if name == target_tab or str(gid) == str(TRIAGE_LOG_GID):
                target_sheet_id = gid
            if name == "5 Import - Consolidated Emails Log":
                temp_tab_id = gid

        # If temporary consolidated tab exists, delete it
        if temp_tab_id is not None:
            print("Removing temporary tab '5 Import - Consolidated Emails Log'...")
            try:
                sheets_service.spreadsheets().batchUpdate(
                    spreadsheetId=PRIVATE_SPREADSHEET_ID,
                    body={
                        "requests": [{
                            "deleteSheet": {
                                "sheetId": temp_tab_id
                            }
                        }]
                    }
                ).execute()
                print("✓ Removed temporary tab '5 Import - Consolidated Emails Log'.")
            except Exception as e:
                print(f"Note on deleting temp tab: {e}")

        # Ensure target sheet has enough rows
        required_rows = len(combined_records) + 100
        print(f"Ensuring tab '{target_tab}' (GID: {target_sheet_id}) has at least {required_rows} rows...")
        try:
            sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=PRIVATE_SPREADSHEET_ID,
                body={
                    "requests": [{
                        "updateSheetProperties": {
                            "properties": {
                                "sheetId": target_sheet_id,
                                "gridProperties": {
                                    "rowCount": required_rows,
                                    "columnCount": len(STANDARD_COLUMNS)
                                }
                            },
                            "fields": "gridProperties(rowCount,columnCount)"
                        }
                    }]
                }
            ).execute()
        except Exception as e:
            print(f"Note on updating sheet dimensions: {e}")

        # Clear existing data
        print(f"Clearing existing rows in '{target_tab}'...")
        sheets_service.spreadsheets().values().clear(
            spreadsheetId=PRIVATE_SPREADSHEET_ID,
            range=f"'{target_tab}'!A:Q"
        ).execute()

        # Format header + data
        all_values = [STANDARD_COLUMNS]
        for r in combined_records:
            all_values.append([r[c] for c in STANDARD_COLUMNS])

        # Batch upload in chunks of 5000 rows
        chunk_size = 5000
        total_chunks = (len(all_values) - 1) // chunk_size + 1
        print(f"Uploading {len(all_values)} total rows in {total_chunks} chunks...")
        for i in range(0, len(all_values), chunk_size):
            chunk = all_values[i:i + chunk_size]
            start_row = i + 1
            end_row = i + len(chunk)
            range_chunk = f"'{target_tab}'!A{start_row}:Q{end_row}"
            sheets_service.spreadsheets().values().update(
                spreadsheetId=PRIVATE_SPREADSHEET_ID,
                range=range_chunk,
                valueInputOption='USER_ENTERED',
                body={"values": chunk}
            ).execute()
            print(f"  Uploaded chunk {i//chunk_size + 1}/{total_chunks} (Rows {start_row}-{end_row})")

        # Format header row bold and frozen
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=PRIVATE_SPREADSHEET_ID,
            body={
                "requests": [
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": target_sheet_id,
                                "startRowIndex": 0,
                                "endRowIndex": 1
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "textFormat": {"bold": True},
                                    "backgroundColor": {"red": 0.81, "green": 0.88, "blue": 0.95}
                                }
                            },
                            "fields": "userEnteredFormat(textFormat,backgroundColor)"
                        }
                    },
                    {
                        "updateSheetProperties": {
                            "properties": {
                                "sheetId": target_sheet_id,
                                "gridProperties": {
                                    "frozenRowCount": 1
                                }
                            },
                            "fields": "gridProperties.frozenRowCount"
                        }
                    }
                ]
            }
        ).execute()
        print(f"✓ Successfully synced {len(combined_records)} rows directly into Google Sheets tab '{target_tab}'!")

    print(f"\n[DONE] Consolidation complete.")

def main():
    parser = argparse.ArgumentParser(description="Consolidate Email Triage Log and Retro Emails Log into a single sorted analysis dataset.")
    parser.add_argument('--write-to-sheet', action='store_true', help="Also sync the consolidated table directly into Google Sheets tab.")
    parser.add_argument('--target-tab', type=str, default=None, help="Target tab name (defaults to '5 Import - Email Triage Log').")
    parser.add_argument('--sort-order', choices=['desc', 'asc'], default='desc', help="Date sort order: desc (newest first, default) or asc (oldest first).")
    parser.add_argument('--output-csv', type=str, default=None, help="Custom output CSV path.")
    parser.add_argument('--output-sqlite', type=str, default=None, help="Custom output SQLite path.")
    args = parser.parse_args()

    consolidate_email_logs(
        write_to_sheet=args.write_to_sheet,
        target_tab=args.target_tab,
        sort_order=args.sort_order,
        output_csv=args.output_csv,
        output_sqlite=args.output_sqlite
    )

if __name__ == '__main__':
    main()
