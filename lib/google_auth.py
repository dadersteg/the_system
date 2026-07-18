import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

def get_service(api_name, api_version, token_path, creds_path=None, account_name="Account"):
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Failed to refresh token: {e}")
                creds = None
        
        if not creds:
            if creds_path and not os.path.exists(creds_path):
                print(f"Error: Client secrets file '{creds_path}' not found for {account_name}.")
                return None
            
            print(f"Error: Credentials missing or expired for {account_name}. Cannot authenticate interactively in cron.")
            import sys
            sys.exit(1)
            
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
            
    from googleapiclient.discovery import build
    return build(api_name, api_version, credentials=creds)

def get_credentials(token_path, creds_path=None, account_name="Account"):
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Failed to refresh token: {e}")
                creds = None
        
        if not creds:
            if creds_path and not os.path.exists(creds_path):
                print(f"Error: Client secrets file '{creds_path}' not found for {account_name}.")
                return None
            
            print(f"Error: Credentials missing or expired for {account_name}. Cannot authenticate interactively in cron.")
            import sys
            sys.exit(1)
            
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
            
    return creds
