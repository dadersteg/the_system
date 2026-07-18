#!/usr/bin/env python3
"""
clean_task_categories.py
Reads all existing task logs from '5 Import - Google Tasks Log', resolves their
categories and titles based on the active taxonomy, and updates the sheet.
This guarantees the Task Pivot Table groups tasks correctly.
"""

import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PRIVATE_SID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
WORK_SID = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"

def get_sheets_service():
    token_path = 'auth/token.json'
    with open(token_path, 'r') as f:
        creds_data = json.load(f)
    creds = Credentials.from_authorized_user_info(creds_data)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, 'w') as f:
            json.dump(creds_to_dict(creds), f)
    return build('sheets', 'v4', credentials=creds)

def creds_to_dict(creds):
    return {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }

def resolve_category_and_title(title, category_val, valid_paths):
    computed_category = category_val or "N/A"
    computed_title = title or "No Title"
    
    # Try title-split matching
    title_parts = computed_title.split(" > ")
    tax_path_idx = -1
    for i in range(len(title_parts) - 1):
        candidate = " > ".join(title_parts[:i+1]).strip().lower()
        if candidate in valid_paths:
            tax_path_idx = i
            
    if tax_path_idx != -1:
        computed_category = " > ".join(title_parts[:tax_path_idx+1]).strip()
        computed_title = " > ".join(title_parts[tax_path_idx+1:]).strip()
        return computed_category, computed_title
        
    # Try category metadata prefix matching
    if computed_category and computed_category != "N/A":
        cat_parts = computed_category.split(" > ")
        cat_path_idx = -1
        for i in range(len(cat_parts)):
            candidate = " > ".join(cat_parts[:i+1]).strip().lower()
            if candidate in valid_paths:
                cat_path_idx = i
        if cat_path_idx != -1:
            computed_category = " > ".join(cat_parts[:cat_path_idx+1]).strip()
            if cat_path_idx < len(cat_parts) - 1:
                sub_cat = " > ".join(cat_parts[cat_path_idx+1:]).strip()
                computed_title = f"{sub_cat} > {computed_title}"
            return computed_category, computed_title
            
    # Fallback split
    if len(title_parts) >= 2:
        computed_category = " > ".join(title_parts[:-1]).strip()
        computed_title = title_parts[-1].strip()
        
    return computed_category, computed_title

def clean_tasks_log(service, spreadsheet_id, label, sheet_name="5 Import - Google Tasks Log"):
    print(f"\n==========================================")
    print(f"CLEANING TASK CATEGORIES FOR: {label} - {sheet_name} ({spreadsheet_id})")
    print(f"==========================================")
    
    # 1. Load taxonomy paths
    res_tax = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range="'3 Config - Workspace Taxonomy'!A1:K"
    ).execute()
    tax_rows = res_tax.get('values', [])
    if not tax_rows:
        print("  [ERROR] Taxonomy sheet is empty or not found.")
        return
        
    headers = tax_rows[0]
    try:
        path_idx = headers.index("Concat (Path)")
    except ValueError:
        print("  [ERROR] 'Concat (Path)' column not found in Taxonomy headers.")
        return
        
    valid_paths = set()
    for row in tax_rows[1:]:
        if path_idx < len(row) and row[path_idx]:
            valid_paths.add(str(row[path_idx]).strip().lower())
            
    print(f"  Loaded {len(valid_paths)} valid taxonomy paths.")
    
    # 2. Load Tasks Log
    res_tasks = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{sheet_name}'!A1:Q"
    ).execute()
    task_rows = res_tasks.get('values', [])
    if not task_rows or len(task_rows) < 3:
        print("  [INFO] Tasks Log sheet is empty or has no data rows.")
        return
        
    print(f"  Loaded {len(task_rows) - 2} data rows from Google Tasks Log.")
    
    # We will prepare update batches for Category (Col C), Sub-Category (Col D) and Title (Col E)
    updates_count = 0
    updated_rows = []
    
    # Read row 2 onwards (row index 1)
    for idx, row in enumerate(task_rows):
      if idx < 1:  # Skip header row
        continue
        
      parent_cat = row[2] if len(row) > 2 else ""
      sub_cat = row[3] if len(row) > 3 else ""
      category_val = f"{parent_cat} > {sub_cat}" if sub_cat else parent_cat
      title_val = row[4] if len(row) > 4 else ""
      
      new_cat, new_title = resolve_category_and_title(title_val, category_val, valid_paths)
      
      new_parent = new_cat
      new_sub = ""
      if " > " in new_cat:
          parts_cat = new_cat.split(" > ", 1)
          new_parent = parts_cat[0]
          new_sub = parts_cat[1]
          
      if new_parent != parent_cat or new_sub != sub_cat or new_title != title_val:
          updates_count += 1
      
      # Pad row to make sure it has at least 5 items
      while len(row) < 5:
          row.append("")
      row[2] = new_parent
      row[3] = new_sub
      row[4] = new_title
      updated_rows.append(row)
      
  if updates_count > 0:
      print(f"  Updating {updates_count} rows with cleaned categories and titles...")
      # Write back columns C, D, and E for the updated rows
      write_values = [[r[2], r[3], r[4]] for r in updated_rows]
      service.spreadsheets().values().update(
          spreadsheetId=spreadsheet_id,
          range=f"'{sheet_name}'!C2:E{len(write_values)+1}",
          valueInputOption="USER_ENTERED",
          body={"values": write_values}
      ).execute()
      print(f"  [SUCCESS] Updated {updates_count} rows in {label} spreadsheet.")
    else:
        print("  [OK] All tasks are already correctly grouped.")

def main():
    service = get_sheets_service()
    clean_tasks_log(service, PRIVATE_SID, "Private")
    clean_tasks_log(service, WORK_SID, "Work - Google Tasks Log")
    clean_tasks_log(service, WORK_SID, "Work - Work Tasks Log", "5 Import - Work Tasks Log")

if __name__ == '__main__':
    main()
