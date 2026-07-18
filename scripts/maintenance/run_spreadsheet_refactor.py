#!/usr/bin/env python3
"""
run_spreadsheet_refactor.py
Performs alignment, tab renaming, visibility management, Index tab creation,
Clerk Tracker tool setup, interactive Pivot Tables setup, rules cleaning,
and premium custom column width resizing with text wrapping.
"""

import os
import json
import time
import math
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PRIVATE_SID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
WORK_SID = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"

# Target GIDs to rename/create
RENAME_MAPPING = {
    1111111111: "00 Index",
    1212121212: "10 Email Tracker",
    1717171717: "10 Drive Tracker",
    1414141414: "10 Tasks Overview",
    1679876125: "2 Input - Email Rules",
    938516466: "2 Input - File Naming Rules",
    1297520241: "2 Input - File Folder Rules",
    1799689202: "3 Config - Email Aliases",
    1287896098: "3 Config - Workspace Taxonomy",
    1704335578: "5 Import - Gemini Models",
    1007497112: "5 Import - Gmail Labels",
    536537641: "5 Import - Drive Directory Tree",
    2131515996: "5 Import - Email Triage Log",
    1580572397: "5 Import - Google Tasks Log",
    1580572400: "5 Import - Completed Tasks Log",
    1799689203: "3 Config - Email Rules Receiver",
    809034738: "5 Import - Drive Files Log",
    967747913: "5 Import - Notes Log",
    1835375017: "5 Import - Reset Actions Log",
    1657749758: "5 Import - Session Stats Log",
    67786861: "5 Import - Retro Emails Log",
    1325920151: "5 Import - Retro Files Log",
    275991319: "5 Import - Work Tasks Log" # Work only
}

# GID to Delete (Gmail 03 Remove Label Rules)
DELETE_GID = 1593358623

# Tab Visibility Classification
HIDDEN_GIDS = {
    938516466,   # File Naming Rules
    1297520241,  # File Folder Rules
    1799689202,  # Email Aliases
    1799689203,  # Email Rules Receiver
    1287896098,  # Workspace Taxonomy
    1704335578,  # Gemini Models
    1007497112,  # Gmail Labels
    536537641,   # Drive Directory Tree
    1835375017,  # Reset Actions Log
    1657749758,  # Session Stats Log
    67786861,    # Retro Emails Log
    1325920151   # Retro Files Log
}

ORDERED_GIDS = [
    1111111111,  # Index
    1212121212,  # Clerk Tracker
    1414141414,  # Tasks Pivot
    1679876125,  # Email Rules
    2131515996,  # Email Triage Log
    1580572397,  # Google Tasks Log
    1580572400,  # Completed Tasks Log
    809034738,   # Drive Files Log
    967747913    # Notes Log
]

def get_sheets_service():
    token_path = 'auth/token.json'
    if not os.path.exists(token_path):
        raise FileNotFoundError(f"Credentials token not found at {token_path}")
    
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

def sync_tab_names_and_visibility(service, spreadsheet_id, label):
    """Aligns sheet GIDs with their new names, deletes unused/analytics tabs, manages visibility & order."""
    print(f"[{label}] Syncing tab names, visibility, and layout hierarchy...")
    metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = metadata.get('sheets', [])
    existing_gids = {s['properties']['sheetId']: s['properties'] for s in sheets}
    
    # Deterministically set GIDs based on Private vs Work profiles
    if label == "Work":
        index_gid = 384789276
        analytics_gid = 1887106305
    else:
        index_gid = 1111111111
        analytics_gid = 1460856664
        
    email_tracker_gid = 1212121212
    drive_tracker_gid = 1717171717
            
    # Update mapping dynamically
    RENAME_MAPPING[index_gid] = "00 Index"
    RENAME_MAPPING[email_tracker_gid] = "10 Email Tracker"
    RENAME_MAPPING[drive_tracker_gid] = "10 Drive Tracker"
    
    # Hide list
    global HIDDEN_GIDS, ORDERED_GIDS
    # Make sure we don't hide tracker, pivots, or index
    HIDDEN_GIDS = {g for g in HIDDEN_GIDS if g not in [index_gid, email_tracker_gid, drive_tracker_gid, 1414141414]}
    
    # Re-build ORDERED_GIDS
    ORDERED_GIDS = [
        index_gid,
        email_tracker_gid,
        drive_tracker_gid,
        1414141414, # Tasks Pivot
        1679876125, # Email Rules
        2131515996, # Email Triage Log
        1580572397, # Google Tasks Log
        809034738,  # Drive Files Log
        967747913   # Notes Log
    ]
    
    requests = []
    
    # 1. Delete unused tabs (Rules, Dashboard, old Analytics, and deleted Email/Files Pivots)
    delete_gids = [DELETE_GID, 1486622037, analytics_gid, 1313131313, 1515151515, 1616161616]
    for d_gid in delete_gids:
        if d_gid in existing_gids:
            print(f"[{label}] Deleting unused tab (GID {d_gid})...")
            requests.append({"deleteSheet": {"sheetId": d_gid}})
            existing_gids.pop(d_gid, None)
        
    # Delete duplicate/accidental sheets if they exist
    if label == "Work":
        if 1111111111 in existing_gids:
            print(f"[{label}] Deleting duplicate index sheet GID 1111111111...")
            requests.append({"deleteSheet": {"sheetId": 1111111111}})
            existing_gids.pop(1111111111, None)
        if 1460856664 in existing_gids:
            print(f"[{label}] Deleting duplicate analytics sheet GID 1460856664...")
            requests.append({"deleteSheet": {"sheetId": 1460856664}})
            existing_gids.pop(1460856664, None)
    
    # 3. Add missing required GIDs (Index, Clerk Tracker, pivots, rules if missing)
    required_gids = [
        index_gid, email_tracker_gid, drive_tracker_gid,
        1414141414, # Pivot sheets
        938516466, 1297520241
    ]
    for gid in required_gids:
        if gid not in existing_gids:
            title = RENAME_MAPPING[gid]
            print(f"[{label}] Creating missing tab '{title}' (GID {gid})...")
            requests.append({
                "addSheet": {
                    "properties": {
                        "title": title,
                        "sheetId": gid
                    }
                }
            })
            # Make sure we register it locally for subsequent logic
            existing_gids[gid] = {"sheetId": gid, "title": title}

    if requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
        # Refetch metadata to reflect structural updates
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = metadata.get('sheets', [])
        existing_gids = {s['properties']['sheetId']: s['properties'] for s in sheets}
        requests = []

    # 4. Rename existing tabs and align visibility/order
    sheet_order = list(ORDERED_GIDS)
    if label == "Work" and 275991319 in existing_gids:
        # Keep Work Tasks Log in ordered list for Work profile
        sheet_order.append(275991319)

    # Append all other GIDs that exist but are not in the main order list
    remaining_gids = [g for g in existing_gids if g not in sheet_order]
    remaining_gids.sort(key=lambda g: existing_gids[g].get('index', 0))
    sheet_order.extend(remaining_gids)

    for gid, props in existing_gids.items():
        title = props.get('title')
        hidden = props.get('hidden', False)
        
        # Determine target name
        target_name = RENAME_MAPPING.get(gid)
        if not target_name:
            print(f"[{label}] Warning: Unknown tab GID {gid} ('{title}'). Skipping rename.")
            continue
            
        # Determine target visibility
        should_hide = gid in HIDDEN_GIDS
        
        # Determine target index/position
        target_index = sheet_order.index(gid)
        
        # Build property updates
        prop_updates = {"sheetId": gid}
        fields = []
        
        if title != target_name:
            print(f"[{label}] Renaming '{title}' -> '{target_name}'...")
            prop_updates["title"] = target_name
            fields.append("title")
            
        if hidden != should_hide:
            print(f"[{label}] Setting visibility for '{target_name}': Hidden={should_hide}")
            prop_updates["hidden"] = should_hide
            fields.append("hidden")
            
        if props.get('index') != target_index:
            prop_updates["index"] = target_index
            fields.append("index")
            
        if fields:
            requests.append({
                "updateSheetProperties": {
                    "properties": prop_updates,
                    "fields": ",".join(fields)
                }
            })
            
    if requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
        print(f"[{label}] Tab names, visibility, and hierarchy sync complete.")
    else:
        print(f"[{label}] Tabs already aligned.")

