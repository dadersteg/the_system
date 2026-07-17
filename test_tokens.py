import requests
import json

def get_api_key():
    with open("/Users/daniel/Documents/AGY/the_system/.env", 'r') as f:
        for line in f:
            if line.startswith("SYSTEM_GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'").strip('"')

with open("/Users/daniel/Developer/second_brain_db/data/2008-03-06.json", "r") as f:
    json_content = f.read()
    
with open("/Users/daniel/Developer/second_brain_db/insights/daily/2008-03-05_insight.md", "r") as f:
    prev_insight = f.read()

api_key = get_api_key()
prompt = (
    "**TASK: Chronicle Daily Synthesis**\n"
    "You are synthesizing a 20-year archive of daily logs.\n"
    "1. Below is the raw data for 2008-03-06.\n"
    "2. Below is the previous day's insight markdown file to establish continuity.\n"
    "3. Analyze the messages, emails, and drive activities logged in the JSON file.\n"
    "4. Generate a clear, detailed, and highly factual summary of the day. Extract key events, participants, and concrete actions taken.\n"
    "5. Maximize your deep synthesis capabilities. Weave the factual events into a cohesive narrative, identifying underlying patterns, emotional undertones, and strategic momentum.\n"
    "6. Do NOT include Markdown code blocks (```markdown) in your output. Output raw markdown only.\n"
    "7. If the JSON is completely empty or lacks meaningful new data, explicitly state 'No new data to synthesize.'\n"
    "\n---\n\n"
    f"**DATA FOR 2008-03-06:**\n{json_content}\n\n"
    f"---\n\n**PREVIOUS DAY INSIGHT:**\n{prev_insight}\n\n"
)

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
res = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
data = res.json()
print("Usage Metadata:", json.dumps(data.get("usageMetadata", {})))
