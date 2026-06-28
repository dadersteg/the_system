import os
import re
import json
import time
from pathlib import Path
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
api_key = os.environ.get("SYSTEM_GEMINI_API_KEY") or os.environ.get("WORK_GEMINI_API_KEY")

if not api_key:
    raise ValueError("Gemini API Key not found in environment variables.")

# Base paths
base_models_dir = Path("/Users/daniel/Documents/AGY/agy_pmt/05_project_pmt/project_ai_betting_framework/06_Automated_Models")
failed_models_json = Path("/Users/daniel/Documents/AGY/the_system/.agents/worker_remediation_m2/failed_models.json")

# Define response schema
class ConceptSchema(BaseModel):
    strategy: str = Field(description="Single cohesive paragraph. British English spelling, numerals for all numbers, BLUF starting with the core edge.")
    efficiency: list[str] = Field(description="2-4 key metrics or execution points. British English spelling, numerals for all numbers. No commas or semicolons within points.")
    key_takeaway: str = Field(description="Single polished high-impact takeaway sentence. British English, numerals for all numbers.")

# Initialize Gemini Client
client = genai.Client(
    api_key=api_key,
    http_options=types.HttpOptions(timeout=60000)
)

# System instruction
system_instruction = """You are an expert Copywriter and Operations Editor at Playmetech, operating under a strict style guide based on penny.md and playmetech_coo.md.

Your task is to take an initial strategy Concept block from a quant betting model, and rewrite it into three structured sub-sections: Strategy, Efficiency, and Key Takeaway.

You must follow these rules strictly:
1. SPARK CLARITY (British English): Use British spelling (e.g. organise, optimise, behaviour, defence, offence, modelled, programme, prioritised, etc.) throughout all text.
2. NUMERALS FOR NUMBERS: Always use digits/numerals for numbers (e.g., "3" instead of "three", "1" instead of "one", "10" instead of "ten"), even at the start of a sentence.
3. STRATEGY RULE: Write a single, cohesive, active-voice paragraph without any bullet points, numbered lists, or nested lists. State the core decision/edge in the very first sentence (BLUF). Keep it brief, professional, and clear.
4. EFFICIENCY RULE: Extract 2 to 4 key efficiency points or metrics (such as win rate, backtest feasibility, execution constraints, ROI, etc.). Each point must be a short, direct metric or constraint statement. Do not include commas or semicolons in any of the individual points.
5. KEY TAKEAWAY RULE: Write a single, polished, high-impact takeaway statement.
6. NO FLUFF: Keep it extremely direct, professional, and authoritative. Avoid conversational filler or introductory text.

You must output a JSON object matching this schema:
{
  "strategy": "<single polished paragraph string>",
  "efficiency": ["<efficiency point 1>", "<efficiency point 2>", "<efficiency point 3>"],
  "key_takeaway": "<polished takeaway string>"
}
"""

def call_gemini_with_retry(model_name, original_concept, max_retries=5, backoff_factor=2.0):
    prompt = f"Model Name: {model_name}\nOriginal Concept: {original_concept}\n\nProduce the structured rewrite as JSON."
    
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=ConceptSchema,
                    temperature=0.1
                )
            )
            if not response.text:
                raise ValueError("Empty response received from Gemini.")
            return json.loads(response.text)
        except Exception as e:
            err_msg = str(e)
            if any(term in err_msg for term in ["503", "429", "ResourceExhausted", "high demand", "UNAVAILABLE"]):
                sleep_time = (backoff_factor ** attempt) + 2.0
                print(f"   -> Got transient API error (attempt {attempt+1}/{max_retries}): {err_msg}. Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
            else:
                print(f"Error during API call for {model_name}: {err_msg}")
                raise e
    raise RuntimeError("Max retries exceeded for Gemini API call.")

def rewrite_model_concept(model_info):
    model_id = model_info["model_id"]
    relative_path = model_info["relative_path"]
    file_path = base_models_dir / relative_path

    if not file_path.exists():
        print(f"[{model_id}] File not found: {file_path}")
        return False

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Locate the concept block in the markdown file
    concept_match = re.search(r'(\*\*Concept:\*\*\s*\n?)(.*?)(?=\n\*|\n\n|\n\*\*|\Z)', content, re.DOTALL)
    if not concept_match:
        print(f"[{model_id}] Could not locate Concept block in {file_path}")
        return False

    start, end = concept_match.start(), concept_match.end()
    original_concept = concept_match.group(2).strip()

    # Check if this concept block is already structured
    if "Strategy:" in original_concept and "Efficiency:" in original_concept and "Key Takeaway:" in original_concept:
        print(f"[{model_id}] Concept block is already structured. Skipping.")
        return True

    # Check if there is a leftover Strategy/Efficiency block right after that we should consume
    after_text = content[end:]
    strategy_m = re.match(r'\s*\n*\*\*Strategy:\*\*.*?(?=\n\*|\n\n|\n\*\*|\Z)', after_text, re.DOTALL)
    if strategy_m:
        end = end + strategy_m.end()
        print(f"[{model_id}] Found and consumed leftover Strategy/Efficiency block.")

    # Call Gemini API to get rewritten block
    print(f"[{model_id}] Sending to Gemini for rewrite...")
    try:
        rewritten_data = call_gemini_with_retry(model_info["filename"], original_concept)
    except Exception as e:
        print(f"[{model_id}] Failed to rewrite: {e}")
        return False

    strategy = rewritten_data["strategy"]
    efficiency_list = rewritten_data["efficiency"]
    key_takeaway = rewritten_data["key_takeaway"]

    # Format the efficiency points separated by (1), (2), etc.
    efficiency_str = ", ".join(f"({i+1}) {pt.strip()}" for i, pt in enumerate(efficiency_list))

    # Construct the concept block exactly as required:
    # **Concept:**
    #  **Strategy:** <polished paragraph>
    #  **Efficiency:** <points separated by (1), (2)>
    #  **Key Takeaway:** <polished takeaway>
    new_block = (
        "**Concept:**\n"
        f" **Strategy:** {strategy.strip()}\n"
        f" **Efficiency:** {efficiency_str.strip()}\n"
        f" **Key Takeaway:** {key_takeaway.strip()}"
    )

    # Overwrite the block in content
    new_content = content[:start] + new_block + content[end:]

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"[{model_id}] Successfully updated concept block.")
    return True

def main():
    if not failed_models_json.exists():
        print(f"Failed models list not found at: {failed_models_json}")
        return

    with open(failed_models_json, 'r', encoding='utf-8') as f:
        failed_models = json.load(f)

    print(f"Loaded {len(failed_models)} models to remediate.")
    success_count = 0

    for idx, model_info in enumerate(failed_models):
        print(f"\n--- Processing model {idx+1}/{len(failed_models)}: {model_info['model_id']} ---")
        success = rewrite_model_concept(model_info)
        if success:
            success_count += 1
        # Moderate sleep to avoid hitting rate limits
        time.sleep(2.0)

    print(f"\nRemediation complete. Successfully updated {success_count}/{len(failed_models)} models.")

if __name__ == "__main__":
    main()
