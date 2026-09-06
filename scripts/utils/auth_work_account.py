#!/usr/bin/env python3
import os
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/tasks']
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CREDS_PATH = os.path.join(BASE_DIR, 'auth', 'creds_work.json')
TOKEN_PATH = os.path.join(BASE_DIR, 'auth', 'token_tasks_work.json')

def main():
    print(f"Loading credentials from {CREDS_PATH}")
    if not os.path.exists(CREDS_PATH):
        print(f"Error: {CREDS_PATH} does not exist.")
        return

    flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
    print("\nA browser window will now open. Please select your WORK / PLAYMETECH Google Account to authorize.\n")
    creds = flow.run_local_server(port=0)

    with open(TOKEN_PATH, 'w') as token:
        token.write(creds.to_json())
    
    print(f"\nSuccess! New token saved to {TOKEN_PATH}")

if __name__ == '__main__':
    main()
