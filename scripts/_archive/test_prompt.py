#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.error
import sys

def main():
    template_path = "/Users/daniel/Documents/AGY/the_system/scripts/utils/prompt_template.md"
    transcript_path = "/Users/daniel/.gemini/antigravity/brain/fbe96767-fd59-4233-8214-c9d03b7c607d/.system_generated/logs/transcript_full.jsonl"
    
    print(f"Loading template from {template_path}...")
    if not os.path.exists(template_path):
        print(f"Error: template path does not exist: {template_path}")
        sys.exit(1)
        
    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()
        
    print(f"Loading transcript from {transcript_path}...")
    if not os.path.exists(transcript_path):
        print(f"Error: transcript path does not exist: {transcript_path}")
        sys.exit(1)
        
    # Read first 50 lines of transcript
    with open(transcript_path, "r", encoding="utf-8") as f:
        lines = [next(f) for _ in range(50)]
    
    transcript_data = "".join(lines)
    
    # Replace placeholder
    prompt = template.replace("{{TRANSCRIPT_DATA}}", transcript_data)
    
    url = "http://localhost:11434/api/generate"
    payload = {
        "model": "gemma4:26b",
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.0
        }
    }
    
    print("Querying local Ollama service (gemma4:26b)...")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            raw_response = res["response"].strip()
    except urllib.error.URLError as e:
        print(f"Ollama connection failed: {e}")
        sys.exit(1)
        
    print("\n--- Raw Model Output ---")
    print(raw_response)
    print("------------------------\n")
    
    # Verification starts here
    print("Verifying response structure...")
    
    # 1. Verify JSON parseability
    try:
        data = json.loads(raw_response)
        print("Success: Output parsed as valid JSON.")
    except json.JSONDecodeError as e:
        print(f"Failure: Output is not valid JSON. Error: {e}")
        print("Tip: Check if the model output has markdown blocks (```json) or other extra text.")
        sys.exit(1)
        
    # 2. Check keys
    required_keys = ["conversation_id", "title", "agent_role", "purpose", "result", "summary", "files_touched"]
    missing_keys = [k for k in required_keys if k not in data]
    if missing_keys:
        print(f"Failure: Missing required keys: {missing_keys}")
        sys.exit(1)
    else:
        print("Success: All required keys present in JSON.")
        
    # 3. Verify summary constraints
    summary = data["summary"]
    if not isinstance(summary, str):
        print(f"Failure: 'summary' field is not a string (type is {type(summary)}).")
        sys.exit(1)
        
    print(f"Summary value: {repr(summary)}")
    
    # Check if it has markdown bullet points
    lines_list = [line.strip() for line in summary.split("\n") if line.strip()]
    if not lines_list:
        print("Failure: 'summary' field is empty or has no content.")
        sys.exit(1)
        
    all_bullets = True
    for line in lines_list:
        if not line.startswith("- "):
            all_bullets = False
            print(f"Non-bullet line found in summary: {repr(line)}")
            
    if all_bullets:
        print("Success: 'summary' field contains only markdown bullet points starting with '- '.")
    else:
        print("Failure: 'summary' field contains lines that do not start with '- '.")
        sys.exit(1)
        
    # Check that it doesn't look like JSON array or Python list formatting
    if summary.startswith("[") or summary.endswith("]"):
        print("Failure: 'summary' field appears to have list/array formatting brackets.")
        sys.exit(1)
        
    if "', '" in summary or '", "' in summary:
        print("Failure: 'summary' field appears to contain list-like item separators.")
        sys.exit(1)
        
    print("Success: 'summary' field does not contain JSON arrays or Python list formatting.")
    print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