def populate_index_tab(service, spreadsheet_id, label):
    """Writes the Table of Contents with hyperlinks to the Index tab."""
    print(f"[{label}] Populating Index tab (00 Index)...")
    
    # Find current GIDs for this spreadsheet dynamically
    index_gid = 1111111111
    if label == "Work":
        index_gid = 384789276

    # Tuples of (GID/URL, Tab Name, Purpose, Type, Visibility)
    index_entries = [
        (index_gid, "00 Index", "Interactive Table of Contents & system documentation", "0 Info", "Visible"),
        (1212121212, "10 Email Tracker", "Search & audit center for verifying Clerk email triage actions", "1 Output", "Visible"),
        (1717171717, "10 Drive Tracker", "Search & audit center for verifying Clerk file routing actions", "1 Output", "Visible"),
        ("https://script.google.com/macros/s/AKfycbxyenW1RX_Nm6AL_Lygt3unS_NCb2kOvGamk15_xPxsgPaWuVUWr7PRg8Cba0Wkl8mLoQ/exec", "🚀 WebApp Dashboard", "Interactive central interface for The System (emails, files, tasks, calendar)", "1 Output", "External"),
        (1414141414, "10 Tasks Overview", "Interactive Pivot Table summarizing task categories and statuses", "1 Output", "Visible"),
        (1679876125, "2 Input - Email Rules", "Deterministic email routing rules (1-row freeze)", "2 Input", "Visible"),
        (2131515996, "5 Import - Email Triage Log", "Processing log of processed email threads (1-row freeze)", "5 Import", "Visible"),
        (1580572397, "5 Import - Google Tasks Log", "Sync log of user tasks (1-row freeze)", "5 Import", "Visible"),
        (1580572400, "5 Import - Completed Tasks Log", "Sync log of completed/deleted tasks (1-row freeze)", "5 Import", "Visible"),
        (809034738, "5 Import - Drive Files Log", "Sync log of routed files (1-row freeze)", "5 Import", "Visible"),
        (967747913, "5 Import - Notes Log", "Ingestion log of processed Google Docs", "5 Import", "Visible"),
        (938516466, "2 Input - File Naming Rules", "Drive filename matching rules", "2 Input", "Hidden"),
        (1297520241, "2 Input - File Folder Rules", "Drive folder ID matching rules", "2 Input", "Hidden"),
        (1799689202, "3 Config - Email Aliases", "Whitelist of user email addresses to ignore", "3 Config", "Hidden"),
        (1799689203, "3 Config - Email Rules Receiver", "Email rules receiver GID mapping configuration", "3 Config", "Hidden"),
        (1704335578, "5 Import - Gemini Models", "Reference table of available Gemini AI models", "5 Import", "Hidden"),
        (1007497112, "5 Import - Gmail Labels", "Reference table of current user Gmail labels", "5 Import", "Hidden"),
        (1287896098, "3 Config - Workspace Taxonomy", "Full taxonomy reference list", "3 Config", "Hidden"),
        (536537641, "5 Import - Drive Directory Tree", "Google Drive folder tree hierarchy", "5 Import", "Hidden"),
        (1835375017, "5 Import - Reset Actions Log", "Log of [DONE] folder prefix reset mutators", "5 Import", "Hidden"),
        (1657749758, "5 Import - Session Stats Log", "Performance session metrics from runs", "5 Import", "Hidden"),
        (67786861, "5 Import - Retro Emails Log", "Historical emails log", "5 Import", "Hidden"),
        (1325920151, "5 Import - Retro Files Log", "Historical files log", "5 Import", "Hidden")
    ]
    
    if label == "Work":
        index_entries.append((275991319, "5 Import - Work Tasks Log", "Work Tasks log overview", "5 Import", "Visible"))
        
    # Sort alphabetically by tab name
    index_entries.sort(key=lambda x: x[1])
    
    # Build sheets index data with full URL hyperlinks
    rows_data = []
    
    # Row 1: Title block
    rows_data.append({
        "values": [
            {
                "userEnteredValue": {"stringValue": "Index"},
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0},
                    "textFormat": {
                        "fontSize": 12, 
                        "bold": True, 
                        "foregroundColor": {"red": 30/255.0, "green": 41/255.0, "blue": 59/255.0}, # Slate 800
                        "fontFamily": "Arial"
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE"
                }
            },
            {}, {}, {}
        ]
    })
    
    # Row 2: Headers
    headers = ["Tab Name", "Purpose & System Role", "Type", "Hidden Status"]
    header_values = []
    for h in headers:
        header_values.append({
            "userEnteredValue": {"stringValue": h},
            "userEnteredFormat": {
                "backgroundColor": {"red": 28/255.0, "green": 69/255.0, "blue": 135/255.0}, # #1c4587
                "textFormat": {
                    "foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, # White
                    "bold": True,
                    "fontSize": 10,
                    "fontFamily": "Garamond"
                },
                "horizontalAlignment": "CENTER" if h in ["Type", "Hidden Status"] else "LEFT",
                "verticalAlignment": "MIDDLE"
            }
        })
    rows_data.append({"values": header_values})
    
    # Row 3 onwards: Data rows
    for target, title, purpose, t_type, visibility in index_entries:
        uri = target if isinstance(target, str) else f"#gid={target}"
        
        col_a = {
            "userEnteredValue": {"stringValue": title},
            "userEnteredFormat": {
                "textFormat": {
                    "foregroundColor": {"red": 0.0, "green": 0.0, "blue": 1.0}, # #0000ff
                    "bold": True,
                    "fontFamily": "Garamond",
                    "fontSize": 10,
                    "underline": True,
                    "link": {"uri": uri}
                },
                "verticalAlignment": "MIDDLE",
                "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}
            }
        }
        col_b = {
            "userEnteredValue": {"stringValue": purpose},
            "userEnteredFormat": {
                "textFormat": {"fontFamily": "Garamond", "fontSize": 10},
                "verticalAlignment": "MIDDLE",
                "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}
            }
        }
        col_c = {
            "userEnteredValue": {"stringValue": t_type},
            "userEnteredFormat": {
                "textFormat": {"fontFamily": "Garamond", "fontSize": 10},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
                "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}
            }
        }
        col_d = {
            "userEnteredValue": {"stringValue": visibility},
            "userEnteredFormat": {
                "textFormat": {"fontFamily": "Garamond", "fontSize": 10},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
                "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}
            }
        }
        rows_data.append({"values": [col_a, col_b, col_c, col_d]})
        
    # Clear index tab first
    service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range="'00 Index'!A1:Z100").execute()
    
    # Write values and formats via updateCells request
    requests = [{
        "updateCells": {
            "rows": rows_data,
            "fields": "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            "start": {
                "sheetId": index_gid,
                "rowIndex": 0,
                "columnIndex": 0
            }
        }
    }]
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()

