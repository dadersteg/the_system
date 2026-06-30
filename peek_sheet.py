import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/auth/token.json')
service = build('sheets', 'v4', credentials=creds)

SHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'
res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="'5 Import - Retro Emails Log'!A1:F5").execute()
for row in res.get('values', []):
    print(row)
