#!/bin/bash

# Always run from the directory where this script lives (the repo root),
# regardless of where the user invoked it from.
cd "$(dirname "$0")" || exit 1

# Perform push
echo "Pushing code via clasp to Google Apps Script (Shared Project)..."
clasp push

if [ $? -eq 0 ]; then
  echo "Successfully deployed to the shared Apps Script project!"
else
  echo "clasp push failed. Please check if you are logged in using clasp login or if clasp has permissions."
  exit 1
fi