def populate_trackers(service, spreadsheet_id, label):
    """Creates the separate Email Tracker and Drive Tracker search/verification pages with dynamic search formulas."""
    print(f"[{label}] Populating Email Tracker (10 Email Tracker)...")
    
    email_grid = [["" for _ in range(8)] for _ in range(40)]
    email_grid[0][0] = "EMAIL AUDITOR & SEARCH TRACKER"
    email_grid[2][0] = "Search Emails:"
    email_grid[2][2] = "" # User types email search term here (cell C3)

    # Row 5 headers (index 4)
    email_grid[4][0] = "Timestamp"
    email_grid[4][1] = "Subject"
    email_grid[4][2] = "Sender Name"
    email_grid[4][3] = "Sender Email"
    email_grid[4][4] = "Final Labels"
    email_grid[4][5] = "AI Summary"
    email_grid[4][6] = "Action Items"
    email_grid[4][7] = "Task ID"

    # Row 6 formula (index 5)
    email_grid[5][0] = (
        "=IFERROR("
        "LET("
        "raw, FILTER('5 Import - Email Triage Log'!A2:O, '5 Import - Email Triage Log'!A2:A <> \"\"), "
        "search_term, LOWER(C3), "
        "filtered, IF(search_term = \"\", FILTER(raw, CHOOSECOLS(raw, 1) >= TODAY() - 14), FILTER(raw, ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 4)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 12)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 13)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 14)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 15)))))), "
        "sorted_data, SORT(filtered, 1, FALSE), "
        "limited, ARRAY_CONSTRAIN(sorted_data, 200, 15), "
        "ts, CHOOSECOLS(limited, 1), "
        "subj, CHOOSECOLS(limited, 4), "
        "link, CHOOSECOLS(limited, 9), "
        "send, CHOOSECOLS(limited, 12), "
        "lbls, CHOOSECOLS(limited, 8), "
        "summ, CHOOSECOLS(limited, 13), "
        "actions, CHOOSECOLS(limited, 14), "
        "tasks, CHOOSECOLS(limited, 15), "
        "send_name, MAP(send, LAMBDA(s, PROPER(SUBSTITUTE(IF(REGEXMATCH(s, \"<\"), TRIM(REGEXREPLACE(s, \"\\s*<[^>]+>\", \"\")), s), CHAR(34), \"\")))), "
        "send_email, MAP(send, LAMBDA(s, IF(REGEXMATCH(s, \"<\"), REGEXEXTRACT(s, \"<([^>]+)>\"), s))), "
        "hyperlinks, ARRAYFORMULA(HYPERLINK(link, subj)), "
        "{ts, hyperlinks, send_name, send_email, lbls, summ, actions, tasks}"
        "), \"No matches found\")"
    )

    service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range="'10 Email Tracker'!A1:Z60").execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'10 Email Tracker'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": email_grid}
    ).execute()

    print(f"[{label}] Populating Drive Tracker (10 Drive Tracker)...")
    drive_grid = [["" for _ in range(6)] for _ in range(40)]
    drive_grid[0][0] = "DRIVE FILES AUDITOR & SEARCH TRACKER"
    drive_grid[2][0] = "Search Files:"
    drive_grid[2][2] = "" # User types file search term here (cell C3)

    # Row 5 headers (index 4)
    drive_grid[4][0] = "Original Name"
    drive_grid[4][1] = "Final Name"
    drive_grid[4][2] = "Target Folder Path"
    drive_grid[4][3] = "AI Summary"
    drive_grid[4][4] = "Mapped Task"
    drive_grid[4][5] = "Tasks Extracted"

    # Row 6 formula (index 5)
    drive_grid[5][0] = (
        "=IFERROR("
        "LET("
        "raw, FILTER({'5 Import - Drive Files Log'!C2:C, '5 Import - Drive Files Log'!E2:E, '5 Import - Drive Files Log'!O2:O, '5 Import - Drive Files Log'!B2:B, '5 Import - Drive Files Log'!H2:H, '5 Import - Drive Files Log'!T2:T, '5 Import - Drive Files Log'!U2:U, ROW('5 Import - Drive Files Log'!C2:C), '5 Import - Drive Files Log'!A2:A}, '5 Import - Drive Files Log'!C2:C <> \"\"), "
        "search_term, LOWER(C3), "
        "filtered, IF(search_term = \"\", FILTER(raw, CHOOSECOLS(raw, 9) >= TODAY() - 14), FILTER(raw, ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 1)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 2)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 3)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 5)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 6)))) + ISNUMBER(SEARCH(search_term, LOWER(CHOOSECOLS(raw, 7)))))), "
        "sorted_data, SORT(filtered, 8, FALSE), "
        "limited, ARRAY_CONSTRAIN(sorted_data, 200, 9), "
        "orig, CHOOSECOLS(limited, 1), "
        "final, CHOOSECOLS(limited, 2), "
        "path, CHOOSECOLS(limited, 3), "
        "url, CHOOSECOLS(limited, 4), "
        "summ, CHOOSECOLS(limited, 5), "
        "mapped, CHOOSECOLS(limited, 6), "
        "extracted, CHOOSECOLS(limited, 7), "
        "hyperlinks, ARRAYFORMULA(HYPERLINK(url, final)), "
        "{orig, hyperlinks, path, summ, mapped, extracted}"
        "), \"No matches found\")"
    )

    service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range="'10 Drive Tracker'!A1:Z60").execute()
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'10 Drive Tracker'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": drive_grid}
    ).execute()

