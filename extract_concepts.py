import os
import json
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

concepts = {}

for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        file_path = os.path.join(dir_path, f)
        with open(file_path, "r") as file:
            content = file.read()
            match = re.search(r'\*\*Concept:\*\*\s*(.*?)(?=\n\n\*\*|\n\n##|\Z)', content, re.DOTALL)
            if match:
                concepts[f] = match.group(1).strip()

with open("/Users/daniel/Documents/AGY/the_system/concepts.json", "w") as out:
    json.dump(concepts, out, indent=2)

print(f"Extracted {len(concepts)} concepts.")
