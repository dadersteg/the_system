import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_pmt/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

def format_bluf(concept_text):
    # If it has "Layer", don't mess with the Layers, just extract the first part
    layers = ""
    if "**Layer" in concept_text:
        parts = concept_text.split("**Layer")
        concept_text = parts[0].strip()
        layers = "\n**Layer" + "**Layer".join(parts[1:])
    
    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', concept_text.strip())
    
    if len(sentences) == 1:
        return concept_text + layers
    
    bluf = sentences[0]
    bullets = []
    
    for s in sentences[1:]:
        if not s.strip(): continue
        if "market" in s.lower() or "prices" in s.lower():
            bullets.append(f"*   **Market Blindspot:** {s.strip()}")
        else:
            bullets.append(f"*   **The Edge:** {s.strip()}")
            
    formatted = bluf + "\n" + "\n".join(bullets) + layers
    return formatted

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
            original = match.group(1).strip()
            new_concept = format_bluf(original)
            return "**Concept:**\n" + new_concept + "\n\n**Variables to Track:**"
            
        # specifically target the Concept block before Variables to track
        new_content, num_subs = re.subn(r'\*\*Concept:\*\*\s*(.*?)\n\n\*\*Variables to Track:\*\*', replacer, content, flags=re.DOTALL)
        
        # If the file didn't have Variables to track (like some archived ones)
        if num_subs == 0:
             def replacer2(match):
                 original = match.group(1).strip()
                 return "**Concept:**\n" + format_bluf(original) + "\n\n"
             new_content, num_subs2 = re.subn(r'\*\*Concept:\*\*\s*(.*?)(?=\n\n|\n##|\Z)', replacer2, content, flags=re.DOTALL)
             num_subs = num_subs2

        if num_subs > 0 and new_content != content:
            with open(file_path, "w") as file:
                file.write(new_content)
            count += 1

print(f"Successfully rewritten {count} models using Penny's BLUF logic.")
