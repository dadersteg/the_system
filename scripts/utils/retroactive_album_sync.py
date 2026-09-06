#!/usr/bin/env python3
"""
retroactive_album_sync.py
Retroactively categorizes and adds existing app-created Google Photos media items into dedicated albums:
- Instagram Backups
- Telegram Backups
- Messenger Backups
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CREDENTIALS_FILE = BASE_DIR / "auth" / "credentials.json"
TOKEN_FILE = BASE_DIR / "auth" / "photos_sync_token.json"
LOG_FILE = BASE_DIR / "scratch" / "retroactive_album_sync_log.json"

SCOPES = [
    'https://www.googleapis.com/auth/photoslibrary.appendonly',
    'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
    'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata'
]

ALBUM_CONFIG = {
    "instagram": "Instagram Backups",
    "telegram": "Telegram Backups",
    "messenger": "Messenger Backups"
}

def get_credentials():
    """Retrieves or refreshes OAuth credentials for Google Photos API."""
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception as e:
            print(f"[AUTH] Error loading token from {TOKEN_FILE}: {e}")

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("[AUTH] Refreshing expired token...")
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"[AUTH] Token refresh failed: {e}. Starting new OAuth flow.")
                creds = None

        if not creds:
            if not CREDENTIALS_FILE.exists():
                print(f"[AUTH ERROR] Credentials file not found at {CREDENTIALS_FILE}")
                sys.exit(1)
            print("[AUTH] Starting browser OAuth flow...")
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        print(f"[AUTH] Saved credentials token to {TOKEN_FILE}")

    return creds

def get_or_create_albums(headers):
    """Fetches existing albums or creates the 3 backup albums."""
    print("\n--- Resolving Target Albums ---")
    album_ids = {}
    
    # 1. List existing albums
    url = "https://photoslibrary.googleapis.com/v1/albums"
    existing_albums = {}
    page_token = None
    
    while True:
        params = {"pageSize": 50}
        if page_token:
            params["pageToken"] = page_token
            
        res = requests.get(url, headers=headers, params=params)
        if res.status_code != 200:
            print(f"[WARN] Failed to list existing albums ({res.status_code}): {res.text}")
            break
            
        data = res.json()
        for album in data.get("albums", []):
            existing_albums[album.get("title", "").strip()] = album.get("id")
            
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    # 2. Check or create each required album
    for platform, title in ALBUM_CONFIG.items():
        if title in existing_albums:
            album_ids[platform] = existing_albums[title]
            print(f"[ALBUM] Found existing album: '{title}' -> ID: {album_ids[platform]}")
        else:
            print(f"[ALBUM] Creating album: '{title}'...")
            payload = {"album": {"title": title}}
            res = requests.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                album_ids[platform] = data["id"]
                print(f"[ALBUM] Created album: '{title}' -> ID: {data['id']}")
            else:
                print(f"[ERROR] Failed to create album '{title}': {res.text}")
                
    return album_ids

def classify_media_item(item):
    """Classifies a media item into instagram, telegram, messenger, or None."""
    filename = (item.get("filename") or "").lower()
    description = (item.get("description") or "").lower()

    if "instagram" in filename or "instagram" in description:
        return "instagram"
    if "telegram" in filename or "telegram" in description:
        return "telegram"
    if "messenger" in filename or "messenger" in description:
        return "messenger"
    return None

def fetch_all_media_items(headers):
    """Paginates through all app-created media items."""
    print("\n--- Fetching Library Media Items ---")
    url = "https://photoslibrary.googleapis.com/v1/mediaItems"
    media_items = []
    page_token = None
    page = 1

    while True:
        params = {"pageSize": 100}
        if page_token:
            params["pageToken"] = page_token

        res = requests.get(url, headers=headers, params=params)
        if res.status_code != 200:
            print(f"[ERROR] Failed to fetch media items on page {page} ({res.status_code}): {res.text}")
            break

        data = res.json()
        items = data.get("mediaItems", [])
        media_items.extend(items)
        print(f"[PAGE {page}] Fetched {len(items)} items (Total: {len(media_items)})...")

        page_token = data.get("nextPageToken")
        if not page_token:
            break
        page += 1

    return media_items

def add_items_to_album(album_id, album_title, item_ids, headers):
    """Adds a list of media item IDs to an album in chunks of 50."""
    if not item_ids:
        print(f"[ALBUM] No items to add to '{album_title}'.")
        return 0

    total_added = 0
    chunk_size = 50
    chunks = [item_ids[i:i + chunk_size] for i in range(0, len(item_ids), chunk_size)]
    url = f"https://photoslibrary.googleapis.com/v1/albums/{album_id}:batchAddMediaItems"

    print(f"\n[ALBUM] Adding {len(item_ids)} items to '{album_title}' in {len(chunks)} batch(es)...")

    for idx, chunk in enumerate(chunks, 1):
        payload = {"mediaItemIds": chunk}
        max_retries = 3
        for attempt in range(max_retries):
            res = requests.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                total_added += len(chunk)
                print(f"  -> Batch {idx}/{len(chunks)} ({len(chunk)} items): SUCCESS")
                break
            elif res.status_code == 429:
                wait_sec = (attempt + 1) * 2
                print(f"  -> Rate limit hit (429). Retrying in {wait_sec}s...")
                time.sleep(wait_sec)
            else:
                print(f"  -> Batch {idx}/{len(chunks)} FAILED ({res.status_code}): {res.text}")
                break
        time.sleep(0.5)

    return total_added

def main():
    print("==================================================")
    print("  THE CLERK - RETROACTIVE PHOTO ALBUM MIGRATION   ")
    print("==================================================")

    creds = get_credentials()
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json"
    }

    album_ids = get_or_create_albums(headers)
    all_media = fetch_all_media_items(headers)

    print(f"\nFound {len(all_media)} total media items in application library.")

    categorized = {
        "instagram": [],
        "telegram": [],
        "messenger": [],
        "unclassified": []
    }

    for item in all_media:
        platform = classify_media_item(item)
        if platform in categorized:
            categorized[platform].append(item["id"])
        else:
            categorized["unclassified"].append(item.get("filename", item["id"]))

    print("\n--- Classification Breakdown ---")
    print(f"  Instagram : {len(categorized['instagram'])} items")
    print(f"  Telegram  : {len(categorized['telegram'])} items")
    print(f"  Messenger : {len(categorized['messenger'])} items")
    print(f"  Unclassified / Other: {len(categorized['unclassified'])} items")

    results = {}
    for platform, items in categorized.items():
        if platform == "unclassified":
            continue
        album_id = album_ids.get(platform)
        album_title = ALBUM_CONFIG.get(platform)
        if album_id:
            added_count = add_items_to_album(album_id, album_title, items, headers)
            results[platform] = {"target_album": album_title, "album_id": album_id, "items_added": added_count}

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_examined": len(all_media),
            "results": results,
            "unclassified_count": len(categorized["unclassified"])
        }, f, indent=2)

    print(f"\n[COMPLETE] Log written to {LOG_FILE}")
    print("==================================================")

if __name__ == "__main__":
    main()
