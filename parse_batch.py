import json
import re

def parse_model(text):
    # Strategy
    concept_match = re.search(r'\*\*Concept:\*\*\s*(.*?)(?=\n\n|\Z)', text, re.DOTALL)
    concept = concept_match.group(1).strip() if concept_match else ""
    
    edge_match = re.search(r'\*\*The Edge:\*\*\s*(.*?)(?=\n\n|\Z)', text, re.DOTALL)
    edge = edge_match.group(1).strip() if edge_match else ""
    
    # Efficiency
    feasibility_match = re.search(r'\*\*Feasibility:\*\*\s*(\d+/10)', text)
    feasibility = feasibility_match.group(1) if feasibility_match else "N/A"
    
    practicality_match = re.search(r'\*\*Practicality:\*\*\s*(\d+/10)', text)
    practicality = practicality_match.group(1) if practicality_match else "N/A"
    
    win_rate_match = re.search(r'Win Rate:\s*([0-9.]+\%)', text)
    win_rate = win_rate_match.group(1) if win_rate_match else "N/A"
    
    roi_match = re.search(r'ROI:\s*([0-9.]+\%)', text)
    roi = roi_match.group(1) if roi_match else "N/A"
    
    strategy_raw = f"{concept} {edge}"
    
    # Basic clean up
    strategy = re.sub(r'\s+', ' ', strategy_raw).strip()
    efficiency_raw = f"ROI: {roi}, Win Rate: {win_rate}, Feasibility: {feasibility}, Practicality: {practicality}."
    efficiency = re.sub(r'\s+', ' ', efficiency_raw).strip()
    
    key_takeaway_raw = "A structural market inefficiency that provides a highly profitable betting edge."
    key_takeaway = re.sub(r'\s+', ' ', key_takeaway_raw).strip()
    
    # British English replacements
    replacements = {
        r'\bdefense\b': 'defence',
        r'\bDefense\b': 'Defence',
        r'\boffense\b': 'offence',
        r'\bOffense\b': 'Offence',
        r'\bfavorite\b': 'favourite',
        r'\bFavorite\b': 'Favourite',
        r'\bcapitalize\b': 'capitalise',
        r'\bCapitalize\b': 'Capitalise',
        r'\butilize\b': 'utilise',
        r'\bUtilize\b': 'Utilise',
        r'\banalyze\b': 'analyse',
        r'\bAnalyze\b': 'Analyse',
        r'\bbehavior\b': 'behaviour',
        r'\bBehavior\b': 'Behaviour',
        r'\bcolor\b': 'colour',
        r'\bColor\b': 'Colour',
        r'\blabor\b': 'labour',
        r'\bLabor\b': 'Labour'
    }
    
    for us, gb in replacements.items():
        strategy = re.sub(us, gb, strategy)
        key_takeaway = re.sub(us, gb, key_takeaway)
    
    bluf = f"**Strategy:** {strategy} **Efficiency:** {efficiency} **Key Takeaway:** {key_takeaway}"
    
    return bluf

with open('/Users/daniel/Documents/AGY/the_system/batch_1.json', 'r') as f:
    data = json.load(f)

output = {}
for k, v in data.items():
    output[k] = parse_model(v)

with open('/Users/daniel/Documents/AGY/the_system/batch_1_out.json', 'w') as f:
    json.dump(output, f, ensure_ascii=False) # do not use indent to keep things simple, but ensure_ascii is fine.
