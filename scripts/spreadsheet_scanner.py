import os
import re
import sys
import json
import time
from datetime import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Spreadsheet IDs
PERSONAL_SPREADSHEET_ID = "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4"
WORK_SPREADSHEET_ID = "138WPSyh9B8CJRuZbYw7YoReGGUnj-veU_eTF3DuuArw"
SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']

# Find repo root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_PATH = os.path.join(REPO_ROOT, 'token.json')
OUTPUT_PATH = "/Users/daniel/Documents/the_system/.agents/implementer_1/raw_audit_data.json"

# Inappropriate sheet names for case-insensitive search (single generic words)
INAPPROPRIATE_CASE_INSENSITIVE = {"index", "dashboard", "log", "data", "sheet"}

def get_credentials():
    creds = None
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing credentials...")
            creds.refresh(Request())
        else:
            raise Exception(f"Credentials not found or invalid at {TOKEN_PATH}")
    return creds

def is_case_insensitive_appropriate(name):
    return name.lower() not in INAPPROPRIATE_CASE_INSENSITIVE

def fetch_sheet_details(sheets_service, spreadsheet_id, spreadsheet_label):
    print(f"Fetching metadata for {spreadsheet_label} spreadsheet: {spreadsheet_id}")
    spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets_metadata = spreadsheet.get('sheets', [])
    
    results = []
    for sheet in sheets_metadata:
        props = sheet.get('properties', {})
        title = props.get('title')
        gid = props.get('sheetId')
        grid_props = props.get('gridProperties', {})
        row_count = grid_props.get('rowCount', 0)
        col_count = grid_props.get('columnCount', 0)
        
        # Read the actual values to get header row and populated counts
        escaped_title = title.replace("'", "''")
        safe_title = f"'{escaped_title}'"
        print(f"  Reading values for sheet: {title} (GID: {gid})...")
        
        try:
            val_response = sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=safe_title
            ).execute()
            values = val_response.get('values', [])
        except Exception as e:
            print(f"    Warning: failed to read values for {title}: {e}")
            values = []
            
        header_row = values[0] if len(values) > 0 else []
        
        # Calculate populated rows and last populated row
        populated_rows_count = 0
        last_populated_row = 0
        for idx, row in enumerate(values):
            # Check if row has any cell with non-empty text/value
            has_data = any(cell is not None and str(cell).strip() != '' for cell in row)
            if has_data:
                populated_rows_count += 1
                last_populated_row = idx + 1
                
        results.append({
            "spreadsheet_id": spreadsheet_id,
            "spreadsheet_label": spreadsheet_label,
            "title": title,
            "gid": gid,
            "rowCount": row_count,
            "columnCount": col_count,
            "header_row": header_row,
            "populated_rows_count": populated_rows_count,
            "last_populated_row": last_populated_row
        })
        time.sleep(0.2)  # Avoid rate limits
        
    return results

def scan_codebase(sheets_info):
    # Extract unique GIDs and Sheet Names
    unique_gids = sorted(list({sheet['gid'] for sheet in sheets_info}))
    unique_sheet_names = sorted(list({sheet['title'] for sheet in sheets_info}))
    
    # Pre-compile regex patterns for efficiency
    gid_patterns = {}
    for gid in unique_gids:
        # Match gid as a standalone word/number pattern
        gid_patterns[gid] = re.compile(r'\b' + re.escape(str(gid)) + r'\b')
        
    name_patterns = {}
    for name in unique_sheet_names:
        exact_pattern = re.compile(r'\b' + re.escape(name) + r'\b')
        if is_case_insensitive_appropriate(name):
            ci_pattern = re.compile(r'\b' + re.escape(name) + r'\b', re.IGNORECASE)
        else:
            ci_pattern = None
        name_patterns[name] = {
            "exact": exact_pattern,
            "case_insensitive": ci_pattern
        }
        
    # Result structures
    gid_matches = {str(gid): [] for gid in unique_gids}
    name_matches = {name: [] for name in unique_sheet_names}
    
    # Excluded directories
    ignored_dirs = {'.venv', '.agents', '.git', '.wwebjs_auth', '.wwebjs_cache', 'chrome_profile'}
    allowed_extensions = {'.js', '.py', '.sh', '.json', '.yml', '.yaml'}
    
    scanned_files = []
    
    print(f"Scanning codebase under {REPO_ROOT}...")
    for root, dirs, files in os.walk(REPO_ROOT):
        # Prune ignored directories in-place
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext not in allowed_extensions:
                continue
                
            file_path = os.path.join(root, file)
            # Make path relative to repo root for clean display
            rel_path = os.path.relpath(file_path, REPO_ROOT)
            
            scanned_files.append(rel_path)
            
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_num, line in enumerate(f, 1):
                        # 1. Scan for GIDs
                        for gid, pattern in gid_patterns.items():
                            if pattern.search(line):
                                gid_matches[str(gid)].append({
                                    "file": rel_path,
                                    "line_number": line_num,
                                    "line_content": line.rstrip('\r\n'),
                                    "match_value": str(gid)
                                })
                                
                        # 2. Scan for Sheet Names
                        for name, patterns in name_patterns.items():
                            # Exact check
                            if patterns["exact"].search(line):
                                name_matches[name].append({
                                    "file": rel_path,
                                    "line_number": line_num,
                                    "line_content": line.rstrip('\r\n'),
                                    "match_type": "exact",
                                    "match_value": name
                                })
                            # Case-insensitive check (if appropriate and not already matched exactly)
                            elif patterns["case_insensitive"] and patterns["case_insensitive"].search(line):
                                name_matches[name].append({
                                    "file": rel_path,
                                    "line_number": line_num,
                                    "line_content": line.rstrip('\r\n'),
                                    "match_type": "case_insensitive",
                                    "match_value": name
                                })
            except Exception as e:
                print(f"Error reading file {rel_path}: {e}")
                
    return gid_matches, name_matches, scanned_files

def main():
    start_time = time.time()
    try:
        creds = get_credentials()
        sheets_service = build('sheets', 'v4', credentials=creds)
        
        # 1. Fetch details from both spreadsheets
        personal_sheets = fetch_sheet_details(sheets_service, PERSONAL_SPREADSHEET_ID, "Personal")
        work_sheets = fetch_sheet_details(sheets_service, WORK_SPREADSHEET_ID, "Work")
        
        all_sheets = personal_sheets + work_sheets
        
        # 2. Scan codebase for matches
        gid_matches, name_matches, scanned_files = scan_codebase(all_sheets)
        
        # 3. Construct final output structure
        output_data = {
            "scan_metadata": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "duration_seconds": round(time.time() - start_time, 2),
                "scanned_files_count": len(scanned_files),
                "spreadsheets": [
                    {"id": PERSONAL_SPREADSHEET_ID, "label": "Personal"},
                    {"id": WORK_SPREADSHEET_ID, "label": "Work"}
                ]
            },
            "sheets": all_sheets,
            "codebase_scan_results": {
                "gid_matches": gid_matches,
                "sheet_name_matches": name_matches
            }
        }
        
        # Save output
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)
            
        print(f"\nScan completed successfully in {output_data['scan_metadata']['duration_seconds']}s!")
        print(f"Results written to: {OUTPUT_PATH}")
        print(f"Total files scanned: {len(scanned_files)}")
        
    except Exception as e:
        print(f"Error executing scanner script: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
