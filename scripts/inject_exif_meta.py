import os
import glob
import subprocess
import concurrent.futures

TARGET_DIR = "/Users/daniel/Library/CloudStorage/GoogleDrive-adersteg.daniel@gmail.com/My Drive/consolidated_photos_meta"

def process_file(filepath):
    filename = os.path.basename(filepath)
    # Filename format: YYYY-MM-DD_Platform_Contact_...
    parts = filename.split('_')
    if len(parts) < 2:
        return f"Skipped {filename} (Invalid format)"
        
    date_str = parts[0]
    # Check if it looks like a date
    if len(date_str) != 10 or date_str.count('-') != 2:
        return f"Skipped {filename} (No date prefix)"
        
    exif_date = date_str.replace('-', ':') + " 12:00:00"
    
    cmd = [
        "exiftool",
        f"-DateTimeOriginal={exif_date}",
        f"-CreateDate={exif_date}",
        f"-ModifyDate={exif_date}",
        "-overwrite_original",
        "-quiet",
        filepath
    ]
    
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"Processed {filename} -> {exif_date}"
    except subprocess.CalledProcessError:
        return f"Failed {filename}"

def main():
    media_files = []
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.mp4', '*.mov']:
        media_files.extend(glob.glob(os.path.join(TARGET_DIR, ext)))
        media_files.extend(glob.glob(os.path.join(TARGET_DIR, ext.upper())))
        
    print(f"Found {len(media_files)} files to process.")
    
    # Process using a thread pool to speed up subprocess calls
    success_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_file, f): f for f in media_files}
        
        for i, future in enumerate(concurrent.futures.as_completed(futures)):
            result = future.result()
            if result.startswith("Processed"):
                success_count += 1
            if (i + 1) % 100 == 0:
                print(f"Progress: {i + 1}/{len(media_files)} processed.")
                
    print(f"Done. Successfully injected EXIF data into {success_count}/{len(media_files)} files.")

if __name__ == "__main__":
    main()
