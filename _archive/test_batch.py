import json
from pydantic import BaseModel
from google import genai
from google.genai import types

class TaskEvaluation(BaseModel):
    task_id: str
    coo_proposed_title: str
    coo_proposed_notes: str
    james_insight: str
    task_master_priority: str

class BatchEvaluations(BaseModel):
    evaluations: list[TaskEvaluation]

def get_api_key():
    with open('/Users/daniel/Documents/the_system/.env', 'r') as f:
        for line in f:
            if line.startswith('SYSTEM_GEMINI_API_KEY='):
                return line.split('=', 1)[1].strip().strip("'").strip('"')
    raise ValueError("API key not found")

import sys
sys.path.append('/Users/daniel/Documents/agy_quantum21/scripts')
from analyze_tasks import get_tasks, clean_notes, _call_gemini_with_retry, load_rule, evaluate_tasks

tasks = get_tasks()
print("Total tasks:", len(tasks))
batch = tasks[0:20]
prompt = "Evaluate the following tasks:\n\n"
for t in batch:
    clean_t_notes = clean_notes(t.get('notes', ''))
    prompt += f"Task ID: {t['id']}\nTitle: {t.get('title', '')}\nNotes: {clean_t_notes}\n\n"

system_instruction = "You are evaluating tasks using three personas..."

api_key = get_api_key()
client = genai.Client(api_key=api_key)

response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=prompt,
    config=types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=BatchEvaluations,
        temperature=0.2,
        max_output_tokens=8192
    )
)
print("Response text:", repr(response.text))
try:
    print(json.loads(response.text))
except Exception as e:
    print("Failed to decode:", e)
