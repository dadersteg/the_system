import os
import json
import csv
import time
import requests
from io import BytesIO
from PIL import Image

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google import genai
from google.genai import types

SCOPES = ['https://www.googleapis.com/auth/photoslibrary.readonly']
CREDENTIALS_FILE = '/Users/daniel/Documents/AGY/the_system/auth/credentials.json'
TOKEN_FILE = '/Users/daniel/Documents/AGY/the_system/auth/sync_photos_readonly_token.json'
OUTPUT_CSV = '/Users/daniel/Documents/AGY/the_system/scratch/photo_register.csv'
CACHE_FILE = '/Users/daniel/Documents/AGY/the_system/scratch/processed_google_photos.json'

client = genai.Client(
    api_key=os.environ.get("SYSTEM_GEMINI_API_KEY"),
    http_options=types.HttpOptions(timeout=60000)
)

PhotoAnalysis = {
    "type": "OBJECT",
    "properties": {
        "category": {"type": "STRING"},
        "purpose": {"type": "STRING"},
        "activities": {"type": "ARRAY", "items": {"type": "STRING"}},
        "entities": {"type": "ARRAY", "items": {"type": "STRING"}},
        "text_found": {"type": "ARRAY", "items": {"type": "STRING"}},
        "vibe": {"type": "STRING"},
        "is_milestone": {"type": "BOOLEAN"}
    },
    "required": ["category", "purpose", "activities", "entities", "text_found", "vibe", "is_milestone"]
}

PROMPT = "Analyze this natively synced Google Photo. Provide a highly detailed breakdown following the schema."

def get_creds():
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
    return creds

def analyze_with_gemini(image_bytes):
    try:
        img = Image.open(BytesIO(image_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail((1024, 1024))
        
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=[img, PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PhotoAnalysis,
                temperature=0.2
            ),
        )
        return json.loads(response.text) if response.text else None
    except Exception as e:
        print(f"Gemini error: {e}")
        return None

def append_to_csv(filename, source, date, url, data):
    if not os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Filename', 'Source', 'Date', 'Latitude', 'Longitude', 'Google Photos URL', 'Category', 'Purpose', 'Activities', 'Entities', 'Text Found', 'Vibe', 'Milestone'])
            
    with open(OUTPUT_CSV, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            filename, source, date, "", "", url,
            data.get('category', ''), data.get('purpose', ''),
            ", ".join(data.get('activities', [])), ", ".join(data.get('entities', [])),
            ", ".join(data.get('text_found', [])), data.get('vibe', ''), data.get('is_milestone', False)
        ])

def main():
    creds = get_creds()
    
    processed = []
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            processed = json.load(f)
            
    print("Fetching newly added Google Photos...")
    url = "https://photoslibrary.googleapis.com/v1/mediaItems"
    headers = {"Authorization": f"Bearer {creds.token}"}
    
    new_items = []
    page_token = None
    
    # We paginate through until we hit an ID we already processed.
    while True:
        params = {"pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
            
        res = requests.get(url, headers=headers, params=params)
        if res.status_code != 200:
            print(f"Error fetching photos: {res.text}")
            break
            
        data = res.json()
        items = data.get("mediaItems", [])
        
        hit_cache = False
        for item in items:
            if item["id"] in processed:
                hit_cache = True
                break
            # Only process images for now to save tokens, skip large videos
            if item["mimeType"].startswith("image/"):
                new_items.append(item)
                
        if hit_cache or not data.get("nextPageToken"):
            break
            
        page_token = data.get("nextPageToken")
        
    print(f"Found {len(new_items)} new photos to process.")
    
    for item in reversed(new_items): # Process oldest to newest so if it fails, we keep order
        print(f"Processing photo: {item.get('filename')}")
        
        # Download image bytes (with base URL + =d to get raw bytes or =w1024-h1024 to get smaller image)
        # To save bandwidth and Gemini limits, we download a 1024px version
        img_url = item["baseUrl"] + "=w1024-h1024"
        r = requests.get(img_url)
        if r.status_code != 200:
            print(f" Failed to download image bytes for {item.get('filename')}")
            continue
            
        file_data = r.content
        
        print(" Analyzing with Gemini...")
        analysis = analyze_with_gemini(file_data) or {}
        
        append_to_csv(item.get("filename"), "Native_Google_Photos", item["mediaMetadata"]["creationTime"], item["productUrl"], analysis)
        print(" Added to Photo Register.")
        
        processed.append(item["id"])
        
        with open(CACHE_FILE, 'w') as f:
            json.dump(processed, f)

if __name__ == '__main__':
    main()
