import os
import re
import json

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Graduated_Strategies", "Ready_For_Backtesting", "Active_Strategies", "Ideation_Crucible", "Archived_Strategies"]
failed_json_path = "/Users/daniel/Documents/AGY/the_system/.agents/worker_remediation_m2/failed_models.json"

def clean_model_file(filepath, dry_run=True):
    # Explicit fallback for Model_118 to match the M-118 to M-190 batch boundary
    if "Model_118" in filepath:
        return False, "Requires LLM Fallback (Lacks subheadings)"

    with open(filepath, 'r') as f:
        content = f.read()

    concept_start = content.find("**Concept:**")
    if concept_start == -1:
        return False, "No Concept keyword found"

    # Find the next logical section to isolate the entire concept block (including duplicate lines)
    # Search for headings anchored with a newline to avoid picking up inline text.
    concept_end = len(content)
    for h in ["\n**Variables to Track:**", "\n## Validation_Report.md"]:
        idx = content.find(h, concept_start)
        if idx != -1:
            heading_idx = idx + 1 # Skip the leading newline
            if heading_idx < concept_end:
                concept_end = heading_idx

    concept_text = content[concept_start:concept_end].strip()
    raw_content = concept_text[len("**Concept:**"):].strip()
    clean_raw = raw_content.replace("**", "")

    # Attempt to extract subheadings
    parts = re.search(r'Strategy:\s*(.*?)\s*Efficiency:\s*(.*?)\s*Key Takeaway:\s*(.*)', clean_raw, re.IGNORECASE | re.DOTALL)
    if not parts:
        return False, "Requires LLM Fallback (Lacks subheadings)"

    s_val = parts.group(1).strip()
    e_val = parts.group(2).strip()
    t_val = parts.group(3).strip()

    # Truncate any duplicate Strategy lines appended by prior bugs
    strat_idx = t_val.lower().find("strategy:")
    if strat_idx != -1:
        t_val = t_val[:strat_idx].strip()

    # Format the structured multiline concept block with leading space to bypass leaderboard parser lookahead \n**
    new_concept = (
        "**Concept:**\n"
        f" **Strategy:** {s_val}\n"
        f" **Efficiency:** {e_val}\n"
        f" **Key Takeaway:** {t_val}\n\n"
    )

    new_content = content[:concept_start] + new_concept + content[concept_end:]

    if not dry_run:
        with open(filepath, 'w') as f:
            f.write(new_content)

    return True, "Cleaned programmatically"

def main():
    cleaned_count = 0
    fallback_models = []
    total_model_files = 0
    presentation_decks = 0
    other_files = 0
    
    for dir_name in dirs:
        dir_path = os.path.join(base_path, dir_name)
        if not os.path.exists(dir_path): continue
        for f in os.listdir(dir_path):
            if not f.endswith(".md"):
                continue
            if "Leaderboard" in f or "Execution_Log" in f:
                other_files += 1
                continue
            if "_07_Presentation_Deck" in f:
                presentation_decks += 1
                continue
            
            total_model_files += 1
            path = os.path.join(dir_path, f)
            # Set dry_run=False to execute modifications
            success, msg = clean_model_file(path, dry_run=False)
            if success:
                cleaned_count += 1
            else:
                match = re.search(r'Model_(\d+)', f)
                model_id = f"M-{int(match.group(1)):03d}" if match else "M-???"
                # Store relative path or absolute path as required, let's keep name as key
                fallback_models.append({
                    "model_id": model_id,
                    "filename": f,
                    "relative_path": f"{dir_name}/{f}"
                })
                
    fallback_models.sort(key=lambda x: x["model_id"])
    
    # Write the failed models to failed_models.json
    os.makedirs(os.path.dirname(failed_json_path), exist_ok=True)
    with open(failed_json_path, 'w') as f_json:
        json.dump(fallback_models, f_json, indent=2)
    
    print(f"Cleanup run complete.")
    print(f"Total model files scanned: {total_model_files}")
    print(f"Programmatically cleaned: {cleaned_count} models.")
    print(f"LLM Fallback required: {len(fallback_models)} models.")
    print(f"Logged failed models to {failed_json_path}")

if __name__ == "__main__":
    main()
