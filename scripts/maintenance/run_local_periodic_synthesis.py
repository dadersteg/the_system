#!/usr/bin/env python3
import os
import json
import time
import requests
import re
from datetime import datetime

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

WEEKLY_DIR = os.path.expanduser("~/Developer/second_brain_db/insights/weekly/")
SYNTHESIS_BASE_DIR = os.path.expanduser("~/Documents/AGY/the_system/docs/second_brain_synthesis")
MONTHLY_DIR = os.path.join(SYNTHESIS_BASE_DIR, "monthly")
YEARLY_DIR = os.path.join(SYNTHESIS_BASE_DIR, "yearly")

def get_api_key():
    env_paths = [
        "/Users/daniel/Documents/AGY/the_system/.env",
        "/Users/daniel/Developer/the_system/.env"
    ]
    
    env_path = None
    for p in env_paths:
        if os.path.exists(p):
            env_path = p
            break
            
    if not env_path:
        print(f"Could not find .env in any expected location.")
        return None
    
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith("SYSTEM_GEMINI_API_KEY="):
                val = line.split("=", 1)[1].strip()
                return val.strip("'").strip('"')
    
    print("SYSTEM_GEMINI_API_KEY not found in .env")
    return None

def call_gemini_pro(api_key, prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            res = requests.post(url, json=payload, timeout=60)
            res.raise_for_status()
            data = res.json()
            
            content_obj = data.get('candidates', [{}])[0].get('content', {})
            if 'parts' in content_obj and len(content_obj['parts']) > 0 and 'text' in content_obj['parts'][0]:
                return content_obj['parts'][0]['text']
            else:
                return "No new data to synthesize for this period."
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                print(f"Gemini API Error: {e}")
                raise e

def get_5_year_block(year_str):
    year_int = int(year_str)
    start_year = year_int - ((year_int - 1) % 5)
    return f"{start_year}-{start_year+4}"

def process_monthly(api_key):
    os.makedirs(MONTHLY_DIR, exist_ok=True)
    
    weekly_files = sorted([f for f in os.listdir(WEEKLY_DIR) if f.endswith("_insight.md")])
    if not weekly_files:
        print("No weekly insights found to synthesize.")
        return

    # Group weekly files by Month
    months_data = {}
    global_max_week = ""

    for f in weekly_files:
        week_str = f.replace("_insight.md", "")
        global_max_week = max(global_max_week, week_str)
        try:
            # Parse ISO year and week to get the Monday of that week
            dt = datetime.strptime(week_str + '-1', "%G-W%V-%u")
            month_str = dt.strftime("%Y-%m")
            
            if month_str not in months_data:
                months_data[month_str] = []
            months_data[month_str].append({
                "week": week_str,
                "file": f
            })
        except ValueError as e:
            print(f"Error parsing date for {f}: {e}")
            continue

    total_processed = 0

    for month_str in sorted(months_data.keys()):
        year_str = month_str.split('-')[0]
        block_name = get_5_year_block(year_str)
        out_path = os.path.join(MONTHLY_DIR, f"{block_name}_Monthly_Rollups.md")
        
        # Check if already processed
        if os.path.exists(out_path):
            with open(out_path, 'r', encoding="utf-8") as f:
                content = f.read()
                if f"### Monthly Synthesis: {month_str}" in content:
                    continue

        weeks = months_data[month_str]
        month_max_week = max(w["week"] for w in weeks)

        # Safety Check: If this month contains the most recent global week, 
        # it means the weekly worker might still be adding weeks to this month.
        if month_max_week == global_max_week:
            print(f"Skipping month {month_str} because it contains the global maximum week ({global_max_week}). Awaiting completion.")
            continue

        print(f"Processing Monthly Roll-up for {month_str}...")

        # Construct the payload
        content_blocks = []
        for w in weeks:
            with open(os.path.join(WEEKLY_DIR, w["file"]), "r", encoding="utf-8") as f_in:
                content = f_in.read().strip()
                content_blocks.append(f"### Week {w['week']}\n{content}")

        all_content = "\n\n".join(content_blocks)

        prompt = (
            "**TASK: Deep Analytical Monthly Synthesis**\n"
            f"You are Atlas, a Master Reflective Partner and Strategic Goal Architect, utilizing Penny's elite communications protocol (Business Formal, MECE, zero contractions, BLUF format).\n"
            f"Below are the weekly factual summaries for the month of {month_str}.\n\n"
            "Your objective is to provide a highly structured, objective, and analytical performance audit of this period. Do not use verbose storytelling, academic prose, or biographical fluff.\n\n"
            "Output your analysis strictly in raw Markdown using the following structure:\n"
            "## BLUF (Bottom Line Up Front)\n"
            "(A concise, 2-3 sentence executive summary of the key themes, friction points, and overall productivity of this time period. Be direct and objective.)\n\n"
            "## 1. Goal Architecture & Performance\n"
            "(Analyze the events. Did the habits and methods observed actively move the needle on overarching goals? Use bullet points. Be specific and MECE.)\n\n"
            "## 2. Systemic Friction & Anomalies\n"
            "(Identify any recurring friction points, missed habits, or systemic anomalies observed in the data. Group by clear categories.)\n\n"
            "## 3. Strategic Shifts & Adjustments\n"
            "(Major changes in focus, environments, or structural pivots. Document the objective facts.)\n\n"
            "Do NOT include Markdown code blocks (```markdown) in your output. Just output the raw markdown text.\n"
            "If there is absolutely no meaningful data to synthesize for the month, explicitly state 'No new data to synthesize for this period.'\n"
            "\n---\n\n"
            f"{all_content}\n"
        )

        try:
            insight_text = call_gemini_pro(api_key, prompt)
            
            with open(out_path, "a", encoding="utf-8") as f_out:
                f_out.write(f"### Monthly Synthesis: {month_str}\n\n")
                f_out.write(insight_text.strip())
                f_out.write("\n\n---\n\n")
                
            print(f" -> Successfully appended {month_str} to {block_name}_Monthly_Rollups.md")
            total_processed += 1
            time.sleep(4)
        except Exception as e:
            print(f" -> Failed to process {month_str}: {e}")
            break

    print(f"Monthly batch complete. Processed: {total_processed}")

def get_all_monthly_data():
    """Reads all Monthly_Rollups.md files and extracts each month's content."""
    months = {}
    if not os.path.exists(MONTHLY_DIR):
        return months
        
    for f_name in os.listdir(MONTHLY_DIR):
        if not f_name.endswith("_Monthly_Rollups.md"):
            continue
            
        path = os.path.join(MONTHLY_DIR, f_name)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Split by the header
        parts = re.split(r"### Monthly Synthesis: (\d{4}-\d{2})", content)
        # parts[0] is everything before the first match
        for i in range(1, len(parts), 2):
            month_str = parts[i]
            month_content = parts[i+1].split("---")[0].strip()
            months[month_str] = month_content
            
    return months

def process_yearly(api_key):
    os.makedirs(YEARLY_DIR, exist_ok=True)
    
    monthly_data = get_all_monthly_data()
    if not monthly_data:
        print("No monthly insights found to synthesize.")
        return

    # Group monthly files by Year
    years_data = {}
    global_max_month = ""

    for month_str, content in monthly_data.items():
        global_max_month = max(global_max_month, month_str)
        try:
            year_str = month_str.split('-')[0]
            if year_str not in years_data:
                years_data[year_str] = []
            years_data[year_str].append({
                "month": month_str,
                "content": content
            })
        except Exception as e:
            print(f"Error parsing year for {month_str}: {e}")
            continue

    total_processed = 0

    for year_str in sorted(years_data.keys()):
        out_path = os.path.join(YEARLY_DIR, "All_Years_Rollup.md")
        
        # Check if already processed
        if os.path.exists(out_path):
            with open(out_path, 'r', encoding="utf-8") as f:
                content = f.read()
                if f"### Yearly Synthesis: {year_str}" in content:
                    continue

        months = years_data[year_str]
        year_max_month = max(m["month"] for m in months)

        # Safety Check
        if year_max_month == global_max_month:
            print(f"Skipping year {year_str} because it contains the global maximum month ({global_max_month}). Awaiting completion.")
            continue

        print(f"Processing Yearly Roll-up for {year_str}...")

        # Construct the payload
        # Ensure months are sorted
        months.sort(key=lambda x: x["month"])
        
        content_blocks = []
        for m in months:
            content_blocks.append(f"### Month {m['month']}\n{m['content']}")

        all_content = "\n\n".join(content_blocks)

        prompt = (
            "**TASK: Deep Analytical Yearly Synthesis**\n"
            f"You are Atlas, a Master Reflective Partner and Strategic Goal Architect, utilizing Penny's elite communications protocol (Business Formal, MECE, zero contractions, BLUF format).\n"
            f"Below are the monthly performance audits for the year of {year_str}.\n\n"
            "Your objective is to step back to the highest altitude and provide a highly structured, objective, and analytical performance audit of this entire year. Do not use verbose storytelling or academic prose.\n\n"
            "Output your analysis strictly in raw Markdown using the following structure:\n"
            "## BLUF (Bottom Line Up Front)\n"
            "(A concise, 3-4 sentence executive summary of the year's defining themes, major friction points, and overarching strategic progress.)\n\n"
            "## 1. Goal Architecture & Longitudinal Progress\n"
            "(Identify the long-term progression of goals across the year. Did the systemic habits and methods observed actively move the needle? Use bullet points. Be MECE.)\n\n"
            "## 2. Macro Friction & Systemic Failures\n"
            "(Identify recurring friction points or failures that persisted across multiple months. Group by clear categories.)\n\n"
            "## 3. Structural Pivots & Milestones\n"
            "(The objective, major structural changes in career, environments, relationships, or priorities over the year.)\n\n"
            "Do NOT include Markdown code blocks (```markdown) in your output. Just output the raw markdown text.\n"
            "If there is absolutely no meaningful data to synthesize, explicitly state 'No new data to synthesize for this period.'\n"
            "\n---\n\n"
            f"{all_content}\n"
        )

        try:
            insight_text = call_gemini_pro(api_key, prompt)
            
            with open(out_path, "a", encoding="utf-8") as f_out:
                f_out.write(f"### Yearly Synthesis: {year_str}\n\n")
                f_out.write(insight_text.strip())
                f_out.write("\n\n---\n\n")
                
            print(f" -> Successfully appended {year_str} to All_Years_Rollup.md")
            total_processed += 1
            time.sleep(4)
        except Exception as e:
            print(f" -> Failed to process {year_str}: {e}")
            break

    print(f"Yearly batch complete. Processed: {total_processed}")

def main():
    api_key = get_api_key()
    if not api_key:
        return
        
    print("Starting Monthly Synthesis Pipeline...")
    process_monthly(api_key)
    
    print("\nStarting Yearly Synthesis Pipeline...")
    process_yearly(api_key)

if __name__ == "__main__":
    main()
