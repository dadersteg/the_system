#!/usr/bin/env python3
import os
import shutil
import json
import argparse
from pathlib import Path

# AGY Workspace Sweeper
# Enforces rules.agy structural constraints across root directories.

TARGET_DIRS = [
    "/Users/daniel/Documents/AGY/the_system",
    "/Users/daniel/Documents/AGY/reflection"
]

WHITELIST = {
    ".env", ".env.example", "ecosystem.config.js", "rules.agy", 
    ".clasp.json", ".clasp-work.json", ".clasp-private.json", ".clasp-private-backup.json", ".claspignore",
    "appsscript.json", "client_secret.json", ".gitignore", "PROJECT.md", "README.md",
    "sim.js", "deploy.sh", "deploy_both.sh", "push_reflection.sh"
}

# Mapping file extensions to their target directories
RULES = [
    (('.py', '.sh'), 'scripts/utils'),
    (('.json', '.gsheet', '.session'), 'data'),
    (('.md',), 'docs'),
    (('.log', '.txt'), 'logs'),
    (('.pdf', '.png', '.jpg'), 'assets')
]

def get_target_subfolder(file_name):
    ext = os.path.splitext(file_name)[1].lower()
    for exts, folder in RULES:
        if ext in exts:
            return folder
    return None

def sweep_directory(root_dir, dry_run=False):
    root_path = Path(root_dir)
    if not root_path.exists() or not root_path.is_dir():
        return []

    actions = []
    
    for item in root_path.iterdir():
        if not item.is_file():
            continue
            
        if item.name in WHITELIST:
            continue
            
        target_folder_name = get_target_subfolder(item.name)
        if not target_folder_name:
            continue
            
        target_dir = root_path / target_folder_name
        target_path = target_dir / item.name
        
        action = {
            "file": item.name,
            "source": str(item),
            "destination": str(target_path)
        }
        actions.append(action)
        
        if not dry_run:
            target_dir.mkdir(parents=True, exist_ok=True)
            if target_path.exists():
                base, ext = os.path.splitext(item.name)
                counter = 1
                while target_path.exists():
                    new_name = f"{base}_{counter}{ext}"
                    target_path = target_dir / new_name
                    counter += 1
                action["destination"] = str(target_path)
            
            shutil.move(str(item), str(target_path))
            print(f"Moved: {item.name} -> {target_dir.name}/")

    return actions

def main():
    parser = argparse.ArgumentParser(description="AGY Workspace Sweeper")
    parser.add_argument("--dry-run", action="store_true", help="Output JSON manifest without moving files")
    args = parser.parse_args()

    all_actions = []
    for d in TARGET_DIRS:
        actions = sweep_directory(d, dry_run=args.dry_run)
        all_actions.extend(actions)
        
    if args.dry_run:
        print(json.dumps(all_actions, indent=2))
    else:
        print(f"\nSweep complete. Moved {len(all_actions)} files.")

if __name__ == "__main__":
    main()
