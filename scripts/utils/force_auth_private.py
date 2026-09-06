#!/usr/bin/env python3
import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow

TARGETS = [
    {
        "name": "The System (Core)",
        "creds_path": "/Users/daniel/Documents/AGY/the_system/auth/credentials.json",
        "token_path": "/Users/daniel/Documents/AGY/the_system/auth/token.json",
        "scopes": [
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/calendar",
            "https://mail.google.com/"
        ]
    },
    {
        "name": "The System Reflection",
        "creds_path": "/Users/daniel/Documents/AGY/reflection/auth/client_secret.json",
        "token_path": "/Users/daniel/Documents/AGY/reflection/auth/token.json",
        "scopes": [
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/calendar",
            "https://mail.google.com/",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/documents"
        ]
    }
]

def authenticate_target(target):
    print(f"\n{'='*55}")
    print(f"  AUTHENTICATING: {target['name']}")
    print(f"{'='*55}")
    
    creds_path = target["creds_path"]
    token_path = target["token_path"]
    
    if not os.path.exists(creds_path):
        print(f"❌ Error: {creds_path} does not exist. Skipping {target['name']}.")
        return False

    # Delete the old token if it exists to force a fresh login
    if os.path.exists(token_path):
        print(f"Removing old token at {token_path}...")
        os.remove(token_path)

    print("\n🌐 A browser window will now open.")
    print("Please select your PRIVATE Google Account (adersteg.daniel@gmail.com)")
    print("Click 'Advanced' -> 'Go to App' and click 'Allow'.\n")
    
    flow = InstalledAppFlow.from_client_secrets_file(creds_path, target["scopes"])
    creds = flow.run_local_server(port=0)

    os.makedirs(os.path.dirname(token_path), exist_ok=True)
    with open(token_path, 'w') as token:
        token.write(creds.to_json())
    
    print(f"\n✅ Success! New 7-day token saved to {token_path}")
    return True

def main():
    print("====================================================")
    print("      PROACTIVE OAUTH REFRESH (PRIVATE SUITE)       ")
    print("====================================================")
    
    success_count = 0
    for target in TARGETS:
        if authenticate_target(target):
            success_count += 1
            
    print("\n====================================================")
    if success_count == len(TARGETS):
        print("🎉 All target authentications completed successfully.")
    else:
        print(f"⚠️ Completed {success_count}/{len(TARGETS)} authentications.")
    print("====================================================")

if __name__ == '__main__':
    main()
