#!/usr/bin/env python3
"""
scripts/sync_google_photos.py
Google Photos Library Sync & Local Staging Engine for The Clerk.
Completely decouples media extraction from paid Gemini API keys ($0 marginal cost).
Antigravity performs multimodal vision analysis in-session natively under Ultra subscription.
"""

import os
import sys
import json
import csv
import time
import hashlib
import argparse
import requests
from io import BytesIO
from pathlib import Path
from PIL import Image

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

BASE_DIR = Path(__file__).resolve().parent.parent
SCOPES = [
    'https://www.googleapis.com/auth/photoslibrary.appendonly',
    'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
    'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata'
]
TOKEN_FILE = str(BASE_DIR / 'auth' / 'photos_sync_token.json')
SHEETS_TOKEN_FILE = str(BASE_DIR / 'auth' / 'token.json')
OUTPUT_CSV = str(BASE_DIR / 'scratch' / 'photo_register.csv')
CACHE_FILE = str(BASE_DIR / 'scratch' / 'processed_google_photos.json')
LOCK_FILE = str(BASE_DIR / 'scratch' / '.clerk_photos_sweep.lock')
STAGING_DIR = BASE_DIR / 'scratch' / 'staged_photos'
MANIFEST_FILE = STAGING_DIR / 'manifest.json'
PHOTO_SPREADSHEET_ID = '1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k'

def check_and_acquire_lock():
    if os.path.exists(LOCK_FILE):
        try:
            mtime = os.path.getmtime(LOCK_FILE)
            if (time.time() - mtime) < 300:  # 5 minutes TTL
                print(json.dumps({
                    "status": "LOCKED",
                    "message": "[MUTEX] Active photo sweep currently running. Exiting to guarantee 0 overlap."
                }))
                sys.exit(0)
            else:
                print("[MUTEX] Stale lock detected (>300s). Overwriting lock.", file=sys.stderr)
        except Exception:
            pass
    with open(LOCK_FILE, 'w') as f:
        f.write(str(time.time()))

def release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception as e:
        print(f"Warning: Could not remove lockfile: {e}", file=sys.stderr)

def get_photos_creds():
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            print(f"Error loading photos token: {e}", file=sys.stderr)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        else:
            print(json.dumps({
                "status": "AUTH_ERROR",
                "message": f"Valid photos OAuth token required in {TOKEN_FILE}"
            }))
            sys.exit(1)
    return creds

def get_sheets_service():
    if not os.path.exists(SHEETS_TOKEN_FILE):
        return None
    try:
        creds = Credentials.from_authorized_user_file(SHEETS_TOKEN_FILE)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(SHEETS_TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())
        return build('sheets', 'v4', credentials=creds)
    except Exception as e:
        print(f"Error loading sheets credentials: {e}", file=sys.stderr)
        return None

def touch_heartbeat(status="SUCCESS", details=""):
    try:
        if str(BASE_DIR) not in sys.path:
            sys.path.insert(0, str(BASE_DIR))
        from scripts.utils.heartbeat_lease import touch_heartbeat_lease
        touch_heartbeat_lease(pipeline_name="CLERK_PHOTOS", status=status, details=details)
    except Exception as e:
        print(f"Could not touch heartbeat lease: {e}", file=sys.stderr)

