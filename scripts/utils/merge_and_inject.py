import json
import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_pmt/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

merged_blufs = {}

# Merge the 5 batches
for i in range(5):
    filepath = f"/Users/daniel/Documents/AGY/the_system/batch_{i}_out.json"
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            batch = json.load(f)
            merged_blufs.update(batch)

print(f"Loaded {len(merged_blufs)} BLUFs from 5 batches.")

# Verification: Remove any newlines just in case a subagent messed up
for key in merged_blufs:
    bluf_str = merged_blufs[key]
    if isinstance(bluf_str, str):
        # Force it to be a single continuous string and remove markdown asterisks completely
        bluf_str = bluf_str.replace("\n", " ")
        merged_blufs[key] = bluf_str

count = 0
for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        if f in merged_blufs:
            file_path = os.path.join(dir_path, f)
            with open(file_path, "r") as file:
                content = file.read()
            
            # Replace the Concept block
            bluf_content = merged_blufs[f]
            def replacer(match):
                return "**Concept:**\n" + bluf_content + "\n"
            
            # The regex finds "**Concept:**\n" and replaces everything until the next "**" block or end of file
            new_content = re.sub(r'\*\*Concept:\*\*\n(.*?)(?=\n\n\*\*|\n\*|\n\*\*Feasibility|\Z)', replacer, content, count=1, flags=re.DOTALL)
            
            # Fallback if the previous regex didn't match perfectly
            if new_content == content:
                new_content = re.sub(r'\*\*Concept:\*\*\n(.*?)(?=\n\n\*\*|\Z)', replacer, content, count=1, flags=re.DOTALL)
                
            if new_content != content:
                with open(file_path, "w") as file:
                    file.write(new_content)
                count += 1

print(f"Successfully injected {count} BLUFs into markdown files.")
