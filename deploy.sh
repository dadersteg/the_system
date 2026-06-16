#!/bin/bash

# Always run from the directory where this script lives (the repo root),
# regardless of where the user invoked it from.
cd "$(dirname "$0")" || exit 1

# Check if target environment is provided
if [ -z "$1" ]; then
  echo "Error: Please specify target environment."
  echo "Usage: ./deploy.sh [private|work]"
  exit 1
fi

ENV=$(echo "$1" | tr '[:upper:]' '[:lower:]')

if [ "$ENV" != "private" ] && [ "$ENV" != "work" ]; then
  echo "Error: Invalid environment. Must be 'private' or 'work'."
  echo "Usage: ./deploy.sh [private|work]"
  exit 1
fi

# Locate clasp files
CONFIG_SOURCE=".clasp-$ENV.json"
CONFIG_DEST=".clasp.json"

if [ ! -f "$CONFIG_SOURCE" ]; then
  echo "Error: Configuration file $CONFIG_SOURCE does not exist."
  exit 1
fi

# Copy the file
cp "$CONFIG_SOURCE" "$CONFIG_DEST"
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
