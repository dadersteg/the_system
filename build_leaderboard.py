import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
leaderboard_path = os.path.join(base_path, "Model_Leaderboard.md")

dirs = {
    "Graduated_Strategies": "Graduated",
    "Ready_For_Backtesting": "Ready For Backtest",
    "Ideation_Crucible": "In Crucible",
    "Archived_Strategies": "Archived"
}

models = []

for dir_name, status in dirs.items():
    dir_path = os.path.join(base_path, dir_name)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        
        match = re.search(r'Model_(\d+)', f)
        if not match: continue
        model_id = int(match.group(1))
        
        roi, clv, win, feas, prac, comp, data, bluf = "Pending", "Pending", "Pending", "Pending", "Pending", "Pending", "Pending", ""
        
        with open(os.path.join(dir_path, f), 'r') as file:
            content = file.read()
            
            # Extract BLUF (Concept)
            concept_m = re.search(r'\*\*Concept:\*\*\s*(.*?)(?=\n\n|\n\*\*|\Z)', content, re.DOTALL)
            if concept_m:
                words = concept_m.group(1).split()
                bluf = " ".join(words[:12]) + "..." if len(words) > 12 else " ".join(words)
                bluf = bluf.replace("\n", " ")
            
            if status == "Graduated":
                roi_m = re.search(r'ROI:\s*([0-9.%+-]+)', content)
                if roi_m: roi = roi_m.group(1)
                
                clv_m = re.search(r'CLV Beat Rate:\s*([0-9.%]+)', content)
                if clv_m: clv = clv_m.group(1)
                
                win_m = re.search(r'Win Rate:\s*([0-9.%]+)', content)
                if win_m: win = win_m.group(1)
                
                feas_m = re.search(r'\*\*Feasibility:\*\*\s*(\d+)/10', content)
                if feas_m: feas = feas_m.group(1)
                
                prac_m = re.search(r'\*\*Practicality:\*\*\s*(\d+)/10', content)
                if prac_m: prac = prac_m.group(1)
                
                comp_m = re.search(r'\*\*Composite Score:\*\*\s*(\d+)/100', content)
                if comp_m: comp = comp_m.group(1)
                
                if "LOW-FIDELITY" in content: data = "Low (Proxy)"
                else: data = "Premium"
                
            elif status == "Archived":
                roi, clv, win, feas, prac, comp, data = "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A"
            
        models.append({
            "id": model_id,
            "name": f.replace(".md", ""),
            "status": status,
            "roi": roi,
            "clv": clv,
            "win": win,
            "feas": feas,
            "prac": prac,
            "comp": comp,
            "data": data,
            "bluf": bluf
        })

def sort_key(m):
    if m['status'] == 'Graduated':
        comp_val = int(m['comp']) if str(m['comp']).isdigit() else 0
        return (0, -comp_val)
    elif m['status'] == 'Ready For Backtest': return (1, m['id'])
    elif m['status'] == 'In Crucible': return (2, m['id'])
    else: return (3, m['id'])

models.sort(key=sort_key)

unique_models = []
seen = set()
for m in models:
    if m['id'] not in seen:
        seen.add(m['id'])
        unique_models.append(m)

with open(leaderboard_path, 'w') as f:
    f.write("# Quant Portfolio Leaderboard\n\n")
    f.write("*This leaderboard tracks the entire lifecycle of all automated strategies across the PMT framework. It is autonomously maintained by the Quant-Prime and Quant-Validator agents.*\n\n")
    f.write("| Rank/ID | Model Name | Status | BLUF | ROI | CLV Beat | Comp. Score |\n")
    f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
    
    for idx, m in enumerate(unique_models):
        rank = str(idx + 1) if m['status'] == 'Graduated' else f"#{m['id']}"
        # Removed Win Rate, Feasibility, Practicality, and Data Fidelity from main view to save space for BLUF
        f.write(f"| {rank} | {m['name']} | {m['status']} | {m['bluf']} | {m['roi']} | {m['clv']} | {m['comp']} |\n")

    f.write("\n---\n")
    f.write("*(Updated dynamically by PMT Agents)*\n")

print("Leaderboard with BLUF generated.")
