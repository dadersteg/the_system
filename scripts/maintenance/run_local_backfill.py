import os
import json
import time
import requests

DATA_DIR = "/Users/daniel/Developer/second_brain_db/data"
INSIGHTS_DIR = "/Users/daniel/Developer/second_brain_db/insights/daily"

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
    
    raise ValueError("SYSTEM_GEMINI_API_KEY not found in .env")

def generate_insight(api_key, date_str, json_content, prev_insight_content=""):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={api_key}"
    
    CHUNK_SIZE = 2500000
    
    if len(json_content) <= CHUNK_SIZE:
        chunks = [json_content]
    else:
        chunks = [json_content[i:i+CHUNK_SIZE] for i in range(0, len(json_content), CHUNK_SIZE)]
        
    partial_insights = []
    
    for idx, chunk in enumerate(chunks):
        if len(chunks) > 1:
            part_str = f"(Part {idx+1} of {len(chunks)}) "
        else:
            part_str = ""
            
        prompt = (
            "**TASK: Chronicle Daily Synthesis**\n"
            "You are synthesizing a 20-year archive of daily logs.\n"
            f"1. Below is the {part_str}raw data for {date_str}.\n"
        )
        if prev_insight_content and idx == 0:
            prompt += "2. Below is the previous day's insight markdown file to establish continuity.\n"
            
        prompt += (
            "3. Analyze the messages, emails, and drive activities logged in the JSON file.\n"
            "4. Generate a clear, detailed, and highly factual summary of the data provided. Extract key events, participants, and concrete actions taken.\n"
            "5. Maximize your deep synthesis capabilities. Weave the factual events into a cohesive narrative, identifying underlying patterns, emotional undertones, and strategic momentum.\n"
            "6. Do NOT include Markdown code blocks (```markdown) in your output. Output raw markdown only.\n"
            "7. If the data is completely empty or lacks meaningful new data, explicitly state 'No new data to synthesize.'\n"
            "\n"
            "---\n\n"
            f"**DATA FOR {date_str}:**\n{chunk}\n\n"
        )
        
        if prev_insight_content and idx == 0:
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
            content_obj = data.get('candidates', [{}])[0].get('content', {})
            if 'parts' in content_obj and len(content_obj['parts']) > 0 and 'text' in content_obj['parts'][0]:
                markdown = content_obj['parts'][0]['text']
            else:
                markdown = "No new data to synthesize."
            partial_insights.append(markdown)
        except Exception as e:
            raise Exception(f"Failed to parse API response: {data}") from e
            
        if len(chunks) > 1 and idx < len(chunks) - 1:
            print(f" -> Processed part {idx+1}/{len(chunks)}")
            time.sleep(4)
            
    if len(chunks) == 1:
        return partial_insights[0]
        
    print(f" -> Aggregating {len(chunks)} parts...")
    agg_prompt = (
        "**TASK: Final Daily Synthesis Aggregation**\n"
        f"You are combining {len(chunks)} partial summaries for the date {date_str} into a single, cohesive daily overview.\n"
        "1. Below are the partial factual summaries generated from chunks of the day's raw data.\n"
        "2. Merge these facts into a single unified chronological narrative.\n"
        "3. Maintain the exact same formatting and tone as a standard daily insight.\n"
        "4. Do NOT include Markdown code blocks (```markdown) in your output. Output raw markdown only.\n\n"
        "---\n\n"
        f"**PARTIAL SUMMARIES FOR {date_str}:**\n"
    )
    for idx, partial in enumerate(partial_insights):
        agg_prompt += f"\n--- PART {idx+1} ---\n{partial}\n"
        
    payload = {"contents": [{"parts": [{"text": agg_prompt}]}]}
    response = requests.post(url, json=payload)
    if response.status_code != 200:
        raise Exception(f"API Error ({response.status_code}): {response.text}")
        
    data = response.json()
    try:
        content_obj = data.get('candidates', [{}])[0].get('content', {})
        if 'parts' in content_obj and len(content_obj['parts']) > 0 and 'text' in content_obj['parts'][0]:
            final_markdown = content_obj['parts'][0]['text']
        else:
            final_markdown = "No new data to synthesize."
        return final_markdown
    except Exception as e:
        raise Exception(f"Failed to parse API response: {data}") from e

def main():
    api_key = get_api_key()
    
    os.makedirs(INSIGHTS_DIR, exist_ok=True)
    
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
        
        json_path = os.path.join(DATA_DIR, json_file)
        with open(json_path, 'r') as f:
            json_content = f.read()
            
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
            
            time.sleep(4)
            
        except Exception as e:
            print(f" -> ERROR processing {date_str}: {e}")
            print(f"Skipping {date_str} and continuing to the next day.")
            continue

    print(f"Batch complete. Processed: {total_processed}, Skipped: {total_skipped}")

if __name__ == "__main__":
    main()