def populate_pivot_tables(service, spreadsheet_id, label):
    """Sets up native, interactive Pivot Tables on the remaining pivot tabs (Tasks and Notes)."""
    if label == "Private":
        print(f"[{label}] Skipping pivot tables generation for Private spreadsheet GID 1414141414 to preserve user layout.")
        return
        
    print(f"[{label}] Creating interactive Pivot Tables...")
    
    # Clean the tabs first to prevent formula overlap errors
    for gid in [1414141414]:
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"'{RENAME_MAPPING[gid]}'!A1:Z100"
        ).execute()
        
    requests = []
    
    # 1. Tasks Pivot (GID 1414141414) - Dual Pivot Tables
    # Pivot Table 1 (left)
    requests.append({
        "updateCells": {
            "rows": [{
                "values": [{
                    "pivotTable": {
                        "source": {
                            "sheetId": 1580572397,
                            "startRowIndex": 0,
                            "startColumnIndex": 0,
                            "endColumnIndex": 17
                        },
                        "rows": [
                            {"sourceColumnOffset": 2, "sortOrder": "ASCENDING", "repeatHeadings": True}, # Category
                            {"sourceColumnOffset": 4, "sortOrder": "ASCENDING"} # Task Title
                        ],
                        "values": [{
                            "summarizeFunction": "MIN",
                            "sourceColumnOffset": 7,
                            "name": "Due Date"
                        }],
                        "filterSpecs": [
                            {
                                "columnOffsetIndex": 6,
                                "filterCriteria": {
                                    "visibleValues": ["needsAction"]
                                }
                            },
                            {
                                "columnOffsetIndex": 1,
                                "filterCriteria": {
                                    "visibleValues": ["ToDo"]
                                }
                            }
                        ],
                        "valueLayout": "HORIZONTAL"
                    }
                }]
            }],
            "fields": "pivotTable",
            "start": {
                "sheetId": 1414141414,
                "rowIndex": 0,
                "columnIndex": 0
            }
        }
    })
    
    # Pivot Table 2 (right)
    requests.append({
        "updateCells": {
            "rows": [{
                "values": [{
                    "pivotTable": {
                        "source": {
                            "sheetId": 1580572397,
                            "startRowIndex": 0,
                            "startColumnIndex": 0,
                            "endColumnIndex": 17
                        },
                        "rows": [
                            {"sourceColumnOffset": 7, "showTotals": True, "sortOrder": "ASCENDING"}, # Due Date
                            {"sourceColumnOffset": 4, "sortOrder": "ASCENDING"}, # Task Title
                            {"sourceColumnOffset": 2, "sortOrder": "ASCENDING", "repeatHeadings": True}, # Category
                            {"sourceColumnOffset": 5, "sortOrder": "ASCENDING"} # Notes
                        ],
                        "values": [{
                            "name": "Days to Due",
                            "formula": "=IF(OR('Due Date'=\"\", 'Due Date'=DATE(2099,12,31)), \"\", 'Due Date'-TODAY())",
                            "summarizeFunction": "CUSTOM"
                        }],
                        "filterSpecs": [
                            {
                                "columnOffsetIndex": 6,
                                "filterCriteria": {
                                    "visibleValues": ["needsAction"]
                                }
                            },
                            {
                                "columnOffsetIndex": 1,
                                "filterCriteria": {
                                    "visibleValues": ["ToDo"]
                                }
                            }
                        ],
                        "valueLayout": "HORIZONTAL"
                    }
                }]
            }],
            "fields": "pivotTable",
            "start": {
                "sheetId": 1414141414,
                "rowIndex": 0,
                "columnIndex": 4
            }
        }
    })
    
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
    print(f"[{label}] Pivot tables populated successfully.")

def clean_rules_formatting(service, spreadsheet_id, label):
    """Removes empty row 2 in the Triage Rules tab and sets freeze rows count to 1."""
    print(f"[{label}] Cleaning rules formatting (2 Input - Email Rules)...")
    res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range="'2 Input - Email Rules'!A1:G").execute()
    rows = res.get('values', [])
    if not rows:
        return
        
    cleaned_rows = [rows[0]] # Keep headers
    for r in rows[1:]:
        if len(r) > 0 and any(cell.strip() for cell in r[:3]):
            cleaned_rows.append(r)
            
    # Clear the entire sheet
    service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range="'2 Input - Email Rules'!A1:G1000").execute()
    
    # Write back clean rows
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'2 Input - Email Rules'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": cleaned_rows}
    ).execute()

def format_index_sheet(service, spreadsheet_id, label, sheet_id):
    """Applies custom layout, fonts, types, and colors to the Index sheet."""
    print(f"[{label}] Custom formatting for Index sheet (00 Index)...")
    
    # 1. Fetch exact rows in the Index sheet dynamically
    title = RENAME_MAPPING[sheet_id]
    try:
        res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"'{title}'!A1:A100").execute()
        rows = res.get('values', [])
        row_count = len(rows)
    except Exception:
        row_count = 27 # fallback
        
    requests = []
    
    # 2. Set grid properties (hide default gridlines)
    requests.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {
                    "hideGridlines": True
                }
            },
            "fields": "gridProperties.hideGridlines"
        }
    })
    
    # 3. Merge title cells A1:D1
    requests.append({
        "mergeCells": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": 1,
                "startColumnIndex": 0,
                "endColumnIndex": 4
            },
            "mergeType": "MERGE_ALL"
        }
    })
    
    # 4. Set row heights
    # Row 1 (Title banner): 45px
    # Row 2 (Header row): 32px
    requests.append({"updateDimensionProperties": {"range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 45}, "fields": "pixelSize"}})
    requests.append({"updateDimensionProperties": {"range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": 1, "endIndex": 2}, "properties": {"pixelSize": 32}, "fields": "pixelSize"}})
    
    # Data rows: 25px each
    requests.append({
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": 2,
                "endIndex": row_count
            },
            "properties": {
                "pixelSize": 25
            },
            "fields": "pixelSize"
        }
    })
    
    # 5. Set column widths
    # Col A: 250px, Col B: 450px, Col C: 120px, Col D: 120px
    col_widths = [250, 450, 120, 120]
    for idx, w in enumerate(col_widths):
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": idx,
                    "endIndex": idx + 1
                },
                "properties": {
                    "pixelSize": w
                },
                "fields": "pixelSize"
            }
        })
        
    # 6. Format title block (A1:D1) - background White, center-aligned bold Slate 800, Arial
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, # White
                    "textFormat": {
                        "fontSize": 12, 
                        "bold": True, 
                        "foregroundColor": {"red": 30/255.0, "green": 41/255.0, "blue": 59/255.0}, # Slate 800
                        "fontFamily": "Arial"
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # 7. Format header row (A2:D2) - #1c4587 background, white bold text, Garamond
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 28/255.0, "green": 69/255.0, "blue": 135/255.0}, # #1c4587
                    "textFormat": {
                        "foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, # White
                        "bold": True,
                        "fontSize": 10,
                        "fontFamily": "Garamond"
                    },
                    "horizontalAlignment": "LEFT",
                    "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # 8. Align headers for type and status columns (center aligned)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 2, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "horizontalAlignment": "CENTER"
                }
            },
            "fields": "userEnteredFormat.horizontalAlignment"
        }
    })
    
    # 9. Format data grid cells (middle alignment, Garamond 10)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 2, "endRowIndex": row_count, "startColumnIndex": 0, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0},
                    "verticalAlignment": "MIDDLE",
                    "textFormat": {
                        "fontFamily": "Garamond",
                        "fontSize": 10
                    }
                }
            },
            "fields": "userEnteredFormat(verticalAlignment,backgroundColor,textFormat(fontFamily,fontSize))"
        }
    })
    
    # 10. Format link column A (Bold, #0000ff link color)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 2, "endRowIndex": row_count, "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {
                "userEnteredFormat": {
                    "textFormat": {
                        "foregroundColor": {"red": 0.0, "green": 0.0, "blue": 1.0}, # #0000ff
                        "bold": True,
                        "fontFamily": "Garamond"
                    }
                }
            },
            "fields": "userEnteredFormat.textFormat(foregroundColor,bold,fontFamily)"
        }
    })
    
    # 11. Center-align Type and Hidden Status columns
    requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 2, "endRowIndex": row_count, "startColumnIndex": 2, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "horizontalAlignment": "CENTER"
                }
            },
            "fields": "userEnteredFormat.horizontalAlignment"
        }
    })
    
    # 12. Draw clean borders around the data table (row 2 to row_count)
    # Header bottom border (Slate 400)
    requests.append({
        "updateBorders": {
            "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": 4},
            "bottom": {"style": "SOLID_MEDIUM", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}}
        }
    })
    # Table grid border lines (Slate 200 inner, Slate 300 outer frame)
    requests.append({
        "updateBorders": {
            "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": row_count, "startColumnIndex": 0, "endColumnIndex": 4},
            "innerHorizontal": {"style": "SOLID", "color": {"red": 226/255.0, "green": 232/255.0, "blue": 240/255.0}},
            "innerVertical": {"style": "SOLID", "color": {"red": 226/255.0, "green": 232/255.0, "blue": 240/255.0}},
            "top": {"style": "SOLID", "color": {"red": 203/255.0, "green": 213/255.0, "blue": 225/255.0}},
            "bottom": {"style": "SOLID", "color": {"red": 203/255.0, "green": 213/255.0, "blue": 225/255.0}},
            "left": {"style": "SOLID", "color": {"red": 203/255.0, "green": 213/255.0, "blue": 225/255.0}},
            "right": {"style": "SOLID", "color": {"red": 203/255.0, "green": 213/255.0, "blue": 225/255.0}}
        }
    })
    
    # 13. Conditional formatting rules for Hidden Status column D
    requests.append({
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [{"sheetId": sheet_id, "startRowIndex": 2, "endRowIndex": row_count, "startColumnIndex": 3, "endColumnIndex": 4}],
                "booleanRule": {
                    "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "Visible"}]},
                    "format": {"textFormat": {"foregroundColor": {"red": 22/255.0, "green": 163/255.0, "blue": 74/255.0}, "bold": True}}
                }
            },
            "index": 0
        }
    })
    requests.append({
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [{"sheetId": sheet_id, "startRowIndex": 2, "endRowIndex": row_count, "startColumnIndex": 3, "endColumnIndex": 4}],
                "booleanRule": {
                    "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "Hidden"}]},
                    "format": {"textFormat": {"foregroundColor": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}, "italic": True}}
                }
            },
            "index": 0
        }
    })
    
    # 14. Fetch sheet metadata to know grid properties for trimming
    metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets(properties)").execute()
    sheet_props = [s['properties'] for s in metadata.get('sheets', []) if s['properties']['sheetId'] == sheet_id][0]
    grid_props = sheet_props.get('gridProperties', {})
    current_rows = grid_props.get('rowCount', 1000)
    current_cols = grid_props.get('columnCount', 26)
    
    rows_to_keep = row_count
    cols_to_keep = 4
    
    if current_rows > rows_to_keep:
        print(f"[{label}] Trimming Index rows: keeping {rows_to_keep} (was {current_rows})")
        requests.append({
            "deleteDimension": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": rows_to_keep,
                    "endIndex": current_rows
                }
            }
        })
    if current_cols > cols_to_keep:
        print(f"[{label}] Trimming Index columns: keeping {cols_to_keep} (was {current_cols})")
        requests.append({
            "deleteDimension": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": cols_to_keep,
                    "endIndex": current_cols
                }
            }
        })

    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()

