import csv
import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file('token.json')
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

access_token = creds.token

sheet_id = '1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4'
gid = '2131515996'

url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
headers = {'Authorization': f'Bearer {access_token}'}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    lines = response.text.splitlines()
    reader = csv.reader(lines)
    header = next(reader, None)
    
    matches = []
    for row in reader:
        row_str = " ".join(row).lower()
        if "whatsapp" in row_str:
            matches.append(row)
            
    if not matches:
        print("No WhatsApp emails found in the log.")
    else:
        print(f"Found {len(matches)} WhatsApp emails:")
        for m in matches:
            print(" | ".join(m[:5]))
else:
    print(f"Failed to fetch CSV: {response.status_code}")
