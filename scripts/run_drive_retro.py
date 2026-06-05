import os
import json
import time
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

# Set a global timeout of 60 seconds for all network connections
socket.setdefaulttimeout(60.0)
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from google.genai import Client
from google.genai import types

def load_env():
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    os.environ[k] = v.strip("'\"")

load_env()
GEMINI_API_KEY = os.environ.get('SYSTEM_GEMINI_API_KEY')
RETRO_MODEL = os.environ.get('GEMINI_RETRO_MODEL', 'gemini-3.5-flash')

creds = Credentials.from_authorized_user_file('token.json')
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

drive_service = build('drive', 'v3', credentials=creds)
sheets_service = build('sheets', 'v4', credentials=creds)
gemini_client = Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(timeout=60000)
)

MASTER_SHEET_ID = "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4"
DRIVE_RETRO_LOG_GID = "1325920151"

# Load state
STATE_FILE = 'drive_retro_state.json'
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    return {"page_token": None, "processed_count": 0}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

# Folder cache for ancestor checking
ancestor_cache = {}
def check_ancestor(file_id, bad_folder='10OWXo6W88eB3P-yP_zq67vrEPHqtbuc1'):
    if file_id in ancestor_cache: return ancestor_cache[file_id]
    try:
        f = drive_service.files().get(fileId=file_id, fields='parents').execute()
        parents = f.get('parents', [])
        if bad_folder in parents:
            ancestor_cache[file_id] = True
            return True
        for p in parents:
            if check_ancestor(p, bad_folder):
                ancestor_cache[file_id] = True
                return True
    except:
        pass
    ancestor_cache[file_id] = False
    return False

# Load Rules and TOMS
with open('docs/TS - Clerk > System Instructions.md', 'r') as f:
    instructions = f.read()
with open('docs/TS - Categorisation.md', 'r') as f:
    taxonomy = f.read()
with open('docs/target_operating_model.md', 'r') as f:
    toms = f.read()

system_prompt = f"{instructions}\n\nTAXONOMY:\n{taxonomy}\n\nTARGET OPERATING MODEL STRUCTURE (TOMS):\n{toms}"

# Global cache name variable to be set during run()
CACHE_NAME = None

def process_file(item):
    file_id = item['id']
    name = item['name']
    mime = item['mimeType']
    modified = item.get('modifiedTime', '')
    
    content_part = f"FILENAME: {name}\nDATE: {modified}\nCONTENT: "
    
    def get_snippet(text):
        if len(text) <= 12000:
            return text
        return text[:6000] + "\n\n...[CONTENT TRUNCATED FOR LENGTH]...\n\n" + text[-6000:]
        
    try:
        if 'google-apps.document' in mime:
            txt = drive_service.files().export_media(fileId=file_id, mimeType='text/plain').execute().decode('utf-8')
            content_part += get_snippet(txt)
        elif 'google-apps.spreadsheet' in mime:
            txt = drive_service.files().export_media(fileId=file_id, mimeType='text/csv').execute().decode('utf-8')
            content_part += get_snippet(txt)
        elif mime.startswith('text/'):
            txt = drive_service.files().get_media(fileId=file_id).execute().decode('utf-8')
            content_part += get_snippet(txt)
        else:
            content_part += "[Content extraction skipped for binary]"
    except Exception as e:
        content_part += f"[Error extracting: {e}]"
        
    try:
        response = gemini_client.models.generate_content(
            model=RETRO_MODEL,
            contents=content_part,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
                cached_content=CACHE_NAME
            )
        )
        data = json.loads(response.text)
        return {
            "success": True,
            "item": item,
            "proposed_name": data.get('filename', name),
            "proposed_path": data.get('concat_path', 'Unknown'),
            "summary": data.get('summary', ''),
            "reasoning": data.get('reasoning', '')
        }
    except Exception as e:
        return {"success": False, "item": item, "error": str(e)}

def write_logs(results):
    sheet_name = "Drive 05 Retro Log"
    rows = []
    for res in results:
        if not res['success']: continue
        item = res['item']
        url = f"https://drive.google.com/open?id={item['id']}"
        rows.append([
            url, item['name'], item.get('description', ''), res['proposed_name'], "N/A", 
            res['proposed_path'], res['summary'], "RETRO PROCESSED", res['reasoning'], 0, 
            "SUCCESS", "N/A", "N/A", "N/A", "None", "", "", ""
        ])
    
    if not rows: return
    
    body = {"values": rows}
    sheets_service.spreadsheets().values().append(
        spreadsheetId=MASTER_SHEET_ID,
        range=f"{sheet_name}!A:R",
        valueInputOption="USER_ENTERED",
        body=body
    ).execute()

# Global cache for resolved paths to speed up lookups
resolved_path_cache = {}

