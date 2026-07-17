#!/bin/bash
# Second Brain Pipeline: Runs hourly to consolidate data, sync to GitHub, and trigger Jules synthesis.

# 1. Run consolidation script
echo "[$(date)] Step 1: Running Daily Second Brain Sync..."
cd "/Users/daniel/Documents/AGY/the_system" || exit 1
/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3 scripts/utils/daily_second_brain_sync.py

# 2. Sync Database to GitHub
echo "[$(date)] Step 2: Synchronizing Second Brain DB to GitHub..."
cd "/Users/daniel/Developer/second_brain_db" || exit 1
if [[ -n $(git status -s) ]]; then
  echo "Changes detected in DB. Synchronizing..."
  git add -A
  git commit -m "chore(auto): second brain sync - $(date '+%Y-%m-%d %H:%M:%S')"
  
  # Check if remote origin exists before pushing
  if git remote | grep -q 'origin'; then
    git pull --rebase origin main || echo "No remote main branch yet or rebase failed."
    git push origin main || echo "Failed to push to remote."
  else
    echo "No remote origin configured yet. Skipping push."
  fi
else
  echo "No local changes in DB."
fi

echo "[$(date)] Second Brain Pipeline Complete."
