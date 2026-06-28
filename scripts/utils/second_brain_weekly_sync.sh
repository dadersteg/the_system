#!/bin/bash
# Second Brain Pipeline (Weekly): Runs once a week to trigger the Jules weekly synthesis.

echo "[$(date)] Step 1: Triggering Jules Weekly Synthesis..."
cd "/Users/daniel/Documents/AGY/the_system" || exit 1
node scripts/maintenance/trigger_jules.js --chronicle-weekly

echo "[$(date)] Weekly Second Brain Synthesis Triggered."