def format_tracker_sheets(service, spreadsheet_id, label, email_gid, drive_gid):
    """Formats the separate Email Tracker and Drive Tracker sheets with headers, alignments, and widths."""
    print(f"[{label}] Custom formatting for Email Tracker and Drive Tracker sheets...")
    requests = []
    
    # 1. Format Email Tracker (Email GID)
    # Row heights
    requests.append({"updateDimensionProperties": {"range": {"sheetId": email_gid, "dimension": "ROWS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 45}, "fields": "pixelSize"}})
    requests.append({"updateDimensionProperties": {"range": {"sheetId": email_gid, "dimension": "ROWS", "startIndex": 2, "endIndex": 3}, "properties": {"pixelSize": 40}, "fields": "pixelSize"}})
    requests.append({"updateDimensionProperties": {"range": {"sheetId": email_gid, "dimension": "ROWS", "startIndex": 4, "endIndex": 5}, "properties": {"pixelSize": 30}, "fields": "pixelSize"}})
    
    # Title merge and format A1:H1 (White background, Slate 800 bold Garamond text)
    requests.append({
        "mergeCells": {
            "range": {"sheetId": email_gid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 8},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 8},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, # White
                    "textFormat": {
                        "fontSize": 14, 
                        "bold": True, 
                        "foregroundColor": {"red": 30/255.0, "green": 41/255.0, "blue": 59/255.0}, # Slate 800
                        "fontFamily": "Garamond"
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Search label A3:B3 format
    requests.append({
        "mergeCells": {
            "range": {"sheetId": email_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 0, "endColumnIndex": 2},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 0, "endColumnIndex": 2},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0},
                    "textFormat": {"bold": True, "fontSize": 10, "foregroundColor": {"red": 71/255.0, "green": 85/255.0, "blue": 105/255.0}, "fontFamily": "Garamond"},
                    "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Search box C3:D3 format
    requests.append({
        "mergeCells": {
            "range": {"sheetId": email_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 248/255.0, "green": 250/255.0, "blue": 252/255.0},
                    "verticalAlignment": "MIDDLE", "textFormat": {"bold": True}
                }
            },
            "fields": "userEnteredFormat(backgroundColor,verticalAlignment,textFormat.bold)"
        }
    })
    requests.append({
        "updateBorders": {
            "range": {"sheetId": email_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "top": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "bottom": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "left": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "right": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}}
        }
    })
    
    # Headers format (A5:H5 - #1c4587)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 8},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 28/255.0, "green": 69/255.0, "blue": 135/255.0},
                    "textFormat": {"foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, "bold": True, "fontFamily": "Garamond"},
                    "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Data row formatting (Row 6 onwards - Garamond 9, middle alignment)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 8},
            "cell": {
                "userEnteredFormat": {
                    "verticalAlignment": "MIDDLE",
                    "textFormat": {"fontFamily": "Garamond", "fontSize": 9}
                }
            },
            "fields": "userEnteredFormat(verticalAlignment,textFormat.fontFamily,textFormat.fontSize)"
        }
    })
    
    # Wrapping for Subject (index 1), Labels (index 4), Summary (index 5), Action Items (index 6), and Task ID (index 7)
    for col_idx in [1, 4, 5, 6, 7]:
        requests.append({
            "repeatCell": {
                "range": {"sheetId": email_gid, "startRowIndex": 5, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1},
                "cell": {"userEnteredFormat": {"wrapStrategy": "WRAP"}},
                "fields": "userEnteredFormat.wrapStrategy"
            }
        })
        
    # Hyperlink blue color and underline for Col B (Subject)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 5, "startColumnIndex": 1, "endColumnIndex": 2},
            "cell": {
                "userEnteredFormat": {
                    "textFormat": {"foregroundColor": {"red": 0.0, "green": 0.0, "blue": 1.0}, "bold": True, "underline": True}
                }
            },
            "fields": "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.underline"
        }
    })
    
    # Format Email Timestamp column A
    requests.append({
        "repeatCell": {
            "range": {"sheetId": email_gid, "startRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {
                "userEnteredFormat": {
                    "numberFormat": {
                        "type": "DATE_TIME",
                        "pattern": "yyyy-mm-dd hh:mm:ss"
                    }
                }
            },
            "fields": "userEnteredFormat.numberFormat"
        }
    })
    
    # Column widths for Email Tracker
    email_widths = [130, 300, 150, 220, 200, 300, 300, 150]
    for idx, w in enumerate(email_widths):
        requests.append({"updateDimensionProperties": {"range": {"sheetId": email_gid, "dimension": "COLUMNS", "startIndex": idx, "endIndex": idx + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}})

    # 2. Format Drive Tracker (Drive GID)
    # Row heights
    requests.append({"updateDimensionProperties": {"range": {"sheetId": drive_gid, "dimension": "ROWS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 45}, "fields": "pixelSize"}})
    requests.append({"updateDimensionProperties": {"range": {"sheetId": drive_gid, "dimension": "ROWS", "startIndex": 2, "endIndex": 3}, "properties": {"pixelSize": 40}, "fields": "pixelSize"}})
    requests.append({"updateDimensionProperties": {"range": {"sheetId": drive_gid, "dimension": "ROWS", "startIndex": 4, "endIndex": 5}, "properties": {"pixelSize": 30}, "fields": "pixelSize"}})
    
    # Title merge and format A1:D1 (White background, Slate 800 bold Garamond text)
    requests.append({
        "mergeCells": {
            "range": {"sheetId": drive_gid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 6},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 6},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, # White
                    "textFormat": {
                        "fontSize": 14, 
                        "bold": True, 
                        "foregroundColor": {"red": 30/255.0, "green": 41/255.0, "blue": 59/255.0}, # Slate 800
                        "fontFamily": "Garamond"
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Search label A3:B3 format
    requests.append({
        "mergeCells": {
            "range": {"sheetId": drive_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 0, "endColumnIndex": 2},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 0, "endColumnIndex": 2},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0},
                    "textFormat": {"bold": True, "fontSize": 10, "foregroundColor": {"red": 71/255.0, "green": 85/255.0, "blue": 105/255.0}, "fontFamily": "Garamond"},
                    "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Search box C3:D3 format
    requests.append({
        "mergeCells": {
            "range": {"sheetId": drive_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "mergeType": "MERGE_ALL"
        }
    })
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 248/255.0, "green": 250/255.0, "blue": 252/255.0},
                    "verticalAlignment": "MIDDLE", "textFormat": {"bold": True}
                }
            },
            "fields": "userEnteredFormat(backgroundColor,verticalAlignment,textFormat.bold)"
        }
    })
    requests.append({
        "updateBorders": {
            "range": {"sheetId": drive_gid, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 4},
            "top": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "bottom": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "left": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}},
            "right": {"style": "SOLID", "color": {"red": 148/255.0, "green": 163/255.0, "blue": 184/255.0}}
        }
    })
    
    # Headers format (A5:F5 - #1c4587)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 6},
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 28/255.0, "green": 69/255.0, "blue": 135/255.0},
                    "textFormat": {"foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0}, "bold": True, "fontFamily": "Garamond"},
                    "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE"
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        }
    })
    
    # Data row formatting (Row 6 onwards - Garamond 9, middle alignment)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 6},
            "cell": {
                "userEnteredFormat": {
                    "verticalAlignment": "MIDDLE",
                    "textFormat": {"fontFamily": "Garamond", "fontSize": 9}
                }
            },
            "fields": "userEnteredFormat(verticalAlignment,textFormat.fontFamily,textFormat.fontSize)"
        }
    })
    
    # Wrapping for all columns of Drive Tracker
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 6},
            "cell": {"userEnteredFormat": {"wrapStrategy": "WRAP"}},
            "fields": "userEnteredFormat.wrapStrategy"
        }
    })
        
    # Hyperlink blue color and underline for Col B (Final Name)
    requests.append({
        "repeatCell": {
            "range": {"sheetId": drive_gid, "startRowIndex": 5, "startColumnIndex": 1, "endColumnIndex": 2},
            "cell": {
                "userEnteredFormat": {
                    "textFormat": {"foregroundColor": {"red": 0.0, "green": 0.0, "blue": 1.0}, "bold": True, "underline": True}
                }
            },
            "fields": "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.underline"
        }
    })
    
    # Column widths for Drive Tracker
    drive_widths = [250, 300, 250, 300, 150, 300]
    for idx, w in enumerate(drive_widths):
        requests.append({"updateDimensionProperties": {"range": {"sheetId": drive_gid, "dimension": "COLUMNS", "startIndex": idx, "endIndex": idx + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}})

    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()

def get_pivot_date_rules(sheet_id):
    """Generates nuanced, desaturated conditional formatting rules for pivot table date columns (Column C and E)."""
    # Overdue (red): < TODAY()
    red_bg = {"red": 244/255.0, "green": 204/255.0, "blue": 204/255.0} # #FADBD8 / #F4CCCC
    red_fg = {"red": 153/255.0, "green": 0/255.0, "blue": 0/255.0}     # Dark red
    
    # Due Today (orange): = TODAY()
    orange_bg = {"red": 253/255.0, "green": 235/255.0, "blue": 208/255.0} # #FDEBD0
    orange_fg = {"red": 126/255.0, "green": 81/255.0, "blue": 9/255.0}    # Dark orange
    
    # Due Tomorrow (yellow): = TODAY() + 1
    yellow_bg = {"red": 252/255.0, "green": 243/255.0, "blue": 207/255.0} # #FCF3CF
    yellow_fg = {"red": 125/255.0, "green": 102/255.0, "blue": 8/255.0}    # Dark yellow
    
    # Due Soon (green, 2-7 days): > TODAY() + 1 and <= TODAY() + 7
    green_bg = {"red": 213/255.0, "green": 245/255.0, "blue": 227/255.0} # #D5F5E3
    green_fg = {"red": 30/255.0, "green": 132/255.0, "blue": 73/255.0}   # Dark green
    
    # Due Later (blue, 8-14 days): > TODAY() + 7 and <= TODAY() + 14
    blue_bg = {"red": 235/255.0, "green": 245/255.0, "blue": 251/255.0} # #EBF5FB
    blue_fg = {"red": 40/255.0, "green": 116/255.0, "blue": 166/255.0}  # Dark blue

    white_color = {"red": 1.0, "green": 1.0, "blue": 1.0}

    rules = []
    
    # We apply these rules separately for Column C (index 2) and Column E (index 4)
    # to avoid formula evaluation misalignment in Google Sheets.
    columns = [
        {"col_idx": 2, "col_letter": "C"},
        {"col_idx": 4, "col_letter": "E"}
    ]
    
    for col in columns:
        col_idx = col["col_idx"]
        col_letter = col["col_letter"]
        
        # 1. Overdue (< TODAY())
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=AND({col_letter}2<>\"\", {col_letter}2<TODAY(), {col_letter}2<>DATE(2099, 12, 31), {col_letter}2<>\"2099-12-31\")"}]
                        },
                        "format": {"backgroundColor": red_bg, "textFormat": {"foregroundColor": red_fg, "bold": True}}
                    }
                }
            }
        })
        
        # 2. Due Today (= TODAY())
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=AND({col_letter}2<>\"\", {col_letter}2=TODAY())"}]
                        },
                        "format": {"backgroundColor": orange_bg, "textFormat": {"foregroundColor": orange_fg, "bold": True}}
                    }
                }
            }
        })
        
        # 3. Due Tomorrow (= TODAY() + 1)
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=AND({col_letter}2<>\"\", {col_letter}2=TODAY()+1)"}]
                        },
                        "format": {"backgroundColor": yellow_bg, "textFormat": {"foregroundColor": yellow_fg, "bold": True}}
                    }
                }
            }
        })
        
        # 4. Due Soon (2-7 days)
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=AND({col_letter}2<>\"\", {col_letter}2>TODAY()+1, {col_letter}2<=TODAY()+7)"}]
                        },
                        "format": {"backgroundColor": green_bg, "textFormat": {"foregroundColor": green_fg, "bold": True}}
                    }
                }
            }
        })
        
        # 5. Due Later (8-14 days)
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=AND({col_letter}2<>\"\", {col_letter}2>TODAY()+7, {col_letter}2<=TODAY()+14)"}]
                        },
                        "format": {"backgroundColor": blue_bg, "textFormat": {"foregroundColor": blue_fg, "bold": True}}
                    }
                }
            }
        })
        
        # 6. Backlog / No Deadline (white text on white background)
        rules.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1}],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": f"=OR({col_letter}2=\"2099-12-31\", {col_letter}2=DATE(2099, 12, 31))"}]
                        },
                        "format": {"backgroundColor": white_color, "textFormat": {"foregroundColor": white_color}}
                    }
                }
            }
        })
        
    return rules

