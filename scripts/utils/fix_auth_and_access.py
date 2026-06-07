#!/usr/bin/env python3
import os
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def check_token(token_path, label):
    print(f"\nChecking {label} Token ({os.path.basename(token_path)})...")
    if not os.path.exists(token_path):
        print(f"❌ FAILED: Token file does not exist at {token_path}")
        return None, None
    
    try:
        creds = Credentials.from_authorized_user_file(token_path)
        # Try refreshing if expired
        if creds.expired and creds.refresh_token:
            print(f" -> Token is expired, attempting to refresh...")
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            with open(token_path, 'w') as f:
                f.write(creds.to_json())
            print(f" -> Token refreshed successfully.")
        
        # Build tasks service and try to test
        service = build('tasks', 'v1', credentials=creds)
        lists = service.tasklists().list(maxResults=1).execute().get('items', [])
        
        # Extract default list ID to verify connection
        default_list_id = lists[0]['id'] if lists else '@default'
        print(f"✅ SUCCESS: Connected to Google Tasks API. Default List ID: {default_list_id}")
        return creds, default_list_id
    except Exception as e:
        print(f"❌ FAILED: Error checking token: {e}")
        return None, None

def main():
    print("====================================================")
    print("      GOOGLE TASKS OAUTH DIAGNOSTICS & AUTH CHECK   ")
    print("====================================================")
    
    script_dir = os.path.dirname(os.path.realpath(__file__))
    auth_dir = os.path.realpath(os.path.join(script_dir, '../../auth'))
    
    private_token = os.path.join(auth_dir, 'token_tasks.json')
    work_token = os.path.join(auth_dir, 'token_tasks_work.json')
    
    creds_p, id_p = check_token(private_token, "Private Tasks")
    creds_w, id_w = check_token(work_token, "Work Tasks")
    
    print("\n----------------------------------------------------")
    print("                 ACCOUNT COLLISION CHECK            ")
    print("----------------------------------------------------")
    
    if id_p and id_w:
        if id_p == id_w:
            print("⚠️  WARNING: COLLISION DETECTED!")
            print("Both your Private and Work OAuth tokens point to the exact same Google Tasks database.")
            print("This causes personal tasks to appear under work tasks and duplicate routing problems.")
            print("\n👉 RESOLUTION INSTRUCTIONS:")
            print("1. Delete the Work token file:")
            print(f"   rm {work_token}")
            print("2. Run the sync command to trigger a browser authentication prompt:")
            print("   my_venv/bin/python3 scripts/utils/sync_tasks_combined.py")
            print("3. Ensure you log in with your actual Work Google Account when prompted in the browser.")
        else:
            print("✅ OK: Private and Work tokens point to different Google Accounts.")
            print("No collision detected.")
    else:
        print("Could not complete collision check because one or both tokens failed diagnostics.")
    print("====================================================")

if __name__ == '__main__':
    main()
