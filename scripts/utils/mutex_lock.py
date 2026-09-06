#!/usr/bin/env python3
"""
scripts/utils/mutex_lock.py
Universal, static CLI utility for managing Antigravity pipeline mutex locks.
Eliminates inline python (-c) and compound shell commands (&&), enabling
Antigravity's prefix-matching engine to permanently auto-approve locks.

Usage:
  python3 scripts/utils/mutex_lock.py acquire --name clerk_notes [--ttl 180]
  python3 scripts/utils/mutex_lock.py release --name clerk_notes
  python3 scripts/utils/mutex_lock.py check --name clerk_notes
"""

import os
import sys
import time
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCRATCH_DIR = BASE_DIR / "scratch"

def get_lock_path(name: str) -> Path:
    clean_name = name.strip().lower().replace("-", "_")
    return SCRATCH_DIR / f".{clean_name}_sweep.lock"

def acquire_lock(name: str, ttl_seconds: int = 180) -> bool:
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = get_lock_path(name)
    now = time.time()
    
    if lock_file.exists():
        try:
            mtime = lock_file.stat().st_mtime
            if now - mtime < ttl_seconds:
                print(f"[MUTEX] Active lock held for '{name}' (age: {int(now - mtime)}s < TTL {ttl_seconds}s). Exiting.")
                sys.exit(1)
            else:
                print(f"[MUTEX] Stale lock detected for '{name}' (age: {int(now - mtime)}s > TTL {ttl_seconds}s). Overriding.")
        except Exception:
            pass
            
    lock_file.write_text(str(now), encoding="utf-8")
    print(f"[MUTEX] Successfully acquired lock for '{name}'.")
    sys.exit(0)

def release_lock(name: str) -> bool:
    lock_file = get_lock_path(name)
    if lock_file.exists():
        try:
            lock_file.unlink()
            print(f"[MUTEX] Successfully released lock for '{name}'.")
        except Exception as e:
            print(f"[MUTEX] Warning: Failed to remove lock file: {e}")
    else:
        print(f"[MUTEX] No active lock found for '{name}'. Clean.")
    sys.exit(0)

def check_lock(name: str, ttl_seconds: int = 180) -> bool:
    lock_file = get_lock_path(name)
    if not lock_file.exists():
        print(f"[MUTEX] Lock for '{name}' is FREE.")
        sys.exit(0)
    now = time.time()
    mtime = lock_file.stat().st_mtime
    if now - mtime < ttl_seconds:
        print(f"[MUTEX] Lock for '{name}' is ACTIVE.")
        sys.exit(1)
    else:
        print(f"[MUTEX] Lock for '{name}' is STALE.")
        sys.exit(2)

def main():
    parser = argparse.ArgumentParser(description="Antigravity Mutex Lock Manager")
    parser.add_argument("action", choices=["acquire", "release", "check"], help="Lock action")
    parser.add_argument("--name", required=True, help="Pipeline name (e.g. clerk_notes, task_master, clerk_photos)")
    parser.add_argument("--ttl", type=int, default=180, help="Lock TTL in seconds (default: 180)")
    
    args = parser.parse_args()
    if args.action == "acquire":
        acquire_lock(args.name, args.ttl)
    elif args.action == "release":
        release_lock(args.name)
    elif args.action == "check":
        check_lock(args.name, args.ttl)

if __name__ == "__main__":
    main()