def get_status_rules(sheet_id, col_idx, start_row):
    """Generates soft, desaturated conditional formatting rules for log status columns."""
    green_bg = {"red": 226/255.0, "green": 240/255.0, "blue": 217/255.0} # Soft green `#E2F0D9`
    green_fg = {"red": 56/255.0, "green": 87/255.0, "blue": 35/255.0}   # Dark green `#385723`
    
    amber_bg = {"red": 255/255.0, "green": 242/255.0, "blue": 204/255.0} # Soft yellow `#FFF2CC`
    amber_fg = {"red": 127/255.0, "green": 96/255.0, "blue": 0/255.0}    # Dark amber `#7F6000`
    
    gray_bg = {"red": 242/255.0, "green": 242/255.0, "blue": 242/255.0}  # Soft gray `#F2F2F2`
    gray_fg = {"red": 89/255.0, "green": 89/255.0, "blue": 89/255.0}     # Dark gray `#595959`
    
    statuses = [
        (["completed", "READ", "Success"], green_bg, green_fg),
        (["needsAction", "UNREAD", "Pending"], amber_bg, amber_fg),
        (["ARCHIVED", "TEMP_DELETE"], gray_bg, gray_fg)
    ]
    
    rules = []
    for words, bg, fg in statuses:
        for word in words:
            rules.append({
                "addConditionalFormatRule": {
                    "rule": {
                        "ranges": [{
                            "sheetId": sheet_id,
                            "startRowIndex": start_row,
                            "startColumnIndex": col_idx,
                            "endColumnIndex": col_idx + 1
                        }],
                        "booleanRule": {
                            "condition": {
                                "type": "TEXT_CONTAINS",
                                "values": [{"userEnteredValue": word}]
                            },
                            "format": {
                                "backgroundColor": bg,
                                "textFormat": {
                                    "foregroundColor": fg,
                                    "bold": True
                                }
                            }
                        }
                    },
                    "index": 0
                }
            })
    return rules

