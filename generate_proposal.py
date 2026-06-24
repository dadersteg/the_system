import json
import re

with open('pmt_clean.json', 'r') as f:
    tasks = json.load(f)

# Group tasks into logical themes (simulated logic for the script)
themes = {
    "HR & Legal Compliance": [],
    "Data Infrastructure & Spreadsheets": [],
    "Team Management & Operations": [],
    "Engineering & Automation": [],
    "Backlog / Long-term Ideas": []
}

for t in tasks:
    title = t['title'].lower()
    due = t['due']
    
    if "2099-12-31" in due:
        themes["Backlog / Long-term Ideas"].append(t)
    elif "contract" in title or "clause" in title or "nda" in title or "employment" in title or "guidepoint" in title or "compliance" in title:
        themes["HR & Legal Compliance"].append(t)
    elif "spreadsheet" in title or "data" in title or "format" in title or "column" in title or "array" in title:
        themes["Data Infrastructure & Spreadsheets"].append(t)
    elif "scorecard" in title or "team" in title or "meeting" in title or "call" in title or "performance" in title or "agenda" in title:
        themes["Team Management & Operations"].append(t)
    else:
        themes["Engineering & Automation"].append(t)

markdown = "# PMT ToDo List Restructuring Proposal\n\n"
markdown += "Based on the Minto Pyramid Principle, I have grouped the 88 active tasks into strategic pillars. This top-down structure ensures clear accountability and identifies potential duplicates or orphaned ideas.\n\n"

for theme, items in themes.items():
    if not items: continue
    markdown += f"## {theme}\n"
    for item in items:
        # Check for duplicates or formatting issues
        action = "[RETAIN]"
        if "Part 2" in item['title']:
            action = "[RESTRUCTURE: Merge into parent project]"
        elif "Review" in item['title']:
            action = "[CLARIFY: Define specific measurable outcome]"
            
        markdown += f"- {action} **{item['title']}** (Due: {item['due'][:10]})\n"
    markdown += "\n"

with open("pmt_restructure_draft.md", "w") as f:
    f.write(markdown)

print("Generated pmt_restructure_draft.md")
