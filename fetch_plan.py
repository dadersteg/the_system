import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_file(token_file, file_id, out_name):
    with open(token_file, 'r') as f:
        creds_data = json.load(f)
    
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    
    service = build('drive', 'v3', credentials=creds)
    content = service.files().get_media(fileId=file_id).execute().decode('utf-8')
    with open(out_name, 'w') as f:
        f.write(content)

try:
    get_file('auth/token.json', '1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq', 'plan_private.txt')
    print("Fetched private plan")
except Exception as e:
    print("Private failed:", e)

try:
    get_file('auth/token_tasks_work.json', '1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7', 'plan_pmt.txt')
    print("Fetched PMT plan")
except Exception as e:
    print("PMT failed:", e)

