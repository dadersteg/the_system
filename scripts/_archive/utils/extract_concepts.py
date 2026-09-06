import os
import json
import re

base_path = "/Users/daniel/Documents/AGY/agy_pmt/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

extracted = {}

for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        file_path = os.path.join(dir_path, f)
        with open(file_path, "r") as file:
            content = file.read()
            
        # Get everything between Concept: and Variables: or Feasibility:
        concept_m = re.search(r'\*\*Concept:\*\*\n(.*?)(?=\n\n\*\*|\n\*\*Feasibility|\Z)', content, re.DOTALL)
        if concept_m:
            raw_text = concept_m.group(1).strip()
            # If it's already stripped down to garbage, we need to extract from the rest of the file to understand it.
            # Actually, the file has a "Core Logic" section!
            core_logic_m = re.search(r'\*\*Core Logic:\*\*\n(.*?)(?=\n\n\*\*|\Z)', content, re.DOTALL)
            core_logic = core_logic_m.group(1).strip() if core_logic_m else ""
            
            extracted[f] = {
                "raw_concept": raw_text[:300], # First 300 chars
                "core_logic": core_logic[:300] # First 300 chars of core logic
            }

with open("/Users/daniel/Documents/AGY/the_system/extracted_for_bluf.json", "w") as out:
    json.dump(extracted, out, indent=2)

print(f"Extracted {len(extracted)} files.")
