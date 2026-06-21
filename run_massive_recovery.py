import os
import json
import re
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

PRIVATE_SHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'

SHEETS_TO_PROCESS = [
    (PRIVATE_SHEET_ID, '5 Import - Email Triage Log'),
    (PRIVATE_SHEET_ID, '5 Import - Retro Emails Log')
]

def to_two_digit_format(label_path):
    if "99 Temp / To be deleted" in label_path or "99 Temp/To be deleted" in label_path:
        return label_path.replace("99 Temp / To be deleted", "99 To be deleted").replace("99 Temp/To be deleted", "99 To be deleted")
        
    if "Alexander / Gabriel" in label_path or "Alexander/Gabriel" in label_path:
        label_path = label_path.replace("Alexander / Gabriel", "Alexander & Gabriel").replace("Alexander/Gabriel", "Alexander & Gabriel")

    segments = label_path.split('/')
    new_segments = []
    for segment in segments:
        segment = segment.strip()
        match1 = re.match(r'^(\d{2}) 00 00 (.+)$', segment)
        match2 = re.match(r'^\d{2} (\d{2}) 00 (.+)$', segment)
        match3 = re.match(r'^\d{2} \d{2} (\d{2}) (.+)$', segment)
        
        if match1:
            new_segments.append(f"{match1.group(1)} {match1.group(2).strip()}")
        elif match2:
            new_segments.append(f"{match2.group(1)} {match2.group(2).strip()}")
        elif match3:
            new_segments.append(f"{match3.group(1)} {match3.group(2).strip()}")
        else:
            new_segments.append(segment)
            
    return '/'.join(new_segments)

def get_or_create_label(service, label_name, label_cache):
    if label_name in label_cache:
        return label_cache[label_name]
        
    print(f"Label '{label_name}' not found in cache. Creating...")
    try:
        label = service.users().labels().create(
            userId='me',
            body={'name': label_name, 'labelListVisibility': 'labelShow', 'messageListVisibility': 'show'}
        ).execute()
        label_cache[label_name] = label['id']
        return label['id']
    except HttpError as error:
        print(f"An error occurred creating label {label_name}: {error}")
        return None

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json')
    sheets_service = build('sheets', 'v4', credentials=creds)
    gmail_service = build('gmail', 'v1', credentials=creds)

    print("Fetching existing Gmail labels...")
    results = gmail_service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])
    label_cache = {label['name']: label['id'] for label in labels}

    total_emails = 0
    recovered_emails = 0

    for sheet_id, sheet_name in SHEETS_TO_PROCESS:
        print(f"\nProcessing {sheet_name}...")
        try:
            result = sheets_service.spreadsheets().values().get(
                spreadsheetId=sheet_id, 
                range=f"'{sheet_name}'!A:J"
            ).execute()
            
            values = result.get('values', [])
            if not values:
                continue
                
            header = values[0]
            link_idx = header.index('Link') if 'Link' in header else 8
            final_label_idx = header.index('Final Label Set') if 'Final Label Set' in header else 7
            
            for i in range(1, len(values)):
                row = values[i]
                if len(row) <= max(link_idx, final_label_idx):
                    continue
                    
                link_str = row[link_idx]
                final_labels_str = row[final_label_idx]
                
                if not link_str or not final_labels_str:
                    continue
                    
                match = re.search(r'#all/([^&]+)', link_str)
                if not match:
                    continue
                
                thread_id = match.group(1)
                total_emails += 1
                
                target_labels = [to_two_digit_format(l.strip()) for l in final_labels_str.split(',')]
                target_labels = [l for l in target_labels if l and l not in ["99 Label_Reviewed", "00 Manual Review"]]
                
                if not target_labels:
                    continue
                
                try:
                    thread = gmail_service.users().threads().get(userId='me', id=thread_id, format='minimal').execute()
                    current_messages = thread.get('messages', [])
                    if not current_messages:
                        continue
                        
                    current_label_ids = current_messages[0].get('labelIds', [])
                    
                    label_ids_to_add = []
                    for t_label in target_labels:
                        l_id = get_or_create_label(gmail_service, t_label, label_cache)
                        if l_id and l_id not in current_label_ids:
                            label_ids_to_add.append(l_id)
                            
                    if label_ids_to_add:
                        gmail_service.users().threads().modify(
                            userId='me',
                            id=thread_id,
                            body={'addLabelIds': label_ids_to_add}
                        ).execute()
                        recovered_emails += 1
                        print(f"[RECOVERED] Thread {thread_id} restored {len(label_ids_to_add)} labels.")
                        
                except HttpError as error:
                    # Thread might be permanently deleted
                    pass

        except Exception as e:
            print(f"Error processing {sheet_name}: {e}")

    print(f"\nExecution Complete.")
    print(f"Total Emails Scanned: {total_emails}")
    print(f"Total Emails Recovered: {recovered_emails}")

if __name__ == '__main__':
    main()
