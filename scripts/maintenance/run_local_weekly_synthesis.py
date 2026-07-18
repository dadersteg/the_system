#!/usr/bin/env python3
import os
import json
import time
import requests
from datetime import datetime

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
import lib.config

DAILY_DIR = os.path.expanduser("~/Developer/second_brain_db/insights/daily/")
WEEKLY_DIR = os.path.expanduser("~/Developer/second_brain_db/insights/weekly/")

def get_api_key():
    key = os.environ.get("SYSTEM_GEMINI_API_KEY")
    if not key:
        print("Error: SYSTEM_GEMINI_API_KEY not found in .env")
    return key

def main():
    api_key = get_api_key()
    if not api_key:
        return

    os.makedirs(WEEKLY_DIR, exist_ok=True)

    # 1. Read all daily files and parse dates
    daily_files = sorted([f for f in os.listdir(DAILY_DIR) if f.endswith("_insight.md")])
    if not daily_files:
        print("No daily insights found to synthesize.")
        return

    # Extract dates and group by ISO week
    weeks_data = {}
    global_max_date = ""

    for f in daily_files:
        date_str = f.replace("_insight.md", "")
        global_max_date = max(global_max_date, date_str)
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            iso_year, iso_week, _ = dt.isocalendar()
            # Format as YYYY-Www, e.g., 2008-W05
            week_str = f"{iso_year}-W{iso_week:02d}"
            
            if week_str not in weeks_data:
                weeks_data[week_str] = []
            weeks_data[week_str].append({
                "date": date_str,
                "file": f
            })
        except ValueError:
            continue

    total_processed = 0
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    for week_str in sorted(weeks_data.keys()):
        out_path = os.path.join(WEEKLY_DIR, f"{week_str}_insight.md")
        if os.path.exists(out_path):
            continue

        days = weeks_data[week_str]
        week_max_date = max(d["date"] for d in days)

        # Safety Check: If this week contains the most recent global date, 
        # it means the daily worker might still be adding days to this week! 
        # We must skip it until the daily worker moves on to the next week.
        if week_max_date == global_max_date:
            print(f"Skipping {week_str} because it contains the global maximum date ({global_max_date}). Awaiting completion.")
            continue

        print(f"Processing {week_str}...")

        # Construct the payload
        daily_content_blocks = []
        for d in days:
            with open(os.path.join(DAILY_DIR, d["file"]), "r", encoding="utf-8") as f_in:
                content = f_in.read().strip()
                daily_content_blocks.append(f"### {d['date']}\n{content}")

        all_daily_content = "\n\n".join(daily_content_blocks)

        prompt = (
            "**TASK: Chronicle Weekly Synthesis**\n"
            f"You are synthesizing the weekly events for {week_str}.\n"
            "1. Below are the daily insight markdown files that occurred during this week.\n"
            "2. Aggregate, summarize, and synthesize the broader trends, major accomplishments, and systemic shifts that occurred over the week.\n"
            "3. Maximize your deep synthesis capabilities. Weave the factual events into a cohesive weekly narrative.\n"
            "4. Do NOT include Markdown code blocks (```markdown) in your output. Output raw markdown only.\n"
            "5. If there is absolutely no meaningful data to synthesize for the week, explicitly state 'No new data to synthesize for this week.'\n"
            "\n---\n\n"
            f"{all_daily_content}\n"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }

        try:
            res = requests.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            
            try:
                insight_text = data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                print(f" -> Unexpected API response format for {week_str}")
                continue
            
            with open(out_path, "w", encoding="utf-8") as f_out:
                f_out.write(insight_text.strip())
                
            print(f" -> Successfully saved {week_str}_insight.md")
            total_processed += 1

            # Polite delay to respect API rate limits
            time.sleep(4)
            
        except Exception as e:
            print(f" -> Failed to process {week_str}: {e}")
            break

    print(f"Weekly batch complete. Processed: {total_processed}")

if __name__ == "__main__":
    main()
