import os
import random
from datetime import datetime, timedelta, timezone
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def fetch_sample(drive_service, query, sample_size=100):
    page_token = None
    files = []
    
    # Fetch a pool of files to sample from
    while len(files) < 1000:
        try:
            results = drive_service.files().list(
                q=query, 
                fields="nextPageToken, files(id, name, description, createdTime)",
                pageToken=page_token,
                pageSize=100
            ).execute()
            
            page_files = results.get('files', [])
            if not page_files:
                break
            files.extend(page_files)
            
            page_token = results.get('nextPageToken')
            if not page_token:
                break
        except Exception as e:
            print(f"Error fetching files: {e}")
            break
            
    if not files:
        return []
        
    return random.sample(files, min(sample_size, len(files)))

def check_tags(files):
    count = 0
    for f in files:
        desc = f.get('description', '')
        if desc and ('#' in desc or '[CLERK PROCESSED]' in desc or 'Taxonomy:' in desc):
            count += 1
    return count

def main():
    token_path = os.path.join(os.path.dirname(__file__), '..', '..', 'auth', 'token_drive.json')
    if not os.path.exists(token_path):
        print(f"Token file not found at {token_path}")
        return

    creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    threshold_date = datetime.now(timezone.utc) - timedelta(days=18 * 30)
    formatted_date = threshold_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')

    print("Fetching file samples from Google Drive...")
    
    # Exclude folders
    base_query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false"

    query_older = f"{base_query} and createdTime <= '{formatted_date}'"
    older_files = fetch_sample(drive_service, query_older, 100)
    
    query_newer = f"{base_query} and createdTime > '{formatted_date}'"
    newer_files = fetch_sample(drive_service, query_newer, 100)

    older_tags = check_tags(older_files)
    newer_tags = check_tags(newer_files)
    
    print("\n--- CLERK TAG METRICS ---")
    print(f"Files Older than 18 months (Created before {formatted_date[:10]}):")
    print(f"  Sample Size: {len(older_files)}")
    print(f"  With Clerk Tags: {older_tags} ({(older_tags/len(older_files))*100 if older_files else 0:.1f}%)")
    
    print(f"\nFiles Newer than 18 months (Created after {formatted_date[:10]}):")
    print(f"  Sample Size: {len(newer_files)}")
    print(f"  With Clerk Tags: {newer_tags} ({(newer_tags/len(newer_files))*100 if newer_files else 0:.1f}%)")
    print("-------------------------\n")

if __name__ == '__main__':
    main()
