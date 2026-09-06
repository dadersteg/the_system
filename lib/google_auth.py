import os
import sys
import time
import subprocess
from pathlib import Path

# Ensure workspace venv site-packages are loaded in sandboxed runs
for candidate_site in [
    Path(__file__).resolve().parent.parent / "scratch" / "my_venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path(__file__).resolve().parent.parent / "venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path("/Users/daniel/Documents/AGY/the_system/scratch/my_venv/lib/python3.14/site-packages"),
    Path("/Users/daniel/Developer/the_system/venv/lib/python3.14/site-packages"),
]:
    if candidate_site.exists() and str(candidate_site) not in sys.path:
        sys.path.insert(1, str(candidate_site))

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

ALERT_SENTINEL_PATH = Path(__file__).resolve().parent.parent / "scratch" / ".oauth_alert_timestamp"
ALERT_COOLDOWN_SECONDS = 3600  # 1 hour throttle window

def _dispatch_throttled_alert(account_name: str, error_msg: str):
    """
    Dispatches a macOS desktop notification if outside the 1-hour cooldown window.
    Guards against notification storms in continuous daemon loops.
    """
    now = time.time()
    should_alert = True
    
    try:
        if ALERT_SENTINEL_PATH.exists():
            last_alert = float(ALERT_SENTINEL_PATH.read_text().strip())
            if now - last_alert < ALERT_COOLDOWN_SECONDS:
                should_alert = False
                remaining = int((ALERT_COOLDOWN_SECONDS - (now - last_alert)) / 60)
                print(f"[google_auth] Alert suppressed (cooldown active, {remaining}m remaining).", file=sys.stderr)
    except Exception as e:
        print(f"[google_auth] Sentinel read warning: {e}", file=sys.stderr)
        
    if should_alert:
        try:
            ALERT_SENTINEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            ALERT_SENTINEL_PATH.write_text(str(now))
            if sys.platform == 'darwin' and (os.environ.get("TERM_PROGRAM") or os.environ.get("USER")):
                apple_script = f'display notification "{error_msg}" with title "The System Auth Failure" sound name "Basso"'
                subprocess.run(["osascript", "-e", apple_script], capture_output=True, timeout=5)
        except Exception as alert_err:
            print(f"[google_auth] Failed to dispatch desktop alert: {alert_err}", file=sys.stderr)

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
            
            err = f"CRITICAL: Credentials missing or expired for {account_name}. Manual OAuth refresh required."
            print(err, file=sys.stderr)
            _dispatch_throttled_alert(account_name, err)
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
