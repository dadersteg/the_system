import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/auth/token.json')
service = build('sheets', 'v4', credentials=creds)

SHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'

meta = service.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
for sheet in meta.get('sheets', []):
    title = sheet['properties']['title']
    print(f"Checking {title}...")
    try:
        res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=f"'{title}'!A:Z").execute()
        rows = res.get('values', [])
        for i, row in enumerate(rows):
            for cell in row:
                if '2014-05-12' in str(cell):
                    print(f"Found in {title}, row {i+1}: {row}")
                    break
    except Exception as e:
        print(e)
