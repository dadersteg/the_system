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
            concept_m = re.search(r'\*\*Concept:\*\*\n(.*?)(?=\n\*|\n\n|\Z)', content, re.DOTALL)
            if concept_m:
                bluf_raw = concept_m.group(1).strip().replace("\n", " ")
                # Truncate slightly if it's monstrously long, but keep the core sentence
                if len(bluf_raw) > 250:
                    bluf = bluf_raw[:247] + "..."
                else:
                    bluf = bluf_raw
            
            # Extract scores (including upfront ones for Feasibility/Practicality)
            feas_m = re.search(r'\*\*Feasibility:\*\*\s*(\d+)/10', content)
            if feas_m: feas = feas_m.group(1)
            
            prac_m = re.search(r'\*\*Practicality:\*\*\s*(\d+)/10', content)
            if prac_m: prac = prac_m.group(1)

            if status == "Graduated":
                roi_m = re.search(r'ROI:\s*([0-9.%+-]+)', content)
                if roi_m: 
                    roi_val = roi_m.group(1)
                    # Convert 1746.27% to 17.4x
                    if "%" in roi_val:
                        try:
                            num = float(roi_val.replace("%", "").replace(",", ""))
                            roi = f"{num/100:.1f}x"
                        except:
                            roi = roi_val
                    else:
                        roi = roi_val
                
                clv_m = re.search(r'CLV Beat Rate:\s*([0-9.%]+)', content)
                if clv_m: clv = clv_m.group(1)
                
                win_m = re.search(r'Win Rate:\s*([0-9.%]+)', content)
                if win_m: win = win_m.group(1)
                
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
    f.write("| Rank | Model ID | Status | BLUF | ROI | CLV Beat | Win Rate | Feas. | Prac. | Comp. Score |\n")
    f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
    
    for idx, m in enumerate(unique_models):
        rank = str(idx + 1) if m['status'] == 'Graduated' else "-"
        # Format ID nicely
        model_id = f"M-{m['id']:03d}"
        
        f.write(f"| {rank} | {model_id} | {m['status']} | {m['bluf']} | {m['roi']} | {m['clv']} | {m['win']} | {m['feas']} | {m['prac']} | {m['comp']} |\n")

    f.write("\n---\n")
    f.write("*(Updated dynamically by PMT Agents)*\n")

print("Leaderboard generation complete.")