def apply_premium_styling_and_sizing(service, spreadsheet_id, label):
    """Applies frozen headers, vertical middle-alignment, slate theme, zebra striping, and status colors."""
    print(f"[{label}] Fetching spreadsheet metadata to align layout styles...")
    
    # Fetch sheets and current conditional formats to clear them first
    metadata = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id, 
        fields="sheets(properties(sheetId,title,hidden),conditionalFormats)"
    ).execute()
    sheets = metadata.get('sheets', [])
    
    # 1. Clear existing conditional formats
    clear_requests = []
    for s in sheets:
        gid = s['properties']['sheetId']
        if label == "Private" and gid == 1414141414:
            continue
        rules = s.get('conditionalFormats', [])
        for idx in reversed(range(len(rules))):
            clear_requests.append({
                "deleteConditionalFormatRule": {
                    "sheetId": gid,
                    "index": idx
                }
            })
    if clear_requests:
        print(f"[{label}] Clearing old conditional formatting rules...")
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": clear_requests}).execute()
    
    # Build layout and formatting requests
    requests = []
    
    # Dark Blue Theme: `#1c4587` background, white bold text
    header_bg = {"red": 28/255.0, "green": 69/255.0, "blue": 135/255.0}
    header_fg = {"red": 1.0, "green": 1.0, "blue": 1.0}
    
    # Excluded sheets that have custom designs
    custom_sheets = [
        "00 Index", 
        "10 Email Tracker", 
        "10 Drive Tracker", 
        "1 Output - Email Pivot", 
        "10 Tasks Overview", 
        "1 Output - Files Pivot", 
        "1 Output - Notes Pivot"
    ]
    
    for s in sheets:
        props = s.get('properties', {})
        gid = props.get('sheetId')
        title = props.get('title')
        hidden = props.get('hidden', False)
        
        if label == "Private" and gid == 1414141414:
            continue
            
        if hidden:
            continue
            
        if title in ["1 Output - Email Pivot", "10 Tasks Overview", "1 Output - Files Pivot", "1 Output - Notes Pivot"]:
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": gid,
                        "startRowIndex": 0,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "fontFamily": "Garamond"
                            }
                        }
                    },
                    "fields": "userEnteredFormat.textFormat.fontFamily"
                }
            })
            

            
        # Determine frozen row count
        frozen_rows = 1
        if title in custom_sheets:
            frozen_rows = 0
            
        # Freeze and gridlines properties
        if title not in custom_sheets:
            requests.append({
                "updateSheetProperties": {
                    "properties": {
                        "sheetId": gid,
                        "gridProperties": {
                            "frozenRowCount": frozen_rows,
                            "hideGridlines": False
                        }
                    },
                    "fields": "gridProperties.frozenRowCount,gridProperties.hideGridlines"
                }
            })
            
            # 2. Header Style (Slate 50 background, Slate 700 bold text, centered, middle)
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": gid,
                        "startRowIndex": 0,
                        "endRowIndex": frozen_rows,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": header_bg,
                            "textFormat": {
                                "foregroundColor": header_fg,
                                "bold": True,
                                "fontFamily": "Garamond"
                            },
                            "horizontalAlignment": "CENTER",
                            "verticalAlignment": "MIDDLE"
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            })
            
            # Thin medium bottom border under headers
            requests.append({
                "updateBorders": {
                    "range": {
                        "sheetId": gid,
                        "startRowIndex": 0,
                        "endRowIndex": frozen_rows
                    },
                    "bottom": {
                        "style": "SOLID_MEDIUM",
                        "color": {"red": 203/255.0, "green": 213/255.0, "blue": 225/255.0} # Slate 300
                    }
                }
            })
            
            # 3. Middle alignment, text wrapping, and Garamond font for data cells
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": gid,
                        "startRowIndex": frozen_rows,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "verticalAlignment": "MIDDLE",
                            "wrapStrategy": "WRAP",
                            "textFormat": {
                                "fontFamily": "Garamond"
                            }
                        }
                    },
                    "fields": "userEnteredFormat(verticalAlignment,wrapStrategy,textFormat.fontFamily)"
                }
            })
            
            # 4. Alternating row background (zebra striping) for data rows
            requests.append({
                "addConditionalFormatRule": {
                    "rule": {
                        "ranges": [{
                            "sheetId": gid,
                            "startRowIndex": frozen_rows
                        }],
                        "booleanRule": {
                            "condition": {
                                "type": "CUSTOM_FORMULA",
                                "values": [{"userEnteredValue": "=ISEVEN(ROW())"}]
                            },
                            "format": {
                                "backgroundColor": {"red": 248/255.0, "green": 250/255.0, "blue": 252/255.0} # Muted Slate 50
                            }
                        }
                    },
                    "index": 0
                }
            })

    # Batch execute layout rules
    if requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()
        
    # Custom format specific sheets
    for s in sheets:
        gid = s['properties']['sheetId']
        title = s['properties']['title']
        if title == "00 Index":
            format_index_sheet(service, spreadsheet_id, label, gid)
        elif title == "10 Email Tracker":
            drive_gid = None
            for s_temp in sheets:
                if s_temp['properties']['title'] == "10 Drive Tracker":
                    drive_gid = s_temp['properties']['sheetId']
                    break
            if drive_gid:
                format_tracker_sheets(service, spreadsheet_id, label, gid, drive_gid)
            
    # 5. Apply Status Color Coding rules dynamically
    status_requests = []
    for s in sheets:
        props = s.get('properties', {})
        gid = props.get('sheetId')
        title = props.get('title')
        hidden = props.get('hidden', False)
        
        if hidden or title in custom_sheets:
            continue
            
        # Fetch the first row of headers to locate status columns dynamically
        try:
            res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"'{title}'!A1:Z2").execute()
            rows = res.get('values', [])
        except Exception:
            rows = []
            
        if not rows:
            continue
            
        header_row = rows[0]
        frozen_rows = 1
        
        for col_idx, header in enumerate(header_row):
            if str(header).strip() in ["Status", "Read State", "Inbox Status"]:
                print(f"[{label}] Adding soft status formats to '{title}' (Col: {header})...")
                rules = get_status_rules(gid, col_idx, frozen_rows)
                status_requests.extend(rules)
                
    # Add Tasks Pivot Date Conditional Formatting
    if label != "Private":
        print(f"[{label}] Adding soft deadline formats to '10 Tasks Overview' Column C...")
        status_requests.extend(get_pivot_date_rules(1414141414))
                
    if status_requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": status_requests}).execute()
    
    # 6. Custom Column Width Auto-Sizing Tab-by-Tab
    all_resize_requests = []
    for s in sheets:
        props = s.get('properties', {})
        gid = props.get('sheetId')
        title = props.get('title')
        hidden = props.get('hidden', False)
        
        if hidden or title in ["10 Email Tracker", "10 Drive Tracker", "00 Index"]:
            continue
            
        if label == "Private" and gid == 1414141414:
            continue
            
        print(f"[{label}] Sizing columns for visible tab: '{title}'...")
        
        try:
            res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=f"'{title}'!A1:Z100").execute()
            rows = res.get('values', [])
        except Exception:
            rows = []
            
        if not rows:
            continue
            
        col_count = len(rows[0])
        col_widths = {}
        
        # Scan columns to find maximum text lengths
        for col_idx in range(col_count):
            max_len = 0
            is_url_col = False
            
            for row in rows:
                if col_idx < len(row):
                    val = str(row[col_idx]).strip()
                    if val.startswith("http://") or val.startswith("https://") or "hyperlink" in val.lower():
                        is_url_col = True
                    if len(val) < 200:
                        max_len = max(max_len, len(val))
                        
            # URL columns get clipped/cutoff (100 width)
            if is_url_col:
                width = 100
            else:
                # Approximate character length to pixel width (approx 8 pixels per char)
                # Round to nearest factor of 50
                calculated = int(math.ceil((max_len * 8) / 50.0) * 50)
                width = max(100, min(350, calculated)) # Constrain between 100 and 350
                
            col_widths[col_idx] = width
            
        for col_idx, width in col_widths.items():
            all_resize_requests.append({
                "updateDimensionProperties": {
                    "range": {"sheetId": gid, "dimension": "COLUMNS", "startIndex": col_idx, "endIndex": col_idx + 1},
                    "properties": {"pixelSize": width},
                    "fields": "pixelSize"
                }
            })
            
            # URL Column text clipping and styling (#0000ff color, Garamond font)
            if width == 100:
                # Start clipping from row 2 (index 1) for data
                start_clip_row = 1
                all_resize_requests.append({
                    "repeatCell": {
                        "range": {"sheetId": gid, "startColumnIndex": col_idx, "endColumnIndex": col_idx + 1, "startRowIndex": start_clip_row},
                        "cell": {
                            "userEnteredFormat": {
                                "wrapStrategy": "CLIP",
                                "textFormat": {
                                    "foregroundColor": {"red": 0.0, "green": 0.0, "blue": 1.0},
                                    "fontFamily": "Garamond"
                                }
                            }
                        },
                        "fields": "userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.fontFamily"
                    }
                })
                
    if all_resize_requests:
        print(f"[{label}] Applying batched column resizes and styles...")
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": all_resize_requests}).execute()

