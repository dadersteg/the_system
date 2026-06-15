import os
import json
import csv
import glob
import time
import subprocess
import socket
import urllib.parse
from pathlib import Path
from PIL import Image

# Set a global timeout of 60 seconds for all network connections
socket.setdefaulttimeout(60.0)

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from google import genai
from google.genai import types

# ---------------- CONFIGURATION ----------------
TARGET_DIR = "/Users/daniel/Library/CloudStorage/GoogleDrive-adersteg.daniel@gmail.com/My Drive/consolidated_photos_meta"
OUTPUT_CSV = "/Users/daniel/Documents/AGY/the_system/scratch/photo_register.csv"
OUTPUT_JSON = "/Users/daniel/Documents/AGY/the_system/scratch/photo_register.json"
TEMP_DIR = "/Users/daniel/Temp/processing_frames_meta"
os.makedirs(TEMP_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.m4v'}
MAX_IMAGE_SIZE = (1024, 1024)

client = genai.Client(
    api_key=os.environ.get("SYSTEM_GEMINI_API_KEY"),
    http_options=types.HttpOptions(timeout=60000)
)

PhotoAnalysis = {
    "type": "OBJECT",
    "properties": {
        "category": {"type": "STRING", "description": "The closest match from the user's LOS Taxonomy (e.g. '01 Private/05 Other/03 Collections/Memories')"},
        "purpose": {"type": "STRING", "description": "The suspected intent of saving this image (e.g. 'Travel photo', 'Screenshot of settings', 'Funny meme from Reddit')"},
        "activities": {"type": "ARRAY", "items": {"type": "STRING"}},
        "entities": {"type": "ARRAY", "items": {"type": "STRING"}},
        "text_found": {"type": "ARRAY", "items": {"type": "STRING"}},
        "vibe": {"type": "STRING", "description": "1-3 words describing the emotional tone or aesthetic"},
        "is_milestone": {"type": "BOOLEAN", "description": "True if this looks like a significant life event"}
    },
    "required": ["category", "purpose", "activities", "entities", "text_found", "vibe", "is_milestone"]
}

PROMPT = """Analyze this image or video frames. Provide a highly detailed breakdown following the schema.
For category, pick the best fit from this taxonomy:
- 01 Private/01 Personal Admin
- 01 Private/05 Other/01 Projects
- 01 Private/05 Other/03 Collections/Memories
- 01 Private/05 Other/03 Collections/Useful/Helpful
- 01 Private/05 Other/99 Archive
- 02 Work/01 Employment
- 03 Studies/99 Studies Archive
"""

def extract_metadata_from_filename(filename):
    # Filename format: 2011-06-01_Messenger_Emma_Myresten_5607bf_10152687801593269.jpg
    parts = filename.split('_')
    date_str = parts[0] if len(parts) > 0 else ""
    timestamp = f"{date_str}T12:00:00Z" if len(date_str) == 10 else ""
    
    # We construct a Google Drive search link so the user can instantly open the file
    query = urllib.parse.quote(f'title:"{filename}"')
    url = f"https://drive.google.com/drive/search?q={query}"
    
    # Meta exports don't have lat/lng
    latitude = None
    longitude = None
    
    return url, timestamp, latitude, longitude

def process_image(filepath):
    try:
        img = Image.open(filepath)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail(MAX_IMAGE_SIZE)
        temp_path = os.path.join(TEMP_DIR, "temp_img.jpg")
        img.save(temp_path, "JPEG")
        return [Image.open(temp_path)]
    except Exception as e:
        print(f"Error reading image {filepath}: {e}")
        return []

def get_video_duration(video_path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_path]
    try:
        output = subprocess.check_output(cmd).decode('utf-8').strip()
        return float(output)
    except Exception:
        return 0.0

def process_video(filepath):
    file_size = os.path.getsize(filepath)
    if file_size > 1.5 * 1024 * 1024 * 1024:
        print(f"Skipping {filepath}: Video too large ({file_size / 1e9:.2f} GB).")
        return []

    try:
        duration = get_video_duration(filepath)
        if duration <= 0:
            return []
            
        frames = []
        num_frames = 5
        intervals = [duration * (i / (num_frames + 1)) for i in range(1, num_frames + 1)]
        
        for idx, t in enumerate(intervals):
            temp_frame = os.path.join(TEMP_DIR, f"frame_{idx}.jpg")
            cmd = ["ffmpeg", "-y", "-ss", str(t), "-i", filepath, "-vframes", "1", "-q:v", "2", temp_frame]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            
            if os.path.exists(temp_frame):
                with Image.open(temp_frame) as img:
                    img.thumbnail(MAX_IMAGE_SIZE)
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    final_path = os.path.join(TEMP_DIR, f"final_frame_{idx}.jpg")
                    img.save(final_path, "JPEG")
                    frames.append(Image.open(final_path))
                    
        return frames
        
    except Exception as e:
        print(f"Error processing video {filepath}: {e}")
        return []

def analyze_with_gemini(media_objects):
    if not media_objects:
        return None
        
    safety_settings = [
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=types.HarmBlockThreshold.BLOCK_NONE)
    ]
    
    max_retries = 5
    backoff_factor = 2.0
    
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-3.1-flash-lite',
                contents=media_objects + [PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PhotoAnalysis,
                    safety_settings=safety_settings,
                    temperature=0.2
                ),
            )
            if not response.text:
                return {"category": "01 Private/05 Other", "purpose": "Blocked by AI Safety Filter or Empty Response", "activities": [], "entities": [], "text_found": [], "vibe": "N/A", "is_milestone": False}
            return json.loads(response.text)
        except Exception as e:
            err_msg = str(e)
            if "Safety" in err_msg or "blocked" in err_msg.lower():
                return {"category": "01 Private/05 Other", "purpose": "Blocked by AI Safety Filter", "activities": [], "entities": [], "text_found": [], "vibe": "N/A", "is_milestone": False}
            
            if any(term in err_msg for term in ["503", "429", "ResourceExhausted", "high demand", "UNAVAILABLE"]):
                sleep_time = (backoff_factor ** attempt) + 1.0
                print(f"   -> Got transient API error (attempt {attempt+1}/{max_retries}): {err_msg}. Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
            else:
                print(f"API Error: {err_msg}")
                return None
                
    print("API Error: Maximum retries exceeded for transient error.")
    return None

def write_csv_header():
    if not os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Filename', 'Zip Source', 'Date', 'Latitude', 'Longitude', 'Google Photos URL', 'Category', 'Purpose', 'Activities', 'Entities', 'Text Found', 'Vibe', 'Milestone'])

def append_to_csv(filename, zip_source, date, lat, lng, url, data):
    with open(OUTPUT_CSV, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            filename, zip_source, date, lat, lng, url,
            data.get('category', ''), data.get('purpose', ''),
            ", ".join(data.get('activities', [])), ", ".join(data.get('entities', [])),
            ", ".join(data.get('text_found', [])), data.get('vibe', ''), data.get('is_milestone', False)
        ])

