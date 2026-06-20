import json
import re

BRITISH_SPELLING = {
    r'\bdefense\b': 'defence',
    r'\bDefense\b': 'Defence',
    r'\boffense\b': 'offence',
    r'\bOffense\b': 'Offence',
    r'\bfavor\b': 'favour',
    r'\bFavor\b': 'Favour',
    r'\bfavors\b': 'favours',
    r'\bFavors\b': 'Favours',
    r'\bfavorable\b': 'favourable',
    r'\bFavorable\b': 'Favourable',
    r'\borganize\b': 'organise',
    r'\bOrganize\b': 'Organise',
    r'\banalyze\b': 'analyse',
    r'\bAnalyze\b': 'Analyse',
    r'\bmaximization\b': 'maximisation',
    r'\bMaximization\b': 'Maximisation',
    r'\bmaximize\b': 'maximise',
    r'\bMaximize\b': 'Maximise',
    r'\bminimize\b': 'minimise',
    r'\bMinimize\b': 'Minimise',
    r'\bpractice\b': 'practise', 
    r'\bbehavior\b': 'behaviour',
    r'\bBehavior\b': 'Behaviour',
    r'\bcenter\b': 'centre',
    r'\bCenter\b': 'Centre',
    r'\bmodeling\b': 'modelling',
    r'\bModeling\b': 'Modelling',
    r'\bmodeled\b': 'modelled',
    r'\bModeled\b': 'Modelled',
    r'\brealize\b': 'realise',
    r'\bRealize\b': 'Realise',
    r'\brecognize\b': 'recognise',
    r'\bRecognize\b': 'Recognise',
}

def to_british(text):
    for us, uk in BRITISH_SPELLING.items():
        text = re.sub(us, uk, text)
    return text

def extract(text, start, end_tokens):
    idx = text.find(start)
    if idx == -1: return ""
    idx += len(start)
    end_idx = len(text)
    for t in end_tokens:
        pos = text.find(t, idx)
        if pos != -1 and pos < end_idx:
            end_idx = pos
    return text[idx:end_idx].strip()

def process_model(md_text):
    # Extract core sections
    concept = extract(md_text, "**Concept:**", ["**Feasibility:**", "**Practicality:**", "**The Edge:**", "**Layer 1:**"])
    edge = extract(md_text, "**The Edge:**", ["**Layer 1:**"])
    
    # Extract Betting Market
    market_match = re.search(r'\*\*Betting Market:\*\*(.*?)(?=\n\*\*|\Z)', md_text, re.IGNORECASE)
    market = ""
    if market_match:
        market = market_match.group(1).strip()
    
    # Strip markdown and clean up whitespace
    concept = re.sub(r'[*#]', '', concept)
    edge = re.sub(r'[*#]', '', edge)
    market = re.sub(r'[*#]', '', market)
    
    concept = re.sub(r'\s+', ' ', concept).strip()
    edge = re.sub(r'\s+', ' ', edge).strip()
    market = re.sub(r'\s+', ' ', market).strip()
    
    # Construct Strategy string
    strategy_parts = []
    if market:
        strategy_parts.append(f"Bet on: {market}.")
    if concept:
        strategy_parts.append(concept)
    if edge:
        strategy_parts.append(f"The core edge: {edge}")
    
    strategy_text = " ".join(strategy_parts)
    strategy_text = to_british(strategy_text)

    # Efficiency
    feas = re.search(r'\*\*Feasibility:\*\*\s*([\d\.]+/\d+)', md_text)
    pract = re.search(r'\*\*Practicality:\*\*\s*([\d\.]+/\d+)', md_text)
    roi = re.search(r'\*\*ROI:\*\*\s*([^\n\*]+)', md_text)
    win = re.search(r'\*\*Win Rate:\*\*\s*([^\n\*]+)', md_text)
    comp = re.search(r'\*\*Composite Score:\*\*\s*([^\n\*]+)', md_text)
    
    eff = []
    if roi: eff.append(f"ROI: {roi.group(1).strip()}")
    if win: eff.append(f"Win Rate: {win.group(1).strip()}")
    if feas: eff.append(f"Feasibility: {feas.group(1).strip()}")
    if pract: eff.append(f"Practicality: {pract.group(1).strip()}")
    if comp: eff.append(f"Composite Score: {comp.group(1).strip()}")
    
    efficiency_text = ", ".join(eff) if eff else "N/A"
    
    # Key Takeaway (from last layer or generic)
    layers = re.findall(r'\*\*Layer \d+:\*\*(.*?)(?=\*\*Layer \d+:\*\*|\*\*Status|\Z)', md_text, re.DOTALL | re.IGNORECASE)
    if layers:
        last_layer = layers[-1]
        last_layer = re.sub(r'[*#]', '', last_layer)
        last_layer = re.sub(r'\s+', ' ', last_layer).strip()
        takeaway_text = f"Optimal condition: {last_layer}"
    else:
        takeaway_text = "Exploit market inefficiencies by identifying contextual fatigue and situational letdowns."
        
    takeaway_text = to_british(takeaway_text)
    
    # Replace any newlines inside the text blocks just to be absolutely certain
    strategy_text = strategy_text.replace('\n', ' ')
    efficiency_text = efficiency_text.replace('\n', ' ')
    takeaway_text = takeaway_text.replace('\n', ' ')
    
    bluf = f"**Strategy:** {strategy_text} **Efficiency:** {efficiency_text} **Key Takeaway:** {takeaway_text}"
    return bluf

def main():
    input_path = '/Users/daniel/Documents/AGY/the_system/batch_3.json'
    output_path = '/Users/daniel/Documents/AGY/the_system/batch_3_out.json'
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    out_data = {}
    for filename, md in data.items():
        out_data[filename] = process_model(md)
        
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(out_data, f, indent=4)
        
    print(f"Successfully processed {len(out_data)} models and saved to {output_path}")

if __name__ == '__main__':
    main()