def stage_photos(batch_limit=5):
    check_and_acquire_lock()
    try:
        creds = get_photos_creds()
        
        processed = []
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r') as f:
                    processed = json.load(f)
            except Exception:
                processed = []
                
        url = "https://photoslibrary.googleapis.com/v1/mediaItems"
        headers = {"Authorization": f"Bearer {creds.token}"}
        
        new_items = []
        page_token = None
        
        while len(new_items) < batch_limit:
            params = {"pageSize": 25}
            if page_token:
                params["pageToken"] = page_token
                
            res = requests.get(url, headers=headers, params=params)
            if res.status_code != 200:
                print(f"Error fetching photos: {res.text}", file=sys.stderr)
                break
                
            data = res.json()
            items = data.get("mediaItems", [])
            if not items:
                break
                
            hit_cache = False
            for item in items:
                item_id = item.get("id")
                if item_id in processed:
                    hit_cache = True
                    break
                if item.get("mimeType", "").startswith("image/"):
                    new_items.append(item)
                    if len(new_items) >= batch_limit:
                        break
                        
            if hit_cache or not data.get("nextPageToken") or len(new_items) >= batch_limit:
                break
                
            page_token = data.get("nextPageToken")
            
        if not new_items:
            touch_heartbeat("SUCCESS", "0 new photos to stage")
            release_lock()
            print(json.dumps({
                "status": "CLEAN",
                "new_photos_count": 0,
                "message": "Google Photos queue clean. 0 new photos found."
            }))
            return
            
        STAGING_DIR.mkdir(parents=True, exist_ok=True)
        staged_list = []
        
        # Download and stage thumbnails for Antigravity in-session vision
        for item in reversed(new_items):  # Oldest to newest
            item_id = item.get("id")
            filename = item.get("filename", "untitled.jpg")
            clean_hash = hashlib.md5(item_id.encode('utf-8')).hexdigest()[:12]
            local_img_path = STAGING_DIR / f"{clean_hash}.jpg"
            
            img_url = item["baseUrl"] + "=w1024-h1024"
            r = requests.get(img_url, timeout=30)
            if r.status_code == 200:
                img = Image.open(BytesIO(r.content))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.thumbnail((1024, 1024))
                img.save(str(local_img_path), "JPEG", quality=85)
                
                staged_list.append({
                    "id": item_id,
                    "filename": filename,
                    "local_path": str(local_img_path),
                    "creation_time": item.get("mediaMetadata", {}).get("creationTime", ""),
                    "product_url": item.get("productUrl", ""),
                    "description": item.get("description", "")
                })
            else:
                print(f"Failed to download image bytes for {filename}", file=sys.stderr)
                
        with open(MANIFEST_FILE, 'w') as f:
            json.dump(staged_list, f, indent=2)
            
        print(json.dumps({
            "status": "STAGED",
            "new_photos_count": len(staged_list),
            "manifest": str(MANIFEST_FILE),
            "items": staged_list
        }, indent=2))
        
    except Exception as e:
        release_lock()
        print(json.dumps({
            "status": "ERROR",
            "message": str(e)
        }))
        sys.exit(1)

