import json
import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

merged_blufs = {}

for i in range(5):
    filepath = f"/Users/daniel/Documents/AGY/the_system/batch_{i}_out.json"
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            batch = json.load(f)
            for k, v in batch.items():
                merged_blufs[k] = v.replace("\n", " ")

count = 0
failed = []

for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        if f in merged_blufs:
            file_path = os.path.join(dir_path, f)
            with open(file_path, "r") as file:
                content = file.read()
            
            bluf_content = merged_blufs[f]
            
            # Use a more aggressive regex. We just want to replace the text between **Concept:** and the next bold header **Something:**
            new_content = re.sub(r'(\*\*Concept:\*\*).*?(?=\n\*\*\w+)', r'\g<1>\n' + bluf_content, content, count=1, flags=re.DOTALL)
            
            if new_content == content:
                # If that failed, let's just replace the text after **Concept:** until **Variables to Track:**
                new_content = re.sub(r'(\*\*Concept:\*\*).*?(?=\n\*\*Variables to Track:\*\*)', r'\g<1>\n' + bluf_content, content, count=1, flags=re.DOTALL)
            
            if new_content == content:
                # Still failed?
                failed.append(f)
            else:
                with open(file_path, "w") as file:
                    file.write(new_content)
                count += 1

print(f"Successfully fixed and injected {count} BLUFs.")
print(f"Failed: {failed[:5]} (Total {len(failed)})")
