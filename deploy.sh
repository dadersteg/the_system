#!/bin/bash

# Always run from the directory where this script lives (the repo root),
# regardless of where the user invoked it from.
cd "$(dirname "$0")" || exit 1

# Verify that exactly one argument is passed
if [ "$#" -ne 1 ]; then
  echo "Error: Exactly one argument is required."
  echo "Usage: ./deploy.sh [private|work]"
  exit 1
fi

# Case-insensitive validation and normalization
case "$1" in
  [Pp][Rr][Ii][Vv][Aa][Tt][Ee])
    ENV="private"
    ;;
  [Ww][Oo][Rr][Kk])
    ENV="work"
    ;;
  *)
    echo "Error: Invalid environment '$1'. Must be 'private' or 'work'."
    echo "Usage: ./deploy.sh [private|work]"
    exit 1
    ;;
esac

# Locate clasp files
CONFIG_SOURCE=".clasp-$ENV.json"
CONFIG_DEST=".clasp.json"

if [ ! -f "$CONFIG_SOURCE" ]; then
  echo "Error: Configuration file $CONFIG_SOURCE does not exist."
  exit 1
fi

# Copy the file
cp "$CONFIG_SOURCE" "$CONFIG_DEST" || { echo "Error: Failed to copy config file."; exit 1; }
echo "Active clasp configuration set to: $CONFIG_SOURCE"

# Perform push
echo "Pushing code via clasp to Google Apps Script ($ENV)..."
clasp push

if [ $? -eq 0 ]; then
  echo "Successfully deployed to $ENV!"
else
  echo "clasp push failed. Please check if you are logged in using clasp login or if clasp has permissions."
  exit 1
fi
