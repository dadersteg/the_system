import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_pmt/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

count = 0
for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        file_path = os.path.join(dir_path, f)
        with open(file_path, "r") as file:
            content = file.read()
            
        def replacer(match):
            original = match.group(0)
            concept_text = match.group(1)
            
            # Strip "Exploiting inefficiencies in [X] (by|when|targeting|fading) "
            # We want to match up to the FIRST occurrence of these action words to not over-strip.
            clean_match = re.search(r'Exploiting inefficiencies in.*?(?: by | when | targeting | fading | betting )(.*)', concept_text, re.IGNORECASE | re.DOTALL)
            
            if clean_match:
                bluf = clean_match.group(1).strip()
                # Capitalize the first letter
                if bluf:
                    bluf = bluf[0].upper() + bluf[1:]
                return "**Concept:**\n" + bluf
            else:
                return original
            
        new_content, num_subs = re.subn(r'\*\*Concept:\*\*\n(.*?)(?=\n\*)', replacer, content, flags=re.DOTALL)
        
        # Some might not have \n* if they don't have bullets, fallback:
        if num_subs == 0:
            new_content, num_subs = re.subn(r'\*\*Concept:\*\*\n(.*?)(?=\n\n|\Z)', replacer, content, flags=re.DOTALL)

        if num_subs > 0 and new_content != content:
            with open(file_path, "w") as file:
                file.write(new_content)
            count += 1

print(f"Fixed {count} BLUFs.")
