import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
TEMPLATE_ID = "1_kZ7Qg5IrjAV44NcY_AgtiykNHArJKTANvk8V8T2Rq4"

def get_creds():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
    return creds

def main():
    creds = get_creds()
    sheets_service = build('sheets', 'v4', credentials=creds)
    
    spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=TEMPLATE_ID).execute()
    sheets = spreadsheet.get('sheets', [])
    
    # Exact tab names to wipe (row 2 onwards)
    tabs_to_wipe = [
        'Drive 05 Log',
        'Notes 05 Log',
        'Drive 05 Reset Log',
        'Drive 05 Session Log',
        'Gmail 05 Log',
        'Gmail 05 Retro Log',
        'Google Tasks 02 Review',
        'Google Tasks 05 Completed',
        'Drive 05 Retro Log'
    ]
    
    wiped_count = 0
    for sheet in sheets:
        sheet_name = sheet['properties']['title']
        
        if sheet_name in tabs_to_wipe:
            # Clear values from row 2 onwards
            range_to_clear = f"'{sheet_name}'!A2:ZZ50000"
            sheets_service.spreadsheets().values().clear(
                spreadsheetId=TEMPLATE_ID,
                range=range_to_clear
            ).execute()
            print(f"Cleared values for tab: {sheet_name}")
            wiped_count += 1
            
    if wiped_count > 0:
        print("Successfully wiped data values from the new template.")
    else:
        print("No log tabs found to wipe.")

if __name__ == '__main__':
    main()
