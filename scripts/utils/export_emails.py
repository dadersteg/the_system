#!/usr/bin/env python3
import os
import sys
import json
import csv
import argparse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def get_gmail_service(profile="work"):
    auth_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), '../../auth'))
    
    candidates = []
    if profile == "work":
        candidates = [
            os.path.join(auth_dir, 'token_gmail_work.json'),
            os.path.join(auth_dir, 'token_work.json'),
            os.path.join(auth_dir, 'token_gmail.json'),
            os.path.join(auth_dir, 'token.json')
        ]
    else:
        candidates = [
            os.path.join(auth_dir, 'token_gmail_private.json'),
            os.path.join(auth_dir, 'token_gmail.json'),
            os.path.join(auth_dir, 'token.json')
        ]
        
    token_path = None
    for c in candidates:
        if os.path.exists(c):
            token_path = c
            break
            
    if not token_path:
        print(f"Error: No valid Gmail token file found in {auth_dir}", file=sys.stderr)
        return None
        
    try:
        creds = Credentials.from_authorized_user_file(token_path)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_path, 'w') as f:
                f.write(creds.to_json())
        return build('gmail', 'v1', credentials=creds)
    except Exception as e:
        print(f"Error loading credentials from {token_path}: {e}", file=sys.stderr)
        return None

def fetch_email_metadata(service, query="in:all -in:trash -in:spam", max_results=200):
    # 1. Fetch label map (id -> name)
    label_map = {}
    try:
        labels_res = service.users().labels().list(userId='me').execute()
        for lbl in labels_res.get('labels', []):
            label_map[lbl['id']] = lbl['name']
    except Exception as e:
        print(f"Warning fetching labels: {e}", file=sys.stderr)
        
    # 2. Search threads
    threads = []
    page_token = None
    fetched = 0
    
    while fetched < max_results:
        batch_size = min(100, max_results - fetched)
        res = service.users().threads().list(
            userId='me',
            q=query,
            maxResults=batch_size,
            pageToken=page_token
        ).execute()
        
        items = res.get('threads', [])
        if not items:
            break
            
        threads.extend(items)
        fetched += len(items)
        page_token = res.get('nextPageToken')
        if not page_token:
            break
            
    print(f"Found {len(threads)} threads matching query '{query}'. Extracting metadata...", file=sys.stderr)
    
    rows = []
    for idx, t in enumerate(threads):
        try:
            th = service.users().threads().get(userId='me', id=t['id'], format='metadata', metadataHeaders=['From', 'Subject', 'Date']).execute()
            messages = th.get('messages', [])
            if not messages:
                continue
                
            first_msg = messages[0]
            headers = first_msg.get('payload', {}).get('headers', [])
            
            sender = ""
            subject = ""
            date_str = ""
            
            for h in headers:
                name = h.get('name', '').lower()
                if name == 'from':
                    sender = h.get('value', '')
                elif name == 'subject':
                    subject = h.get('value', '')
                elif name == 'date':
                    date_str = h.get('value', '')
                    
            # Extract thread label names
            thread_label_ids = set()
            for m in messages:
                thread_label_ids.update(m.get('labelIds', []))
                
            label_names = [label_map.get(lid, lid) for lid in thread_label_ids if lid not in ['UNREAD', 'INBOX', 'IMPORTANT', 'SENT', 'TRASH', 'SPAM']]
            
            rows.append({
                "thread_id": t['id'],
                "date": date_str,
                "sender": sender,
                "subject": subject,
                "labels": ", ".join(sorted(label_names))
            })
            
            if (idx + 1) % 25 == 0:
                print(f"  Processed {idx + 1}/{len(threads)} threads...", file=sys.stderr)
        except Exception as e:
            print(f"  Error processing thread {t.get('id')}: {e}", file=sys.stderr)
            
    return rows

def parse_args():
    parser = argparse.ArgumentParser(description="Export email metadata (Sender, Subject, Labels) for rule generation")
    parser.add_argument("--profile", choices=["work", "private"], default="work", help="Account profile (default: work)")
    parser.add_argument("--max", type=int, default=200, help="Maximum number of threads to fetch (default: 200)")
    parser.add_argument("--query", type=str, default="in:all -in:trash -in:spam", help="Gmail search query filter")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="Output format (default: csv)")
    parser.add_argument("--output", type=str, help="Output file path (optional)")
    return parser.parse_args()

def main():
    args = parse_args()
    service = get_gmail_service(args.profile)
    if not service:
        sys.exit(1)
        
    rows = fetch_email_metadata(service, query=args.query, max_results=args.max)
    
    if args.format == "json":
        output_str = json.dumps(rows, indent=2)
    else:
        import io
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["sender", "subject", "labels", "date", "thread_id"])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
        output_str = buf.getvalue()
        
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output_str)
        print(f"Saved {len(rows)} email records to {args.output}", file=sys.stderr)
    else:
        print(output_str)

if __name__ == '__main__':
    main()
