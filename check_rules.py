import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

with open('auth/token_tasks_work.json', 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

service = build('sheets', 'v4', credentials=creds)
SPREADSHEET_ID = '1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY' # PMT Master Sheet? No wait, this is from earlier
# Let's find ROOT Master Sheet ID
