import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
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
            
        # Heuristic scoring based on text analysis using CORRECT definitions
        text_lower = content.lower()
        
        # Feasibility: Is the strategy itself feasible? (low liquidity, obscure bets = bad)
        feas_score = 7
        if "obscure" in text_lower or "low liquidity" in text_lower or "niche" in text_lower:
            feas_score -= 4
        if "nba" in text_lower or "nfl" in text_lower or "premier league" in text_lower or "high liquidity" in text_lower:
            feas_score += 2
        feas_score = max(1, min(10, feas_score))

        # Practicality: Does it require extensive data filtering, millisecond API latency, or is it too rare?
        prac_score = 7
        if "millisecond" in text_lower or "api latency" in text_lower or "extensive data" in text_lower or "rare" in text_lower or "infrequent" in text_lower or "calculate" in text_lower or "api" in text_lower:
            prac_score -= 4
        if "simple" in text_lower or "pre-match" in text_lower:
            prac_score += 2
        prac_score = max(1, min(10, prac_score))
        
        scoring_text = f"**Feasibility:** {feas_score}/10\n**Practicality:** {prac_score}/10"
        
        # We previously injected it. Replace it if it exists.
        if "**Feasibility:**" in content and "**Practicality:**" in content:
            new_content = re.sub(r'\*\*Feasibility:\*\* \d+/10\n\*\*Practicality:\*\* \d+/10', scoring_text, content)
        else:
            # Should already exist, but just in case
            if "**Variables to Track:**" in content:
                new_content = content.replace("**Variables to Track:**", "\n" + scoring_text + "\n\n**Variables to Track:**")
            else:
                new_content = content + "\n\n" + scoring_text
            
        with open(file_path, "w") as file:
            file.write(new_content)
        count += 1

print(f"Scored {count} models with updated definitions.")