def append_to_json(filename, zip_source, date, lat, lng, url, data):
    record = {}
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
                record = json.load(f)
        except: pass
    record[filename] = {"zip_source": zip_source, "date": date, "latitude": lat, "longitude": lng, "url": url, "ai_analysis": data}
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(record, f, indent=2)

def main():
    write_csv_header()
    
    processed = set()
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
                record = json.load(f)
                processed = set(record.keys())
        except Exception as e:
            print(f"FAILED TO LOAD JSON CACHE: {e}")

    all_files = []
    for ext in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        all_files.extend(glob.glob(os.path.join(TARGET_DIR, f"*{ext}")))
        all_files.extend(glob.glob(os.path.join(TARGET_DIR, f"*{ext.upper()}")))
        
    print(f"Found {len(all_files)} total media files in {TARGET_DIR}")

    # Process files
    for filepath in all_files:
        base_name = os.path.basename(filepath)
        if base_name in processed:
            continue
            
        print(f"Processing: {base_name}")
        
        url, timestamp, lat, lng = extract_metadata_from_filename(base_name)
        
        ext = os.path.splitext(base_name)[1].lower()
        media_objects = []
        
        if ext in IMAGE_EXTENSIONS:
            media_objects = process_image(filepath)
        elif ext in VIDEO_EXTENSIONS:
            media_objects = process_video(filepath)
            
        if not media_objects:
            print(f"   -> Skipped (Could not read media)")
            continue
            
        analysis = analyze_with_gemini(media_objects)
        
        if analysis:
            # zip_source is recorded as 'Meta Direct' for these files
            append_to_json(base_name, "Meta Direct", timestamp, lat, lng, url, analysis)
            append_to_csv(base_name, "Meta Direct", timestamp, lat, lng, url, analysis)
            processed.add(base_name)
            print(f"   -> Category: {analysis.get('category')} | Purpose: {analysis.get('purpose')}")
        else:
            print(f"   -> Failed API call.")
            
        for img in media_objects:
            if hasattr(img, 'close'): img.close()
        time.sleep(1.5)

if __name__ == "__main__":
    main()
