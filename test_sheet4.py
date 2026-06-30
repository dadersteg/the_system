import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/auth/token.json')
service = build('sheets', 'v4', credentials=creds)

SHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'

res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="'5 Import - Retro Emails Log'!A:F").execute()
rows = res.get('values', [])
count_2014 = 0
for i, row in enumerate(rows):
    for cell in row:
        if '2014' in str(cell):
            count_2014 += 1
            if count_2014 <= 5:
                print(f"Row {i+1}: {row}")
            break
print(f"Total rows containing '2014': {count_2014}")
