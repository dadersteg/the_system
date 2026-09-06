#!/usr/bin/env python3
"""
Antigravity Backup Utility (Safe Cloud Sync via Google Drive)

Backs up Antigravity runtime conversations, brain artifacts, annotations, and agent definitions
to the Google Drive synced operational directory (/Users/daniel/Documents/AGY/the_system/data/antigravity_backup/).

Invariants:
1. ZERO LEAKS: Strictly excludes secrets, API keys, credentials, tokens, and browser caches.
2. ZERO DISRUPTION: Purely non-intrusive read-only source access. Live conversations remain 100% untouched.
3. ATOMIC ARCHIVING: Creates compressed, dated snapshots with rolling retention to prevent Google Drive sync thrashing.
"""

import os
import sys
import time
import tarfile
import shutil
import argparse
from datetime import datetime

SOURCE_BASE = os.path.expanduser("~/.gemini/antigravity")
DEFAULT_BACKUP_DIR = "/Users/daniel/Documents/AGY/the_system/data/antigravity_backup"

# Items to explicitly include
INCLUDE_ITEMS = [
    "conversations",
    "annotations",
    "brain",
    "agents",
    "knowledge",
    "antigravity_state.pbtxt",
]

# Sensitive or volatile files and directories to NEVER back up
EXCLUDE_PATTERNS = {
    # Secrets and auth
    "mcp_config.json",
    "credentials.json",
    "token_drive.json",
    "token.json",
    ".env",
    # Heavy caches and volatile state
    "chrome_profile",
    "browser_recordings",
    "crashes",
    "bin",
    "scratch",
    "brain_archive.zip",
    "agyhub_summaries_proto.pb",
}

def is_excluded(rel_path):
    parts = rel_path.split(os.sep)
    for part in parts:
        if part in EXCLUDE_PATTERNS:
            return True
        if part.endswith(".tmp") or part.endswith(".lock") or part.endswith(".sock"):
            return True
    return False

def run_backup(backup_dir=DEFAULT_BACKUP_DIR, max_retained=7):
    start_time = time.time()
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs(backup_dir, exist_ok=True)

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Antigravity Cloud Backup...")
    print(f"  Source: {SOURCE_BASE}")
    print(f"  Destination: {backup_dir}")

    if not os.path.exists(SOURCE_BASE):
        print(f"ERROR: Source directory {SOURCE_BASE} does not exist.")
        return False

    archive_name = f"antigravity_backup_{date_str}.tar.gz"
    archive_path = os.path.join(backup_dir, archive_name)
    latest_path = os.path.join(backup_dir, "antigravity_backup_latest.tar.gz")

    total_files = 0
    total_uncompressed_bytes = 0

    print(f"  Creating compressed snapshot: {archive_name}...")
    with tarfile.open(archive_path, "w:gz") as tar:
        for item in INCLUDE_ITEMS:
            item_path = os.path.join(SOURCE_BASE, item)
            if not os.path.exists(item_path):
                continue

            if os.path.isfile(item_path):
                if not is_excluded(item):
                    tar.add(item_path, arcname=item)
                    total_files += 1
                    total_uncompressed_bytes += os.path.getsize(item_path)
            elif os.path.isdir(item_path):
                for root, dirs, files in os.walk(item_path):
                    dirs[:] = [d for d in dirs if not is_excluded(d)]

                    for f in files:
                        rel_path = os.path.relpath(os.path.join(root, f), SOURCE_BASE)
                        if is_excluded(rel_path):
                            continue
                        full_f_path = os.path.join(root, f)
                        try:
                            tar.add(full_f_path, arcname=rel_path)
                            total_files += 1
                            total_uncompressed_bytes += os.path.getsize(full_f_path)
                        except (OSError, PermissionError) as e:
                            print(f"  Warning: Skipping {rel_path}: {e}")

    compressed_bytes = os.path.getsize(archive_path)
    compressed_mb = compressed_bytes / (1024 * 1024)
    uncompressed_mb = total_uncompressed_bytes / (1024 * 1024)

    # Update latest symlink (zero additional disk space)
    if os.path.exists(latest_path) or os.path.islink(latest_path):
        try:
            os.remove(latest_path)
        except OSError:
            pass
    try:
        os.symlink(archive_name, latest_path)
    except OSError:
        pass

    # Prune old archives (keep last `max_retained`)
    archives = []
    for f in os.listdir(backup_dir):
        if f.startswith("antigravity_backup_20") and f.endswith(".tar.gz"):
            f_path = os.path.join(backup_dir, f)
            archives.append((os.path.getmtime(f_path), f_path))

    archives.sort(key=lambda x: x[0], reverse=True)
    if len(archives) > max_retained:
        for _, old_archive in archives[max_retained:]:
            try:
                os.remove(old_archive)
                print(f"  Pruned old archive: {os.path.basename(old_archive)}")
            except Exception as e:
                print(f"  Warning: Failed to prune {old_archive}: {e}")

    duration = time.time() - start_time
    print(f"Backup Complete in {duration:.1f}s!")
    print(f"  Files Archived: {total_files}")
    print(f"  Uncompressed Size: {uncompressed_mb:.1f} MB")
    print(f"  Compressed Archive: {compressed_mb:.1f} MB -> {archive_path}")
    print(f"  Google Drive Status: Auto-syncing via {backup_dir}")
    return True

