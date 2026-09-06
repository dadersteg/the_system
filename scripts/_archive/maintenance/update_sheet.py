import os
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    token_path = 'auth/token.json'
    if not os.path.exists(token_path):
        print("token.json not found")
        return

    creds = Credentials.from_authorized_user_file(
        token_path, 
        ['https://www.googleapis.com/auth/spreadsheets']
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    sheets_service = build('sheets', 'v4', credentials=creds)
    spreadsheet_id = '1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8'

    # Step 1: Add README sheet
    add_sheet_request = {
        'addSheet': {
            'properties': {
                'title': 'README',
                'index': 0 # Put it at the front
            }
        }
    }
    
    try:
        response = sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'requests': [add_sheet_request]}
        ).execute()
        readme_sheet_id = response['replies'][0]['addSheet']['properties']['sheetId']
        print(f"Added README sheet with ID: {readme_sheet_id}")
    except Exception as e:
        if "already exists" in str(e).lower():
            print("README sheet already exists. Finding its ID...")
            sheet_info = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            readme_sheet_id = next(s['properties']['sheetId'] for s in sheet_info['sheets'] if s['properties']['title'] == 'README')
        else:
            print(f"Error adding sheet: {e}")
            return

    # Step 2: Write text
    text_content = [
        ["CRITICAL SYSTEM INFORMATION - PLEASE READ"],
        [""],
        ["What is this spreadsheet?"],
        ["This spreadsheet is merely a VISUAL DASHBOARD designed to help you quickly navigate the system's architecture."],
        ["It acts as a human-readable map of all the core files, prompts, and folders used by both the Private and PMT environments."],
        [""],
        ["What is the SINGLE SOURCE OF TRUTH?"],
        ["The actual system (The Clerk, Task Master, etc.) DOES NOT READ THIS SPREADSHEET to find its files."],
        ["The undisputed, absolute, 100% single source of truth for the entire system is Code_Config.js inside Google Apps Script."],
        ["Every single file ID used by the system is permanently and explicitly hardcoded inside Code_Config.js."],
        [""],
        ["How to update the system:"],
        ["If you ever need to change a core file, create a new spreadsheet, or repoint a folder, you MUST update the ID directly inside Code_Config.js."],
        ["Changing a link in this spreadsheet will NOT change the system's behavior; it will only update your visual map."],
        [""],
        ["As long as Code_Config.js remains your single source of truth, both your Private and PMT environments will remain perfectly synced, isolated, and flawless."]
    ]
    
    body = {
        'values': text_content
    }
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range='README!A1:A20',
        valueInputOption='RAW',
        body=body
    ).execute()
    
    # Step 3: Format the sheet (bold the header, resize column)
    format_requests = [
        {
            'repeatCell': {
                'range': {
                    'sheetId': readme_sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                    'startColumnIndex': 0,
                    'endColumnIndex': 1
                },
                'cell': {
                    'userEnteredFormat': {
                        'textFormat': {
                            'bold': True,
                            'fontSize': 14,
                            'foregroundColor': {'red': 1.0, 'green': 0.0, 'blue': 0.0}
                        }
                    }
                },
                'fields': 'userEnteredFormat(textFormat)'
            }
        },
        {
            'updateDimensionProperties': {
                'range': {
                    'sheetId': readme_sheet_id,
                    'dimension': 'COLUMNS',
                    'startIndex': 0,
                    'endIndex': 1
                },
                'properties': {
                    'pixelSize': 800
                },
                'fields': 'pixelSize'
            }
        }
    ]
    
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={'requests': format_requests}
    ).execute()

    print("Successfully updated the README sheet!")

if __name__ == '__main__':
    main()
