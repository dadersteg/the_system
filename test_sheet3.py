import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds = Credentials.from_authorized_user_file('/Users/daniel/Documents/AGY/the_system/auth/token.json')
service = build('sheets', 'v4', credentials=creds)

SHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'

res = service.spreadsheets().values().get(spreadsheetId=SHEET_ID, range="'5 Import - Email Triage Log'!A:F").execute()
rows = res.get('values', [])
print(f"Total rows in Email Triage Log: {len(rows)}")
count_2014 = 0
for i, row in enumerate(rows):
    if len(row) > 1:
        rcv = row[1]
        if '2014' in rcv or '14' in rcv.split('/')[-1] if '/' in rcv else False:
            count_2014 += 1
            if count_2014 <= 5:
                print(f"Row {i+1}: {row}")
print(f"Total 2014 emails in Triage Log: {count_2014}")
