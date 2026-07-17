import os
import json
import time
import requests

DATA_DIR = "/Users/daniel/Developer/second_brain_db/data"
INSIGHTS_DIR = "/Users/daniel/Developer/second_brain_db/insights/daily"

def get_api_key():
    env_path = "/Users/daniel/Documents/AGY/the_system/.env"
    if not os.path.exists(env_path):
        raise FileNotFoundError(f"Could not find .env at {env_path}")
    
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith("SYSTEM_GEMINI_API_KEY="):
                val = line.split("=", 1)[1].strip()
                return val.strip("'").strip('"')
    
    raise ValueError("SYSTEM_GEMINI_API_KEY not found in .env")

def generate_insight(api_key, date_str, json_content, prev_insight_content=""):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    # Building the prompt payload matching the original Jules prompt
    prompt = (
        "**TASK: Chronicle Daily Synthesis**\n"
        "You are synthesizing a 20-year archive of daily logs.\n"
        f"1. Below is the raw data for {date_str}.\n"
    )
    if prev_insight_content:
        prompt += "2. Below is the previous day's insight markdown file to establish continuity.\n"
        
    prompt += (
        "3. Analyze the messages, emails, and drive activities logged in the JSON file.\n"
        "4. Generate a clear, detailed, and highly factual summary of the day. Extract key events, participants, and concrete actions taken.\n"
        "5. Maximize your deep synthesis capabilities. Weave the factual events into a cohesive narrative, identifying underlying patterns, emotional undertones, and strategic momentum.\n"
        "6. Do NOT include Markdown code blocks (```markdown) in your output. Output raw markdown only.\n"
        "7. If the JSON is completely empty or lacks meaningful new data, explicitly state 'No new data to synthesize.'\n"
        "\n"
        "---\n\n"
        f"**DATA FOR {date_str}:**\n{json_content}\n\n"
    )
    
    if prev_insight_content:
        prompt += f"---\n\n**PREVIOUS DAY INSIGHT:**\n{prev_insight_content}\n\n"
        
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    response = requests.post(url, json=payload)
    if response.status_code != 200:
        raise Exception(f"API Error ({response.status_code}): {response.text}")
        
    data = response.json()
    try:
        markdown = data['candidates'][0]['content']['parts'][0]['text']
        return markdown
    except Exception as e:
        raise Exception(f"Failed to parse API response: {data}") from e

def main():
    api_key = get_api_key()
    
    os.makedirs(INSIGHTS_DIR, exist_ok=True)
    
    # Get all JSON files sorted chronologically
    json_files = sorted([f for f in os.listdir(DATA_DIR) if f.endswith('.json')])
    
    total_processed = 0
    total_skipped = 0
    
    for i, json_file in enumerate(json_files):
        date_str = json_file.replace('.json', '')
        insight_path = os.path.join(INSIGHTS_DIR, f"{date_str}_insight.md")
        
        if os.path.exists(insight_path):
            total_skipped += 1
            continue
            
        print(f"[{i+1}/{len(json_files)}] Processing {date_str}...")
        
        # Read the JSON file
        json_path = os.path.join(DATA_DIR, json_file)
        with open(json_path, 'r') as f:
            json_content = f.read()
            
        # Get previous day's insight if it exists
        prev_insight_content = ""
        if i > 0:
            prev_date_str = json_files[i-1].replace('.json', '')
            prev_insight_path = os.path.join(INSIGHTS_DIR, f"{prev_date_str}_insight.md")
            if os.path.exists(prev_insight_path):
                with open(prev_insight_path, 'r') as f:
                    prev_insight_content = f.read()
                    
        try:
            markdown = generate_insight(api_key, date_str, json_content, prev_insight_content)
            
            with open(insight_path, 'w') as f:
                f.write(markdown)
                
            print(f" -> Successfully saved {date_str}_insight.md")
            total_processed += 1
            
            # Polite delay to respect API rate limits (15 requests per minute = 4s sleep)
            time.sleep(4)
            
        except Exception as e:
            print(f" -> ERROR processing {date_str}: {e}")
            print("Stopping batch due to error.")
            break

    print(f"Batch complete. Processed: {total_processed}, Skipped: {total_skipped}")

if __name__ == "__main__":
    main()
