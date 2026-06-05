#!/bin/bash

# ==============================================================================
# Antigravity Telegram Bridge Startup Script
# ==============================================================================

# 1. Environment variables for the Telegram Bot
# Replace these with your actual Token and Telegram User ID before running
export TELEGRAM_BOT_TOKEN="8624910336:AAEaK9eyryEMrZ8QzhD7sj_h1QDfNpZMl08"
export TELEGRAM_USER_ID="5379934761"

echo "========================================="
echo " Starting Antigravity + Telegram Bridge"
echo "========================================="

# 2. Check for required Python dependencies and install if missing
echo "[1/3] Checking dependencies..."
pip3 install -q python-telegram-bot websockets
if [ $? -ne 0 ]; then
    echo "❌ Failed to install required pip packages. Please check your Python environment."
    exit 1
fi
echo "✅ Dependencies ready."

# 3. Start Antigravity with remote debugging port 9333
# NOTE: Replace the command below with your actual Antigravity startup command!
echo "[2/3] Starting Antigravity debugging server on port 9333..."

# Start the macOS Antigravity application with the remote debugging port
open -a /Applications/Antigravity.app --args --remote-debugging-port=9333

echo "⏳ Waiting 5 seconds for Antigravity to spin up..."
sleep 5

# 4. Start the Python Telegram Bridge
echo "[3/3] Starting Python Telegram Bridge..."
python3 src/telegram_antigravity_bridge.py

# Wait for background processes to finish (if any)
wait