def refactor_master_spreadsheet(service, spreadsheet_id, label):
    """Full refactor workflow for a spreadsheet."""
    print(f"\n==========================================")
    print(f"STARTING REFACTOR FOR: {label} ({spreadsheet_id})")
    print(f"==========================================")
    
    # 1. Sync names and visibility (also handles deletions/creations)
    sync_tab_names_and_visibility(service, spreadsheet_id, label)
    
    # 2. Populate text values/formulas
    populate_index_tab(service, spreadsheet_id, label)
    populate_trackers(service, spreadsheet_id, label)
    
    # 3. Build native interactive Pivot Tables
    populate_pivot_tables(service, spreadsheet_id, label)
    
    # 4. Clean up rules formatting
    clean_rules_formatting(service, spreadsheet_id, label)
    
    # 5. Premium desaturated layout formatting and styling
    apply_premium_styling_and_sizing(service, spreadsheet_id, label)
    
    print(f"\n[SUCCESS] Completed refactor for {label} Master Spreadsheet!\n")

def main():
    service = get_sheets_service()
    
    # 1. Refactor Private Master Spreadsheet (User Primary Focus)
    refactor_master_spreadsheet(service, PRIVATE_SID, "Private")
    
    # 2. Refactor Work Master Spreadsheet (Standardization)
    refactor_master_spreadsheet(service, WORK_SID, "Work")
    
    print("All spreadsheets refactored and stylized successfully!")

if __name__ == '__main__':
    main()
