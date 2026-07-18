import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
# Just fetch the original spreadsheet and print the tab names
MASTER_SHEET_ID = "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4"

def get_creds():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json')
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
    return creds

def main():
    creds = get_creds()
    sheets_service = build('sheets', 'v4', credentials=creds)
    spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=MASTER_SHEET_ID).execute()
    sheets = spreadsheet.get('sheets', [])
    for sheet in sheets:
        sheet_name = sheet['properties']['title']
        print(f"Tab found: '{sheet_name}'")

if __name__ == '__main__':
    main()
