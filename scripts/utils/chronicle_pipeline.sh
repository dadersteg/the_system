#!/bin/bash
# Chronicle Pipeline: Runs hourly to consolidate data, sync to GitHub, and trigger Jules synthesis.

# Ensure we are in the workspace
cd "/Users/daniel/Documents/AGY/the_system" || exit 1

echo "[$(date)] Step 1: Consolidating Chronicle Data..."
/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3 scripts/utils/consolidate_chronicle.py

echo "[$(date)] Step 2: Synchronizing to GitHub..."
# Check if there are any changes
if [[ -n $(git status -s) ]]; then
  echo "Changes detected. Synchronizing..."
  git add -A
  git commit -m "chore(auto): chronicle pipeline sync - $(date '+%Y-%m-%d %H:%M:%S')"
  git pull --rebase origin main
  git push origin main
else
  echo "No local changes detected. Pulling remote Jules updates..."
  git fetch origin main
  if [[ $(git rev-parse HEAD) != $(git rev-parse @{u}) ]]; then
    git pull --rebase origin main
  fi
fi

echo "[$(date)] Step 3: Triggering Jules Hourly Synthesis..."
node scripts/maintenance/trigger_jules.js --chronicle

echo "[$(date)] Chronicle Pipeline Complete."
