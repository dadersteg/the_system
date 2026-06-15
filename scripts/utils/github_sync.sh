#!/bin/bash
# Automatically syncs the_system to GitHub.
# Designed to be run by a cron job or launchd.

cd "/Users/daniel/Documents/AGY/the_system" || exit 1

# Check if there are any changes
if [[ -n $(git status -s) ]]; then
  echo "[$(date)] Changes detected. Synchronizing with GitHub..."
  
  # Stage all changes (respects .gitignore)
  git add -A
  
  # Commit with timestamp
  git commit -m "chore(auto): automated sync - $(date '+%Y-%m-%d %H:%M:%S')"
  
  # Push to GitHub
  git push origin main
  
  echo "[$(date)] Sync complete."
else
  echo "[$(date)] No changes detected."
fi