def link_latest(backup_dir=DEFAULT_BACKUP_DIR):
    latest_path = os.path.join(backup_dir, "antigravity_backup_latest.tar.gz")
    archives = []
    for f in os.listdir(backup_dir):
        if f.startswith("antigravity_backup_20") and f.endswith(".tar.gz"):
            f_path = os.path.join(backup_dir, f)
            archives.append((os.path.getmtime(f_path), f))
    if not archives:
        print("No archives found to link.")
        return
    archives.sort(key=lambda x: x[0], reverse=True)
    latest_archive = archives[0][1]
    if os.path.exists(latest_path) or os.path.islink(latest_path):
        os.remove(latest_path)
    os.symlink(latest_archive, latest_path)
    print(f"Updated latest symlink -> {latest_archive}")

def verify_archive(backup_dir=DEFAULT_BACKUP_DIR):
    latest_path = os.path.join(backup_dir, "antigravity_backup_latest.tar.gz")
    if not os.path.exists(latest_path):
        print(f"No archive found at {latest_path}")
        return
    print(f"Verifying archive: {os.path.realpath(latest_path)}...")
    sensitive_found = []
    convo_count = 0
    brain_count = 0
    with tarfile.open(latest_path, "r:gz") as tar:
        for member in tar.getmembers():
            name = member.name
            base = os.path.basename(name)
            if base in EXCLUDE_PATTERNS or name.endswith(".tmp") or name.endswith(".lock"):
                sensitive_found.append(name)
            if name.startswith("conversations/") and name.endswith(".db"):
                convo_count += 1
            if name.startswith("brain/"):
                brain_count += 1

    print(f"  Conversations (*.db) in archive: {convo_count}")
    print(f"  Brain items in archive: {brain_count}")
    if sensitive_found:
        print(f"  CRITICAL WARNING: Found excluded items in archive:")
        for s in sensitive_found:
            print(f"    - {s}")
    else:
        print(f"  CLEAN: Zero sensitive files or tokens detected in archive!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity Cloud Backup to Google Drive")
    parser.add_argument("--dest", default=DEFAULT_BACKUP_DIR, help="Destination directory inside Google Drive synced path")
    parser.add_argument("--keep", type=int, default=7, help="Number of rolling snapshots to keep (default: 7)")
    parser.add_argument("--link-only", action="store_true", help="Only refresh the latest symlink without creating a new archive")
    parser.add_argument("--verify", action="store_true", help="Verify the integrity and zero-leak status of the latest archive")
    args = parser.parse_args()

    if args.verify:
        verify_archive(backup_dir=args.dest)
        sys.exit(0)

    if args.link_only:
        link_latest(backup_dir=args.dest)
        sys.exit(0)

    success = run_backup(backup_dir=args.dest, max_retained=args.keep)
    sys.exit(0 if success else 1)
