import os
import json
import time
from datetime import datetime
from email.utils import parsedate_to_datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
CREDENTIALS_FILE = '/Users/daniel/Documents/AGY/the_system/auth/credentials.json'
TOKEN_FILE = '/Users/daniel/Documents/AGY/the_system/auth/token_gmail.json'

DATA_DIR = '/Users/daniel/Developer/second_brain_db/data'
INSIGHTS_DIR = '/Users/daniel/Developer/second_brain_db/insights/daily'
SOURCE_FILE = os.path.join(DATA_DIR, '2026-05-29.json')

def authenticate_gmail():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def parse_date_header(date_str):
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.strftime('%Y-%m-%d')
    except Exception as e:
        print(f"Error parsing date {date_str}: {e}")
        return None

def main():
    print("Authenticating with Gmail API...")
    service = authenticate_gmail()
    print("Authentication successful.")

    if not os.path.exists(SOURCE_FILE):
        print(f"Source file {SOURCE_FILE} does not exist.")
        return

    with open(SOURCE_FILE, 'r') as f:
        data = json.load(f)

    normal_events = []
    retro_events = []
    
    for item in data:
        if isinstance(item, dict) and item.get('source') == 'email_retro':
            retro_events.append(item)
        else:
            normal_events.append(item)

    print(f"Found {len(retro_events)} retro emails and {len(normal_events)} normal events.")

    if not retro_events:
        print("No retro emails to migrate.")
        return

    migrated_counts = {}
    affected_days = set()

    for idx, event in enumerate(retro_events):
        url = event.get("Direct URL to the Gmail thread", "")
        if not url:
            print(f"[{idx}] Skipping: No URL found")
            continue
            
        thread_id = url.split('/')[-1].split('?')[0].split('#')[-1]
        
        try:
            thread = service.users().threads().get(userId='me', id=thread_id, format='metadata', metadataHeaders=['Date']).execute()
            messages = thread.get('messages', [])
            if not messages:
                print(f"[{idx}] No messages found for thread {thread_id}")
                continue
                
            first_msg = messages[0]
            headers = first_msg.get('payload', {}).get('headers', [])
            date_header = next((h['value'] for h in headers if h['name'].lower() == 'date'), None)
            
            if not date_header:
                print(f"[{idx}] No Date header found for thread {thread_id}")
                continue
                
            target_date = parse_date_header(date_header)
            if not target_date:
                continue
                
            # Append to target day
            target_file = os.path.join(DATA_DIR, f"{target_date}.json")
            if os.path.exists(target_file):
                with open(target_file, 'r') as f:
                    day_data = json.load(f)
            else:
                day_data = []
                
            day_data.append(event)
            
            with open(target_file, 'w') as f:
                json.dump(day_data, f, indent=2)
                
            affected_days.add(target_date)
            migrated_counts[target_date] = migrated_counts.get(target_date, 0) + 1
            
            if idx % 100 == 0:
                print(f"Processed {idx}/{len(retro_events)}...")
                
            time.sleep(0.05) # Rate limit
            
        except Exception as e:
            print(f"[{idx}] Error fetching thread {thread_id}: {e}")

    print("\nMigration Complete!")
    print(f"Migrated emails across {len(migrated_counts)} unique days.")
    
    # Delete the insights for affected days
    print("\nDeleting affected insight files to trigger regeneration...")
    deleted_count = 0
    for day in affected_days:
        insight_path = os.path.join(INSIGHTS_DIR, f"{day}_insight.md")
        if os.path.exists(insight_path):
            os.remove(insight_path)
            deleted_count += 1
    
    # Also delete the source day's insight so it regenerates cleanly without the 3600 emails
    source_insight = os.path.join(INSIGHTS_DIR, "2026-05-29_insight.md")
    if os.path.exists(source_insight):
        os.remove(source_insight)
        deleted_count += 1
        
    print(f"Deleted {deleted_count} insight files.")

    print("\nSaving cleaned source file...")
    with open(SOURCE_FILE, 'w') as f:
        json.dump(normal_events, f, indent=2)
    print("Done.")

if __name__ == '__main__':
    main()
