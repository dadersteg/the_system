import os, json
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

creds = Credentials.from_authorized_user_file('token.json')
if creds.expired and creds.refresh_token:
    creds.refresh(Request())
drive_service = build('drive', 'v3', credentials=creds)

gemini_client = Client(api_key=os.environ.get("SYSTEM_GEMINI_API_KEY"))
RETRO_MODEL = os.environ.get("GEMINI_RETRO_MODEL", "gemini-3.5-flash")

def check_ancestor(file_id, bad_folder='10OWXo6W88eB3P-yP_zq67vrEPHqtbuc1', cache=None):
    if cache is None: cache = {}
    if file_id in cache: return cache[file_id]
    try:
        f = drive_service.files().get(fileId=file_id, fields='parents').execute()
        parents = f.get('parents', [])
        if bad_folder in parents:
            cache[file_id] = True
            return True
        for p in parents:
            if check_ancestor(p, bad_folder, cache):
                cache[file_id] = True
                return True
    except:
        pass
    cache[file_id] = False
    return False

print("Fetching another 10 valid files...")
query = "modifiedTime < '2025-02-01T00:00:00Z' and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
page_token = None
valid_files = []
ancestor_cache = {}

while len(valid_files) < 20:
    results = drive_service.files().list(
        q=query, 
        orderBy="modifiedTime desc", 
        pageSize=50, 
        pageToken=page_token,
        fields="nextPageToken, files(id, name, mimeType, modifiedTime, description)"
    ).execute()
    
    items = results.get('files', [])
    page_token = results.get('nextPageToken')
    
    for item in items:
        # Check description locally
        desc = item.get('description', '')
        if '[CLERK PROCESSED]' in desc:
            continue
            
        if not check_ancestor(item['id'], cache=ancestor_cache):
            valid_files.append(item)
        
        if len(valid_files) >= 20:
            break
            
    if not page_token:
        break

# Slice to get the next 10
next_10_files = valid_files[10:20]

print(f"Selected {len(next_10_files)} files (skipping the first 10). Running Gemini analysis...")

with open('docs/TS - Clerk > System Instructions.md', 'r') as f:
    instructions = f.read()
with open('docs/TS - Categorisation.md', 'r') as f:
    taxonomy = f.read()

system_prompt = f"{instructions}\n\nTAXONOMY:\n{taxonomy}"

for f in next_10_files:
    print(f"\n--- Processing: {f['name']} (Mime: {f['mimeType']}) ---")
    content_part = f"FILENAME: {f['name']}\nDATE: {f['modifiedTime']}\nCONTENT: "
    try:
        if 'google-apps.document' in f['mimeType']:
            txt = drive_service.files().export_media(fileId=f['id'], mimeType='text/plain').execute().decode('utf-8')
            content_part += txt[:4000]
        elif 'google-apps.spreadsheet' in f['mimeType']:
            txt = drive_service.files().export_media(fileId=f['id'], mimeType='text/csv').execute().decode('utf-8')
            content_part += txt[:4000]
        elif f['mimeType'].startswith('text/'):
            txt = drive_service.files().get_media(fileId=f['id']).execute().decode('utf-8')
            content_part += txt[:4000]
        else:
            content_part += "[Content extraction skipped for dry run binary/pdf]"
    except Exception as e:
        content_part += f"[Error extracting: {e}]"

    try:
        response = gemini_client.models.generate_content(
            model=RETRO_MODEL,
            contents=[system_prompt, content_part],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        data = json.loads(response.text)
        print(f"PROPOSED NAME: {data.get('filename')}")
        print(f"PROPOSED PATH: {data.get('concat_path')}")
        print(f"SUMMARY:      {data.get('summary')}")
    except Exception as e:
        print(f"AI ERROR: {e}")