def resolve_folder_path(proposed_path):
    if not proposed_path or proposed_path.lower() == 'unknown':
        return None
        
    if proposed_path in resolved_path_cache:
        return resolved_path_cache[proposed_path]
        
    segments = [s.strip() for s in proposed_path.split('>')]
    if not segments:
        return None
        
    # Start by finding the first segment globally
    first_seg = segments[0]
    query = f"mimeType = 'application/vnd.google-apps.folder' and name contains '{first_seg}' and trashed = false"
    res = drive_service.files().list(q=query, fields="files(id, name)").execute()
    files = res.get('files', [])
    
    if files:
        current_parent = files[0]['id']
        matched_name = files[0]['name']
        start_idx = 1
        # If the next segment is already part of the matched folder name, skip it
        if len(segments) > 1 and segments[1].lower() in matched_name.lower():
            start_idx = 2
    else:
        current_parent = 'root'
        start_idx = 0
        
    # Traverse/create subsequent segments
    for i in range(start_idx, len(segments)):
        segment = segments[i]
        query = f"mimeType = 'application/vnd.google-apps.folder' and '{current_parent}' in parents and name = '{segment}' and trashed = false"
        res = drive_service.files().list(q=query, fields="files(id)").execute()
        subfiles = res.get('files', [])
        
        if subfiles:
            current_parent = subfiles[0]['id']
        else:
            print(f"Creating folder '{segment}' under parent '{current_parent}'...")
            file_metadata = {
                'name': segment,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [current_parent]
            }
            folder = drive_service.files().create(body=file_metadata, fields='id').execute()
            current_parent = folder.get('id')
            
    resolved_path_cache[proposed_path] = current_parent
    return current_parent

def update_drive(results):
    for res in results:
        if not res['success']: continue
        item = res['item']
        new_desc = f"[CLERK PROCESSED]\nTaxonomy: {res['proposed_path']}\nSummary: {res['summary']}"
        
        try:
            # 1. Update metadata
            drive_service.files().update(
                fileId=item['id'],
                body={
                    "name": res['proposed_name'],
                    "description": new_desc
                }
            ).execute()
            print(f"Updated metadata: {item['name']} -> {res['proposed_name']}")
            
            # 2. Resolve and move
            target_folder_id = resolve_folder_path(res['proposed_path'])
            if target_folder_id:
                f_info = drive_service.files().get(fileId=item['id'], fields='parents').execute()
                previous_parents = ",".join(f_info.get('parents', []))
                if target_folder_id not in previous_parents:
                    drive_service.files().update(
                        fileId=item['id'],
                        addParents=target_folder_id,
                        removeParents=previous_parents,
                        fields='id, parents'
                    ).execute()
                    print(f"Moved file to: {res['proposed_path']}")
        except Exception as e:
            print(f"Failed to update/move {item['name']}: {e}")

def run():
    global CACHE_NAME
    state = load_state()
    page_token = state['page_token']
    
    query = "modifiedTime < '2025-02-01T00:00:00Z' and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
    
    print("Creating Gemini Context Cache...")
    cache = gemini_client.caches.create(
        model=RETRO_MODEL,
        config=types.CreateCachedContentConfig(
            display_name="drive_retro_context",
            system_instruction=system_prompt,
            ttl="7200s" # 2 hours
        )
    )
    CACHE_NAME = cache.name
    print(f"Context Cache active: {CACHE_NAME}")
    
    print("Starting Drive Retro Engine...")
    
    try:
        while True:
            print(f"Fetching batch (pageToken: {page_token})...")
            results = drive_service.files().list(
                q=query, 
                orderBy="modifiedTime desc", 
                pageSize=50, 
                pageToken=page_token,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, description)"
            ).execute()
            
            items = results.get('files', [])
            page_token = results.get('nextPageToken')
            
            if not items:
                print("No more files found! Complete.")
                state['page_token'] = None
                save_state(state)
                break
                
            valid_items = []
            for item in items:
                desc = item.get('description', '')
                if '[CLERK PROCESSED]' in desc:
                    continue
                if check_ancestor(item['id']):
                    continue
                valid_items.append(item)
                
            if not valid_items:
                state['page_token'] = page_token
                save_state(state)
                continue
                
            print(f"Processing {len(valid_items)} files...")
            batch_results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                future_to_item = {executor.submit(process_file, i): i for i in valid_items}
                for future in as_completed(future_to_item):
                    batch_results.append(future.result())
                    
            # Update Drive and route
            update_drive(batch_results)
            # Write Logs
            write_logs(batch_results)
            
            state['page_token'] = page_token
            state['processed_count'] += len(valid_items)
            save_state(state)
            print(f"Batch complete. Total processed: {state['processed_count']}")
            
            if not page_token:
                print("Reached end of query.")
                break
    finally:
        # Cleanup cache on exit
        try:
            print("Cleaning up Context Cache...")
            gemini_client.caches.delete(name=CACHE_NAME)
            print("Cleanup complete.")
        except Exception as e:
            print(f"Failed to delete cache: {e}")

if __name__ == '__main__':
    run()
