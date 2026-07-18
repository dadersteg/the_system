#!/usr/bin/env python3
import os
import json
import requests
import datetime
import re
import time
import csv
import argparse
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from lib.config import PRIVATE_SPREADSHEET_ID, SHEET_TOKEN_PATH
from lib.google_auth import get_service

def get_sheets_service():
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    return get_service('sheets', 'v4', SHEET_TOKEN_PATH, account_name="Sheets Log")

def get_gemini_api_key():
    return os.environ.get("SYSTEM_GEMINI_API_KEY")

def call_gemini_flash(prompt_text):
    api_key = get_gemini_api_key()
    if not api_key:
        print("Missing SYSTEM_GEMINI_API_KEY")
        return ""
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.0
        }
    }
    try:
        r = requests.post(url, json=payload, timeout=60)
        data = r.json()
        if "candidates" in data and len(data["candidates"]) > 0:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            print(f"Gemini API returned unexpected structure: {data}")
            return ""
    except Exception as e:
        print(f"Gemini error: {e}")
        return ""

def process_brain(max_hours):
    global_start_time = datetime.datetime.now()
    brain_dir = "/Users/daniel/.gemini/antigravity/brain"
    service = get_sheets_service()
    
    # 1. Fetch existing Convo IDs to avoid duplicates
    print("Fetching existing logs from Google Sheets...")
    existing_ids = set()
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=PRIVATE_SPREADSHEET_ID,
            range="'5 Import - Antigravity Log'!B:B"
        ).execute()
        rows = result.get('values', [])
        for r in rows:
            if r:
                existing_ids.add(r[0])
        print(f"Found {len(existing_ids)} existing conversation records in the sheet.")
    except Exception as e:
        print(f"Warning: Could not fetch existing records ({e}). Proceeding without skipping...")

    # Get all conversations
    convo_ids = [d for d in os.listdir(brain_dir) if os.path.isdir(os.path.join(brain_dir, d))]
    total = len(convo_ids)
    print(f"Found {total} total local conversations to evaluate.")
    
    for i, c_id in enumerate(convo_ids, 1):
        if max_hours:
            elapsed_hours = (datetime.datetime.now() - global_start_time).total_seconds() / 3600.0
            if elapsed_hours >= max_hours:
                print(f"\n[TIME LIMIT] Reached {max_hours} hours. Stopping backfill early.")
                break
                
        if c_id in existing_ids:
            print(f"[{i}/{total}] Skipping {c_id} (Already exists in Sheet)")
            continue
            
        log_path = os.path.join(brain_dir, c_id, ".system_generated/logs/transcript.jsonl")
        if not os.path.exists(log_path):
            print(f"[{i}/{total}] Skipping {c_id} (No transcript found)")
            continue
            
        print(f"[{i}/{total}] Analyzing {c_id} with Gemini 3.1 Flash-Lite... ", end="", flush=True)
        start_time = datetime.datetime.now()
        
        messages = []
        created_date = None
        with open(log_path, 'r') as f:
            for line in f:
                try:
                    step = json.loads(line)
                    if not created_date and "created_at" in step:
                        created_date = step["created_at"]
                    if step.get("type") in ["USER_INPUT", "PLANNER_RESPONSE"]:
                        content = step.get("content", "")
                        if content:
                            messages.append(f"[{step.get('type')}] {content}")
                except Exception:
                    pass
                    
        if not messages:
            print("Empty transcript.")
            continue
            
        if not created_date:
            stat = os.stat(log_path)
            created_date = datetime.datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S')
        else:
            created_date = created_date.replace("T", " ").replace("Z", "")
            
        current_date = datetime.datetime.now().strftime('%Y-%m-%d')
        
        # Compress transcript for context window and execution speed
        full_transcript = "\n".join(messages)
        if len(full_transcript) > 6000:
            # Gemma 26B can take a very long time on huge contexts. We trim to first 2000 and last 4000 chars.
            compressed = full_transcript[:2000] + "\n\n...[MIDDLE TRUNCATED]...\n\n" + full_transcript[-4000:]
        else:
            compressed = full_transcript
            
        # Load the advanced teamwork-designed prompt template
        template_path = "/Users/daniel/Documents/AGY/the_system/scripts/utils/prompt_template.md"
        with open(template_path, "r", encoding="utf-8") as tf:
            template = tf.read()
            
        prompt = template.replace("{{TRANSCRIPT_DATA}}", compressed)
        
        response = call_gemini_flash(prompt)
        
        # Clean markdown
        response = response.strip()
        response = re.sub(r'^```json\s*', '', response)
        response = re.sub(r'^```\s*', '', response)
        response = re.sub(r'\s*```$', '', response)
        
        try:
            parsed = json.loads(response.strip())
        except Exception as e:
            print(f"\n[DEBUG] JSON parsing failed: {e}")
            print(f"[DEBUG] Raw Gemma Output:\n---\n{response}\n---\n")
            parsed = {
                "agent_role": "Unknown",
                "title": "Failed to Parse",
                "purpose": "Error parsing Gemini output",
                "summary": "N/A"
            }
            
        elapsed = (datetime.datetime.now() - start_time).total_seconds()
        print(f"Done in {elapsed:.1f}s -> [{parsed.get('agent_role', 'Unknown')}] '{parsed.get('title', 'Unknown')}'")
            
        row = [
            current_date,
            c_id,
            parsed.get("agent_role", "Main User"),
            parsed.get("title", "Unknown Name"),
            created_date,
            parsed.get("purpose", ""),
            parsed.get("summary", "")
        ]
        
        # 1. Fallback: Append to local CSV
        csv_file = "/Users/daniel/Documents/AGY/the_system/scripts/utils/antigravity_logs_backup.csv"
        file_exists = os.path.exists(csv_file)
        try:
            with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["Date", "Convo ID", "Type", "Name of Convo", "Convo Created Date", "Purpose of Convo", "Summary of work last 24 hours"])
                writer.writerow(row)
        except Exception as e:
            print(f"   [!] Failed to write to CSV fallback: {e}")

        # 2. Append immediately so we don't lose data if it crashes.
        # Add retry logic because Google API drops the connection ('Connection reset by peer') if Gemma takes 5+ mins
        body = {'values': [row]}
        max_retries = 3
        for attempt in range(max_retries):
            try:
                service.spreadsheets().values().append(
                    spreadsheetId=PRIVATE_SPREADSHEET_ID,
                    range="'5 Import - Antigravity Log'!A2",
                    valueInputOption="USER_ENTERED",
                    body=body
                ).execute()
                break # Success!
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"\n   [!] Sheet connection error: {e}. Re-authenticating and retrying in 2s...")
                    time.sleep(2)
                    service = get_sheets_service() # Refresh connection
                else:
                    print(f"\n   [!] Failed to append to sheet after {max_retries} attempts: {e}")

    print("Backfill complete!")
        
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill Antigravity logs")
    parser.add_argument("--max-hours", type=float, default=None, help="Stop script after running for this many hours.")
    args = parser.parse_args()
    
    try:
        process_brain(args.max_hours)
    finally:
        pass
