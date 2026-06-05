import os
import json
import csv
import glob
import time
import subprocess
import zipfile
import socket
from pathlib import Path
from io import BytesIO
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
TAKEOUT_DIR = "/Users/daniel/Temp"
OUTPUT_CSV = "/Users/daniel/Documents/the_system/scratch/photo_register.csv"
OUTPUT_JSON = "/Users/daniel/Documents/the_system/scratch/photo_register.json"
TEMP_DIR = "/Users/daniel/Temp/processing_frames"
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

def extract_metadata_from_zip(zf, media_path, json_set):
    dir_name = os.path.dirname(media_path)
    base_name = os.path.basename(media_path)
    base_no_ext = os.path.splitext(base_name)[0]
    
    short_base = base_name[:25]
    short_no_ext = base_no_ext[:25]

    candidates = [j for j in json_set if os.path.dirname(j) == dir_name]
    
    matched_json = None
    for j in candidates:
        j_base = os.path.basename(j)
        if j_base == f"{base_name}.json" or \
           j_base == f"{base_name}.supplemental-metadata.json" or \
           j_base == f"{base_no_ext}.json" or \
           j_base == f"{base_no_ext}.supplemental-metadata.json":
            matched_json = j
            break
        if j_base.startswith(short_base) or j_base.startswith(short_no_ext):
            matched_json = j
            
    url = ""
    timestamp = ""
    latitude = None
    longitude = None
    
    if matched_json:
        try:
            with zf.open(matched_json) as jf:
                data = json.load(jf)
                url = data.get("url", "")
                if "photoTakenTime" in data and "timestamp" in data["photoTakenTime"]:
                    ts = int(data["photoTakenTime"]["timestamp"])
                    timestamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(ts))
                geo = data.get("geoData", {})
                if geo.get("latitude") not in (0.0, None) or geo.get("longitude") not in (0.0, None):
                    latitude = geo.get("latitude")
                    longitude = geo.get("longitude")
                if latitude is None or longitude is None:
                    geo_exif = data.get("geoDataExif", {})
                    if geo_exif.get("latitude") not in (0.0, None) or geo_exif.get("longitude") not in (0.0, None):
                        latitude = geo_exif.get("latitude")
                        longitude = geo_exif.get("longitude")
        except Exception:
            pass
            
    return url, timestamp, latitude, longitude

def process_image_from_zip(zf, media_name):
    try:
        with zf.open(media_name) as f:
            img_data = f.read()
            img = Image.open(BytesIO(img_data))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.thumbnail(MAX_IMAGE_SIZE)
            temp_path = os.path.join(TEMP_DIR, "temp_img.jpg")
            img.save(temp_path, "JPEG")
            return [Image.open(temp_path)]
    except Exception as e:
        print(f"Error reading image {media_name}: {e}")
        return []

def get_video_duration(video_path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_path]
    try:
        output = subprocess.check_output(cmd).decode('utf-8').strip()
        return float(output)
    except Exception:
        return 0.0

def process_video_from_zip(zf, zip_info):
    if zip_info.file_size > 1.5 * 1024 * 1024 * 1024:
        print(f"Skipping {zip_info.filename}: Video too large ({zip_info.file_size / 1e9:.2f} GB) for remaining disk space.")
        return []

    temp_vid_path = os.path.join(TEMP_DIR, "temp_video.mp4")
    
    try:
        with zf.open(zip_info.filename) as source, open(temp_vid_path, "wb") as target:
            target.write(source.read())
            
        duration = get_video_duration(temp_vid_path)
        if duration <= 0:
            return []
            
        frames = []
        num_frames = 5
        intervals = [duration * (i / (num_frames + 1)) for i in range(1, num_frames + 1)]
        
        for idx, t in enumerate(intervals):
            temp_frame = os.path.join(TEMP_DIR, f"frame_{idx}.jpg")
            cmd = ["ffmpeg", "-y", "-ss", str(t), "-i", temp_vid_path, "-vframes", "1", "-q:v", "2", temp_frame]
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
        print(f"Error processing video {zip_info.filename}: {e}")
        return []
    finally:
        if os.path.exists(temp_vid_path):
            os.remove(temp_vid_path)

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

    zip_files = glob.glob(os.path.join(TAKEOUT_DIR, "*.zip"))
    zip_files.sort()
    
    if not zip_files:
        print(f"No zip files found in {TAKEOUT_DIR}")
        return

    for zip_path in zip_files:
        zip_filename = os.path.basename(zip_path)
        print(f"\n--- Opening {zip_filename} ---")
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                all_files = zf.infolist()
                
                json_files = {f.filename for f in all_files if f.filename.endswith('.json')}
                media_infos = [f for f in all_files if f.filename.lower().endswith(tuple(IMAGE_EXTENSIONS | VIDEO_EXTENSIONS))]
                
                for info in media_infos:
                    base_name = os.path.basename(info.filename)
                    if not base_name or base_name.startswith('.'):
                        continue
                        
                    if base_name in processed:
                        continue
                        
                    print(f"Processing: {base_name}")
                    
                    url, timestamp, lat, lng = extract_metadata_from_zip(zf, info.filename, json_files)
                    
                    ext = os.path.splitext(base_name)[1].lower()
                    media_objects = []
                    
                    if ext in IMAGE_EXTENSIONS:
                        media_objects = process_image_from_zip(zf, info.filename)
                    elif ext in VIDEO_EXTENSIONS:
                        media_objects = process_video_from_zip(zf, info)
                        
                    if not media_objects:
                        print(f"   -> Skipped (Could not read media)")
                        continue
                        
                    analysis = analyze_with_gemini(media_objects)
                    
                    if analysis:
                        append_to_json(base_name, zip_filename, timestamp, lat, lng, url, analysis)
                        append_to_csv(base_name, zip_filename, timestamp, lat, lng, url, analysis)
                        processed.add(base_name)
                        print(f"   -> Category: {analysis.get('category')} | Purpose: {analysis.get('purpose')}")
                    else:
                        print(f"   -> Failed API call.")
                        
                    for img in media_objects:
                        if hasattr(img, 'close'): img.close()
                    time.sleep(1.5)
                    
        except zipfile.BadZipFile:
            print(f"Error: {zip_filename} is not a valid zip file or is corrupted.")

if __name__ == "__main__":
    main()
