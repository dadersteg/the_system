import os
import json

def generate_report():
    # 1. Load the valid labels from LOS_Taxonomy.json
    with open('docs/LOS_Taxonomy.json', 'r') as f:
        taxonomy = json.load(f)
    
    valid_labels = set()
    for entry in taxonomy:
        if "Concat (Label)" in entry and entry["Concat (Label)"]:
            valid_labels.add(entry["Concat (Label)"])
            
    # 2. Add System Labels
    system_labels = {
        "CHAT", "SENT", "INBOX", "IMPORTANT", "TRASH", "DRAFT", "SPAM", "STARRED", "UNREAD",
        "CATEGORY_FORUMS", "CATEGORY_UPDATES", "CATEGORY_PERSONAL", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL",
        "GREEN_CIRCLE", "RED_CIRCLE", "BLUE_STAR", "YELLOW_STAR"
    }
    valid_labels.update(system_labels)
    
    # 3. Add Operational and Alias Labels from TS - Categorisation (Private).md
    operational_labels = {
        "00 Manual Review", "00 No Filter", "00 Test", 
        "99 Google Comments", "99 Label_Reviewed", "99 SMS", 
        "99 Telegram", "99 Messenger", "99 WhatsApp", "99 To be deleted",
        "danieladersteg@hotmail.com", "danieladerstegov@hotmail.com", 
        "daniel@martens-adersteg.com", "d.a.xov@live.se", "erik.patrik555@gmail.com"
    }
    valid_labels.update(operational_labels)
    
    # 4. Load the actual labels we fetched earlier
    labels_to_delete = []
    with open('bad_labels_output.txt', 'r') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line or line.startswith("Fetching"):
            continue
            
        # Parse line like "[user] 98 SMS (ID: Label_757)"
        if "] " in line and " (ID:" in line:
            parts = line.split("] ", 1)
            name_and_id = parts[1].split(" (ID: ")
            name = name_and_id[0].strip()
            label_id = name_and_id[1].rstrip(")")
            
            if name not in valid_labels:
                labels_to_delete.append((name, label_id))
                
    # 5. Generate Markdown Report
    report_path = "/Users/daniel/.gemini/antigravity/brain/cf6fe771-930a-4d43-b141-324c8bdc2649/labels_to_delete.md"
    with open(report_path, 'w') as f:
        f.write("# Gmail Labels Scheduled for Deletion\n\n")
        f.write("The following labels were found in your Gmail account but do **not** exist in the master taxonomy. Approving this plan will permanently delete these labels from your Gmail account. This will remove them from the sidebar and from any emails they were attached to.\n\n")
        f.write("| Label Name | Internal ID |\n")
        f.write("| :--- | :--- |\n")
        
        # Sort alphabetically for easy reading
        labels_to_delete.sort(key=lambda x: x[0].lower())
        for name, l_id in labels_to_delete:
            f.write(f"| `{name}` | `{l_id}` |\n")
            
        f.write(f"\n**Total Invalid Labels to Delete:** {len(labels_to_delete)}\n")

if __name__ == '__main__':
    generate_report()