def commit_analysis(analysis_file):
    try:
        if not os.path.exists(analysis_file):
            print(f"Analysis file not found: {analysis_file}", file=sys.stderr)
            sys.exit(1)
            
        with open(analysis_file, 'r') as f:
            analyzed_items = json.load(f)
            
        if not isinstance(analyzed_items, list):
            analyzed_items = [analyzed_items]
            
        sheets_service = get_sheets_service()
        
        processed = []
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r') as f:
                    processed = json.load(f)
            except Exception:
                processed = []
                
        # Ensure CSV header exists
        if not os.path.exists(OUTPUT_CSV):
            with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['Filename', 'Source', 'Date', 'Latitude', 'Longitude', 'Google Photos URL', 'Category', 'Purpose', 'Activities', 'Entities', 'Text Found', 'Vibe', 'Milestone'])
                
        sheet_rows = []
        for item in analyzed_items:
            photo_id = item.get("id")
            filename = item.get("filename", "unknown.jpg")
            date_str = item.get("creation_time") or item.get("date", "")
            url = item.get("product_url") or item.get("url", "")
            data = item.get("analysis", item)
            
            row = [
                filename,
                "Native_Google_Photos",
                date_str,
                "",  # Latitude
                "",  # Longitude
                url,
                data.get('category', ''),
                data.get('purpose', ''),
                ", ".join(data.get('activities', [])) if isinstance(data.get('activities'), list) else str(data.get('activities', '')),
                ", ".join(data.get('entities', [])) if isinstance(data.get('entities'), list) else str(data.get('entities', '')),
                ", ".join(data.get('text_found', [])) if isinstance(data.get('text_found'), list) else str(data.get('text_found', '')),
                data.get('vibe', ''),
                data.get('is_milestone', False)
            ]
            
            # Append to local CSV
            with open(OUTPUT_CSV, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(row)
                
            sheet_rows.append(row)
            if photo_id and photo_id not in processed:
                processed.append(photo_id)
                
        # Batch append to Google Sheet Table 1
        if sheets_service and sheet_rows:
            try:
                sheets_service.spreadsheets().values().append(
                    spreadsheetId=PHOTO_SPREADSHEET_ID,
                    range='Table 1!A:M',
                    valueInputOption='USER_ENTERED',
                    insertDataOption='INSERT_ROWS',
                    body={'values': sheet_rows}
                ).execute()
                print(f"Logged {len(sheet_rows)} photos to live Photo Register Sheet.")
            except Exception as e:
                print(f"Warning: Could not append to Photo Register Sheet: {e}", file=sys.stderr)
                
        # Save updated cache
        with open(CACHE_FILE, 'w') as f:
            json.dump(processed, f, indent=2)
            
        # Clean up local thumbnail images
        if STAGING_DIR.exists():
            for f in STAGING_DIR.glob("*.jpg"):
                try:
                    f.unlink()
                except Exception:
                    pass
            if MANIFEST_FILE.exists():
                try:
                    MANIFEST_FILE.unlink()
                except Exception:
                    pass
                    
        touch_heartbeat("SUCCESS", f"Committed {len(analyzed_items)} photos")
        print(json.dumps({
            "status": "COMMITTED",
            "count": len(analyzed_items)
        }))
        
    finally:
        release_lock()

def add_to_album(item_id, album_name):
    try:
        creds = get_photos_creds()
        headers = {'Authorization': f'Bearer {creds.token}', 'Content-Type': 'application/json'}
        
        list_url = 'https://photoslibrary.googleapis.com/v1/albums'
        res = requests.get(list_url, headers=headers, params={'pageSize': 50})
        album_id = None
        if res.status_code == 200:
            albums = res.json().get('albums', [])
            for a in albums:
                if a.get('title', '').strip().lower() == album_name.strip().lower():
                    album_id = a.get('id')
                    break
                    
        if not album_id:
            create_res = requests.post(list_url, headers=headers, json={'album': {'title': album_name}})
            if create_res.status_code == 200:
                album_id = create_res.json().get('id')
                
        if not album_id:
            print(json.dumps({"status": "ERROR", "message": f"Could not find or create album '{album_name}'"}))
            sys.exit(1)
            
        add_url = f'https://photoslibrary.googleapis.com/v1/albums/{album_id}:batchAddMediaItems'
        add_res = requests.post(add_url, headers=headers, json={'mediaItemIds': [item_id]})
        if add_res.status_code == 200:
            print(json.dumps({"status": "SUCCESS", "album": album_name, "media_item_id": item_id}))
        else:
            print(json.dumps({"status": "ERROR", "message": add_res.text}))
    except Exception as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Google Photos Local Staging & Committer Engine")
    parser.add_argument("--stage", action="store_true", help="Fetch and stage newly added photos")
    parser.add_argument("--commit", type=str, help="Path to JSON file containing vision analysis results to commit")
    parser.add_argument("--add-to-album", type=str, help="Media item ID to add to an album")
    parser.add_argument("--album-name", type=str, help="Album title (e.g. 'Instagram Backups')")
    parser.add_argument("--limit", type=int, default=5, help="Batch limit for staging (default: 5)")
    args = parser.parse_args()
    
    if args.commit:
        commit_analysis(args.commit)
    elif args.add_to_album and args.album_name:
        add_to_album(args.add_to_album, args.album_name)
    else:
        stage_photos(batch_limit=args.limit)
