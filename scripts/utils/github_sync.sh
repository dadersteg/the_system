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
  
  # Fetch from origin and rebase to seamlessly integrate any Jules changes
  echo "[$(date)] Pulling Jules background changes via rebase..."
  git pull --rebase origin main
  
  # Push to GitHub
  git push origin main
  
  echo "[$(date)] Sync complete."
else
  # Even if there are no local changes, pull Jules' background changes
  echo "[$(date)] No local changes detected. Checking for remote Jules updates..."
  git fetch origin main
  if [[ $(git rev-parse HEAD) != $(git rev-parse @{u}) ]]; then
    echo "[$(date)] Remote changes found. Pulling..."
    git pull --rebase origin main
    echo "[$(date)] Remote changes applied."
  else
    echo "[$(date)] Everything is up to date."
  fi
fi
