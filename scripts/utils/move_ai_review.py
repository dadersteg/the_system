import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_service(token_file):
    with open(token_file, 'r') as f:
        creds_data = json.load(f)
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    return build('tasks', 'v1', credentials=creds)

def main():
    service_priv = get_service('auth/token.json')
    service_pmt = get_service('auth/token_tasks_work.json')
    
    priv_ai_review_id = 'ZzZ0aHpMNDJzNEJmMnJhUw'
    
    pmt_lists = [
        'M05Gb0c1dG91bXlkQUJpVQ', # TODO
        'MDYyMjMzMTg0OTMyNDE4MjM4MDk6MDow', # Importer
        'WDVGU1pHd25FTnJuLXJ6dg' # AI Review
    ]
    
    # 1. Fetch PMT tasks
    pmt_titles = set()
    for lst in pmt_lists:
        res = service_pmt.tasks().list(tasklist=lst, showHidden=True, maxResults=100).execute()
        for t in res.get('items', []):
            pmt_titles.add(t['title'].lower().strip())
            
    # 2. Fetch Private AI Review tasks
    res = service_priv.tasks().list(tasklist=priv_ai_review_id, showHidden=True, maxResults=100).execute()
    priv_tasks = res.get('items', [])
    
    moved_count = 0
    deleted_count = 0
    
    print(f"Found {len(priv_tasks)} tasks in Private AI Review.")
    
    for t in priv_tasks:
        title = t['title']
        title_clean = title.lower().strip()
        
        # Check if it's a duplicate (or very similar)
        is_dup = False
        for pmt_t in pmt_titles:
            # Simple substring check to catch minor variations like "Migrate Data" vs "Migrate historical trading data"
            if title_clean in pmt_t or pmt_t in title_clean:
                is_dup = True
                break
                
        if is_dup:
            print(f"Duplicate found, DELETING from Private: {title}")
            service_priv.tasks().delete(tasklist=priv_ai_review_id, task=t['id']).execute()
            deleted_count += 1
        else:
            print(f"Moving to PMT: {title}")
            # Insert to PMT AI Review
            service_pmt.tasks().insert(
                tasklist='WDVGU1pHd25FTnJuLXJ6dg', # PMT AI Review
                body={'title': t['title'], 'notes': t.get('notes', '')}
            ).execute()
            # Delete from Private
            service_priv.tasks().delete(tasklist=priv_ai_review_id, task=t['id']).execute()
            moved_count += 1

    print(f"\nDone! Moved: {moved_count}, Deleted (duplicates): {deleted_count}")

main()
