#!/usr/bin/env python3
"""
check_system_health.py
Diagnostics and health-check script for The System.
Checks local Python packages, clasp status, Google OAuth tokens, and API resource accessibility.
"""

import os
import sys
import subprocess
import json
import time

# Terminal styling helper
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log_section(name):
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== {name} ==={Colors.ENDC}")

def log_status(success, name, details):
    if success:
        print(f"  [{Colors.GREEN}✅ SUCCESS{Colors.ENDC}] {name}: {details}")
    else:
        print(f"  [{Colors.FAIL}❌ FAILED{Colors.ENDC}] {name}: {details}")

def log_warning(name, details):
    print(f"  [{Colors.WARNING}⚠️ WARNING{Colors.ENDC}] {name}: {details}")

def check_python_packages():
    log_section("Python Package Diagnostics")
    required = ["googleapiclient", "google_auth_oauthlib", "google.auth"]
    missing = []
    
    for lib in required:
        try:
            if lib == "googleapiclient":
                import googleapiclient.discovery
            elif lib == "google_auth_oauthlib":
                import google_auth_oauthlib.flow
            elif lib == "google.auth":
                import google.auth
            log_status(True, lib, "Installed and importable")
        except ImportError:
            missing.append(lib)
            log_status(False, lib, "Missing import")
            
    if missing:
        print(f"\n{Colors.WARNING}Please run: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib{Colors.ENDC}")
        return False
    return True

def check_clasp():
    log_section("Clasp Status Diagnostics")
    if not os.path.exists(".clasp.json"):
        log_status(False, ".clasp.json", "Not found in root directory!")
        return False
        
    try:
        res = subprocess.run(["npx", "clasp", "status"], capture_output=True, text=True, check=False)
        if res.returncode == 0:
            log_status(True, "clasp status", "Connected to Apps Script project successfully")
            print(f"{Colors.BLUE}Clasp output:{Colors.ENDC}\n{res.stdout.strip()}")
            return True
        else:
            log_status(False, "clasp status", f"Clasp execution failed:\n{res.stderr.strip()}")
            return False
    except Exception as e:
        log_status(False, "clasp check", f"Could not run clasp command: {str(e)}")
        return False

def check_manifest_alignment():
    log_section("Manifest Alignment Diagnostics")
    sys_manifest_path = "src/appsscript.json"
    ref_manifest_path = "../reflection/appsscript.json"
    
    if not os.path.exists(sys_manifest_path):
        log_status(False, "the_system manifest", f"Not found at: {sys_manifest_path}")
        return False
        
    if not os.path.exists(ref_manifest_path):
        log_warning("reflection manifest", f"Not found at: {ref_manifest_path}")
        return False
        
    try:
        with open(sys_manifest_path, 'r') as f:
            sys_data = json.load(f)
        with open(ref_manifest_path, 'r') as f:
            ref_data = json.load(f)
            
        sys_scopes = set(sys_data.get("oauthScopes", []))
        ref_scopes = set(ref_data.get("oauthScopes", []))
        
        if sys_scopes == ref_scopes:
            log_status(True, "Manifest Scopes Sync", "the_system and reflection manifests have identical oauthScopes")
            return True
        else:
            diff_sys = sys_scopes - ref_scopes
            diff_ref = ref_scopes - sys_scopes
            log_status(False, "Manifest Scopes Sync", "Manifest oauthScopes are mismatched! This causes scope-downgrade loops.")
            if diff_sys:
                print(f"    Missing in reflection: {list(diff_sys)}")
            if diff_ref:
                print(f"    Missing in the_system: {list(diff_ref)}")
            return False
    except Exception as e:
        log_status(False, "Manifest Scopes Sync", f"Error checking manifest alignment: {str(e)}")
        return False

def check_token_file(filepath, token_name):
    if not os.path.exists(filepath):
        log_warning(token_name, f"File not found at: {filepath}")
        return None
        
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        
        creds = Credentials.from_authorized_user_file(filepath)
        if not creds:
            log_status(False, token_name, f"Failed to parse JSON content of {filepath}")
            return None
            
        # Check validity
        if creds.expired:
            if creds.refresh_token:
                log_warning(token_name, f"Token expired. Attempting automatic refresh for client ID {creds.client_id[:8]}...")
                try:
                    creds.refresh(Request())
                    # Write back refreshed token
                    with open(filepath, 'w') as token_file:
                        token_file.write(creds.to_json())
                    log_status(True, token_name, "Token expired but successfully refreshed and saved.")
                    return creds
                except Exception as refresh_err:
                    err_msg = str(refresh_err)
                    if "deleted_client" in err_msg:
                        log_status(False, token_name, f"Deleted Client ID ({creds.client_id[:8]}...). The GCP OAuth Client was deleted in Google Console. Delete this file and re-authenticate.")
                    else:
                        log_status(False, token_name, f"Failed to refresh token: {err_msg}")
                    return None
            else:
                log_status(False, token_name, "Token expired and no refresh token is present.")
                return None
        else:
            log_status(True, token_name, f"Valid. (Client: {creds.client_id[:8]}..., Scopes: {', '.join(creds.scopes)})")
            return creds
    except Exception as e:
        log_status(False, token_name, f"Error validating token file: {str(e)}")
        return None

