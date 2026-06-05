import os
import shutil
import time

def sync_bookmarks():
    chrome_path = os.path.expanduser('~/Library/Application Support/Google/Chrome/Profile 1/Bookmarks')
    backup_dir = 'docs/Bookmarks'
    os.makedirs(backup_dir, exist_ok=True)
    
    if os.path.exists(chrome_path):
        backup_path = os.path.join(backup_dir, 'Chrome_Bookmarks_Backup.json')
        shutil.copy2(chrome_path, backup_path)
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Bookmarks successfully synced to {backup_path}")
    else:
        print(f"Error: Chrome Bookmarks file not found at {chrome_path}")

if __name__ == '__main__':
    sync_bookmarks()
