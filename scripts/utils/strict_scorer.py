import os
import re

base_path = "/Users/daniel/Documents/AGY/agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models"
dirs = ["Ideation_Crucible", "Ready_For_Backtesting", "Graduated_Strategies", "Archived_Strategies"]

def calculate_scores(content):
    content_lower = content.lower()
    
    feas = 9
    prac = 9
    
    # Feasibility Penalties (Liquidity/Market)
    if 'player prop' in content_lower or 'props' in content_lower:
        feas -= 3
    if 'wnba' in content_lower or 'f1' in content_lower or 'formula 1' in content_lower or 'niche' in content_lower:
        feas -= 4
    if 'alt line' in content_lower or 'alternative line' in content_lower or 'micro' in content_lower:
        feas -= 5
        
    # Practicality Penalties (Human Execution)
    if 'weather' in content_lower or 'injury' in content_lower or 'referee' in content_lower:
        prac -= 2
    if 'live bet' in content_lower or 'in-game' in content_lower or 'live-betting' in content_lower or 'live' in content_lower:
        prac -= 5
    if 'latency' in content_lower or 'micro' in content_lower:
        prac -= 7
        
    # Floors
    feas = max(1, feas)
    prac = max(1, prac)
    
    return feas, prac

count = 0

for d in dirs:
    dir_path = os.path.join(base_path, d)
    if not os.path.exists(dir_path): continue
    for f in os.listdir(dir_path):
        if not f.endswith(".md"): continue
        
        file_path = os.path.join(dir_path, f)
        with open(file_path, "r") as file:
            content = file.read()
            
        new_feas, new_prac = calculate_scores(content)
        
        # Find old scores to adjust Comp
        old_feas = 9
        f_m = re.search(r'\*\*Feasibility:\*\*\s*(\d+)/10', content)
        if f_m: old_feas = int(f_m.group(1))
            
        old_prac = 9
        p_m = re.search(r'\*\*Practicality:\*\*\s*(\d+)/10', content)
        if p_m: old_prac = int(p_m.group(1))
        
        new_content = content
        
        # Replace Markdown block scores
        new_content = re.sub(r'\*\*Feasibility:\*\*\s*\d+/10', f'**Feasibility:** {new_feas}/10', new_content)
        new_content = re.sub(r'\*\*Practicality:\*\*\s*\d+/10', f'**Practicality:** {new_prac}/10', new_content)
        
        # Replace inside the BLUF string
        new_content = re.sub(r'Feasibility:\s*\d+/10', f'Feasibility: {new_feas}/10', new_content)
        new_content = re.sub(r'Practicality:\s*\d+/10', f'Practicality: {new_prac}/10', new_content)
        
        # Adjust Comp Score
        c_m = re.search(r'\*\*Composite Score:\*\*\s*(\d+)/100', content)
        if c_m:
            old_comp = int(c_m.group(1))
            if old_feas + old_prac > 0:
                # Proportional drop, or minimum drop
                drop = (old_feas - new_feas) * 3 + (old_prac - new_prac) * 4
                new_comp = max(20, min(100, old_comp - drop))
                
                new_content = re.sub(r'\*\*Composite Score:\*\*\s*\d+/100', f'**Composite Score:** {new_comp}/100', new_content)
                new_content = re.sub(r'Composite Score:\s*\d+/100', f'Composite Score: {new_comp}/100', new_content)
        
        if new_content != content:
            with open(file_path, "w") as file:
                file.write(new_content)
            count += 1

print(f"Algorithmically downgraded {count} models based on strict definitions.")