def check_clasprc():
    clasprc_path = os.path.expanduser('~/.clasprc.json')
    if not os.path.exists(clasprc_path):
        log_warning("~/.clasprc.json (Clasp Auth)", "Clasp credentials file not found.")
        return
        
    try:
        with open(clasprc_path, 'r') as f:
            clasprc = json.load(f)
            
        token_data = clasprc.get('tokens', {}).get('default', {})
        if not token_data:
            log_status(False, "~/.clasprc.json (Clasp Auth)", "Missing 'default' token structure.")
            return
            
        client_id = token_data.get('client_id', '')
        expiry = token_data.get('expiry_date', 0)
        current_time_ms = int(time.time() * 1000)
        
        if current_time_ms >= expiry - 300000: # Expired or within 5 mins
            log_warning("~/.clasprc.json (Clasp Auth)", "Token expired/expiring. Attempting manual refresh...")
            import requests
            refresh_data = {
                'client_id': token_data['client_id'],
                'client_secret': token_data['client_secret'],
                'refresh_token': token_data['refresh_token'],
                'grant_type': 'refresh_token'
            }
            r = requests.post('https://oauth2.googleapis.com/token', data=refresh_data)
            if r.status_code == 200:
                res_json = r.json()
                token_data['access_token'] = res_json['access_token']
                token_data['expiry_date'] = int(time.time() + res_json['expires_in']) * 1000
                clasprc['tokens']['default'] = token_data
                with open(clasprc_path, 'w') as f:
                    json.dump(clasprc, f, indent=2)
                log_status(True, "~/.clasprc.json (Clasp Auth)", "Token refreshed and saved successfully.")
            else:
                log_status(False, "~/.clasprc.json (Clasp Auth)", f"Refresh failed: {r.status_code} - {r.text}")
        else:
            log_status(True, "~/.clasprc.json (Clasp Auth)", f"Valid. (Client: {client_id[:8]}...)")
    except Exception as e:
        log_status(False, "~/.clasprc.json (Clasp Auth)", f"Error: {str(e)}")

def verify_google_apis(creds, label):
    if not creds:
        return
        
    try:
        from googleapiclient.discovery import build
        
        # Test Drive / Files
        if any('drive' in s for s in creds.scopes):
            try:
                drive_service = build('drive', 'v3', credentials=creds)
                drive_service.files().list(pageSize=1).execute()
                log_status(True, f"API Connectivity ({label})", "Drive API verification OK.")
            except Exception as drive_err:
                log_status(False, f"API Connectivity ({label})", f"Drive API failed: {str(drive_err)}")
                
        # Test Tasks
        if any('tasks' in s for s in creds.scopes):
            try:
                tasks_service = build('tasks', 'v1', credentials=creds)
                tasks_service.tasklists().list(maxResults=1).execute()
                log_status(True, f"API Connectivity ({label})", "Tasks API verification OK.")
            except Exception as tasks_err:
                log_status(False, f"API Connectivity ({label})", f"Tasks API failed: {str(tasks_err)}")
    except Exception as e:
        log_status(False, f"API Services ({label})", f"Error during verification: {str(e)}")

def main():
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")
    print(f"{Colors.BOLD}          THE SYSTEM: COMPREHENSIVE HEALTH CHECK     {Colors.ENDC}")
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")
    
    check_python_packages()
    check_clasp()
    check_manifest_alignment()
    
    log_section("Credentials File Audits")
    
    # Check ~/.clasprc.json
    check_clasprc()
    
    # Check the_system token.json
    sys_token = check_token_file('token.json', "the_system/token.json")
    verify_google_apis(sys_token, "the_system/token.json")
    
    # Check agy_quantum21 tokens
    q21_token = check_token_file('/Users/daniel/Documents/agy_quantum21/tools/drive_token.json', "agy_quantum21/drive_token.json")
    verify_google_apis(q21_token, "agy_quantum21/drive_token.json")
    
    q21_token_full = check_token_file('/Users/daniel/Documents/agy_quantum21/tools/drive_token_full.json', "agy_quantum21/drive_token_full.json")
    verify_google_apis(q21_token_full, "agy_quantum21/drive_token_full.json")
        
    print(f"\n{Colors.BOLD}===================================================={Colors.ENDC}")
    print(f"{Colors.BOLD}Diagnostics finished.{Colors.ENDC}")
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")

if __name__ == '__main__':
    main()
