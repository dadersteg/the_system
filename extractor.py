import json
import re

def to_british(text):
    words = {
        "analyze": "analyse", "Analyze": "Analyse",
        "favor": "favour", "Favor": "Favour",
        "favorite": "favourite", "Favorite": "Favourite",
        "behavior": "behaviour", "Behavior": "Behaviour",
        "organize": "organise", "Organize": "Organise",
        "optimize": "optimise", "Optimize": "Optimise",
        "utilize": "utilise", "Utilize": "Utilise",
        "color": "colour", "Color": "Colour",
        "defense": "defence", "Defense": "Defence",
        "offense": "offence", "Offense": "Offence",
        "modeling": "modelling", "Modeling": "Modelling",
        "program": "programme", "Program": "Programme"
    }
    for us, uk in words.items():
        text = text.replace(us, uk)
    return text

def extract_bluf(markdown_text):
    markdown_text = to_british(markdown_text)
    
    lines = markdown_text.split('\n')
    concept_lines = []
    edge_lines = []
    bet = ""
    feas = "N/A"
    prac = "N/A"
    roi = ""
    win = ""
    comp = ""
    
    state = None
    for line in lines:
        line_strip = line.strip()
        if not line_strip: continue
        
        if line_strip.startswith('**Concept:**'):
            state = 'concept'
            concept_lines.append(line_strip.replace('**Concept:**', '').strip())
            continue
        elif line_strip.startswith('**The Edge:**'):
            state = 'edge'
            edge_lines.append(line_strip.replace('**The Edge:**', '').strip())
            continue
        elif line_strip.startswith('*   **The Edge:**'):
            state = 'edge'
            edge_lines.append(line_strip.replace('*   **The Edge:**', '').strip())
            continue
        elif line_strip.startswith('**Archival Reason'):
            state = 'edge'
            edge_lines.append(line_strip.split('**:', 1)[-1].strip() if '**:' in line_strip else line_strip.split('**', 2)[-1].strip())
            continue
        elif line_strip.startswith('**Betting Market:**'):
            bet = line_strip.replace('**Betting Market:**', '').strip()
            state = None
            continue
        elif line_strip.startswith('**Feasibility:**'):
            feas = line_strip.replace('**Feasibility:**', '').strip()
            state = None
            continue
        elif line_strip.startswith('**Practicality:**'):
            prac = line_strip.replace('**Practicality:**', '').strip()
            state = None
            continue
        elif line_strip.startswith('- ROI:'):
            roi = line_strip.replace('- ROI:', '').strip()
            state = None
            continue
        elif line_strip.startswith('- Win Rate:'):
            win = line_strip.replace('- Win Rate:', '').strip()
            state = None
            continue
        elif line_strip.startswith('- **Composite Score:**'):
            comp = line_strip.replace('- **Composite Score:**', '').strip()
            state = None
            continue
        elif line_strip.startswith('**Layer'):
            state = None
            continue
        elif line_strip.startswith('**Variables to Track:**') or line_strip.startswith('**Status:'):
            state = None
            continue
        elif line_strip.startswith('# Quant Strategy'):
            state = None
            continue
        elif line_strip.startswith('1.') or line_strip.startswith('2.') or line_strip.startswith('3.') or line_strip.startswith('4.'):
            if state == 'concept' or state == 'edge':
                pass
            state = None
            continue
        elif line_strip.startswith('**Simulation Parameters:**') or line_strip.startswith('**Results:**') or line_strip.startswith('**Real-World Scoring:**'):
            state = None
            continue
        elif line_strip.startswith('- Total Bets') or line_strip.startswith('- CLV Beat') or line_strip.startswith('- Final Bankroll') or line_strip.startswith('- Initial Bankroll') or line_strip.startswith('- Staking') or line_strip.startswith('- Daily Exposure'):
            state = None
            continue
        
        if state == 'concept':
            concept_lines.append(line_strip)
        elif state == 'edge':
            edge_lines.append(line_strip)
            
    concept = ' '.join(concept_lines).strip()
    edge = ' '.join(edge_lines).strip()
    
    edge = re.sub(r'\*\*(.*?)\*\*', r'\1', edge)
    concept = re.sub(r'\*\*(.*?)\*\*', r'\1', concept)
    
    if bet:
        strategy = f"Bet on {bet}. {concept} {edge}"
    else:
        strategy = f"{concept} {edge}"
        
    strategy = re.sub(r'\s+', ' ', strategy).strip()
    
    eff_parts = []
    if roi: eff_parts.append(f"ROI: {roi}")
    if win: eff_parts.append(f"Win Rate: {win}")
    eff_parts.append(f"Feasibility: {feas}")
    eff_parts.append(f"Practicality: {prac}")
    if comp: eff_parts.append(f"Composite Score: {comp}")
    
    efficiency = ", ".join(eff_parts) + "."
    
    takeaway_source = edge if edge else concept
    if takeaway_source:
        sentences = re.split(r'(?<!e\.g)(?<!i\.e)(?<!vs)\.\s+', takeaway_source)
        takeaway = sentences[0]
        if not takeaway.endswith('.'):
            takeaway += '.'
    else:
        takeaway = "Exploit situational inefficiencies in the market."
        
    bluf = f"**Strategy:** {strategy} **Efficiency:** {efficiency} **Key Takeaway:** {takeaway}"
    return bluf

if __name__ == '__main__':
    with open('/Users/daniel/Documents/AGY/the_system/batch_4.json', 'r') as f:
        data = json.load(f)

    out_data = {}
    for k, v in data.items():
        out_data[k] = extract_bluf(v)

    with open('/Users/daniel/Documents/AGY/the_system/batch_4_out.json', 'w') as f:
        json.dump(out_data, f, indent=4)
    
    print("Done")
