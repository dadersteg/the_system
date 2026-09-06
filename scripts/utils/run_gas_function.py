#!/usr/bin/env python3
import os
import sys
import argparse
import json
from googleapiclient.discovery import build

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_credentials

def main():
    parser = argparse.ArgumentParser(description='Run a Google Apps Script function.')
    parser.add_argument('function_name', help='The name of the GAS function to run.')
    parser.add_argument('--args', nargs='*', help='Arguments to pass to the function (optional).', default=[])
    args = parser.parse_args()

    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    TOKEN_PATH = os.path.join(BASE_DIR, 'auth', 'token.json')
    CLASP_JSON = os.path.join(BASE_DIR, '.clasp.json')

    if not os.path.exists(TOKEN_PATH):
        print(f"Error: Token not found at {TOKEN_PATH}. Run force_auth_private.py first.")
        sys.exit(1)

    if not os.path.exists(CLASP_JSON):
        print(f"Error: {CLASP_JSON} not found. Cannot determine scriptId.")
        sys.exit(1)

    with open(CLASP_JSON, 'r') as f:
        clasp_config = json.load(f)
        script_id = clasp_config.get('scriptId')

    if not script_id:
        print("Error: scriptId not found in .clasp.json")
        sys.exit(1)

    print(f"Authenticating using {TOKEN_PATH}...")
    creds = get_credentials(TOKEN_PATH)
    
    if not creds or not creds.valid:
        print("Error: Invalid credentials. Run force_auth_private.py to refresh.")
        sys.exit(1)

    print("Connecting to Google Apps Script API...")
    service = build('script', 'v1', credentials=creds)

    request_body = {
        'function': args.function_name,
        'parameters': args.args,
        'devMode': True  # Runs the latest saved version, not just the deployed one
    }

    print(f"Executing function '{args.function_name}' on script ID: {script_id}...")
    try:
        response = service.scripts().run(scriptId=script_id, body=request_body).execute()
        
        if 'error' in response:
            error = response['error']['details'][0]
            print(f"\n❌ Execution Failed: {error.get('errorMessage')}")
            if 'scriptStackTraceElements' in error:
                print("Stack Trace:")
                for trace in error['scriptStackTraceElements']:
                    print(f"  at {trace.get('function')} ({trace.get('lineNumber')})")
        else:
            print("\n✅ Execution Successful!")
            if 'response' in response and 'result' in response['response']:
                print(f"Result: {response['response']['result']}")
            else:
                print("No return value from function.")
                
    except Exception as e:
        print(f"\n❌ API Error: {e}")

if __name__ == '__main__':
    main()
