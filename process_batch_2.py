import json
import re

def to_british(text):
    replacements = {
        "favor": "favour",
        "behavior": "behaviour",
        "analyze": "analyse",
        "defense": "defence",
        "offense": "offence",
        "capitalize": "capitalise",
        "maximize": "maximise",
        "optimization": "optimisation",
        "color": "colour",
        "honor": "honour",
        "rumor": "rumour",
        "program": "programme",
        "Defense": "Defence",
        "Offense": "Offence",
        "Favor": "Favour"
    }
    for us, uk in replacements.items():
        text = text.replace(us, uk)
    return text

def main():
    with open("/Users/daniel/Documents/AGY/the_system/batch_2.json", "r") as f:
        data = json.load(f)

    res = {}
    for k, v in data.items():
        # extract components
        concept_match = re.search(r"\*\*Concept:\*\*\s*(.*?)\s*\*\*(?:Feasibility|Variables|The Edge)", v, re.DOTALL)
        edge_match = re.search(r"\*\*The Edge:\*\*\s*(.*?)\s*\*\*Layer 1", v, re.DOTALL)
        feas = re.search(r"\*\*Feasibility:\*\*\s*([^\n]+)", v)
        prac = re.search(r"\*\*Practicality:\*\*\s*([^\n]+)", v)
        bet = re.search(r"\*\*Betting Market:\*\*\s*([^\n]+)", v)
        roi = re.search(r"\*\*ROI:\*\*\s*([^\n]+)", v)
        win_rate = re.search(r"\*\*Win Rate:\*\*\s*([^\n]+)", v)
        comp_score = re.search(r"\*\*Composite Score:\*\*\s*([^\n]+)", v)

        concept_text = concept_match.group(1).strip().replace("\n", " ") if concept_match else ""
        edge_text = edge_match.group(1).strip().replace("\n", " ") if edge_match else ""
        
        # Clean up Strategy
        strategy = f"{concept_text} {edge_text}".strip()
        strategy = to_british(strategy)
        strategy = re.sub(r"\s+", " ", strategy)
        if not strategy:
            strategy = "Exploiting inefficiencies based on situational factors."
            
        eff_parts = []
        if roi: eff_parts.append(f"ROI: {roi.group(1).strip()}")
        if win_rate: eff_parts.append(f"Win Rate: {win_rate.group(1).strip()}")
        if feas: eff_parts.append(f"Feasibility: {feas.group(1).strip()}")
        if prac: eff_parts.append(f"Practicality: {prac.group(1).strip()}")
        if comp_score: eff_parts.append(f"Composite Score: {comp_score.group(1).strip()}")
        efficiency = ", ".join(eff_parts) if eff_parts else "N/A"
        
        bet_market = bet.group(1).strip() if bet else "specific markets"
        takeaway = f"Focusing on {bet_market} allows bettors to capitalise on market blindspots and maximise returns."
        
        bluf = f"**Strategy:** {strategy} **Efficiency:** {efficiency} **Key Takeaway:** {takeaway}"
        res[k] = bluf

    with open("/Users/daniel/Documents/AGY/the_system/batch_2_out.json", "w") as f:
        json.dump(res, f, indent=2)

if __name__ == "__main__":
    main()
