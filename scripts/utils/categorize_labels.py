import json
import re

def get_valid_labels():
    with open('docs/LOS_Taxonomy.json', 'r') as f:
        taxonomy = json.load(f)
    
    valid_labels = set()
    for entry in taxonomy:
        if "Concat (Label)" in entry and entry["Concat (Label)"]:
            valid_labels.add(entry["Concat (Label)"])
            
    system_labels = {
        "CHAT", "SENT", "INBOX", "IMPORTANT", "TRASH", "DRAFT", "SPAM", "STARRED", "UNREAD",
        "CATEGORY_FORUMS", "CATEGORY_UPDATES", "CATEGORY_PERSONAL", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL",
        "GREEN_CIRCLE", "RED_CIRCLE", "BLUE_STAR", "YELLOW_STAR"
    }
    valid_labels.update(system_labels)
    
    operational_labels = {
        "00 Manual Review", "00 No Filter", "00 Test", 
        "99 Google Comments", "99 Label_Reviewed", "99 SMS", 
        "99 Telegram", "99 Messenger", "99 WhatsApp", "99 To be deleted",
        "danieladersteg@hotmail.com", "danieladerstegov@hotmail.com", 
        "daniel@martens-adersteg.com", "d.a.xov@live.se", "erik.patrik555@gmail.com"
    }
    valid_labels.update(operational_labels)
    
    # Add explicit ones found in the markdown that might be missing from JSON
    extra_from_md = {
        "01 Private/05 Other/99 Archive/20260411 Housewarming C&D",
        "02 Work/01 Employment/01 Quantum 21",
        "02 Work/01 Employment/01 Quantum 21/01 Professional Admin",
        "02 Work/01 Employment/01 Quantum 21/02 Team & Operations",
        "02 Work/01 Employment/01 Quantum 21/03 Professional Growth",
        "02 Work/01 Employment/01 Quantum 21/05 Projects",
        "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin",
        "03 Studies/02 Uppsala University/01 År 1 | (2009-2010)",
        "03 Studies/02 Uppsala University/02 År 2 | (2010-2011)",
        "03 Studies/02 Uppsala University/03 År 3 | (2011-2012)",
        "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "03 Studies/02 Uppsala University/05 År 5 | (2014-2015)"
    }
    valid_labels.update(extra_from_md)
    return valid_labels

def main():
    valid_labels = get_valid_labels()
    
    labels_to_process = []
    with open('bad_labels_output.txt', 'r') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line or line.startswith("Fetching"):
            continue
        if "] " in line and " (ID:" in line:
            parts = line.split("] ", 1)
            name_and_id = parts[1].split(" (ID: ")
            name = name_and_id[0].strip()
            label_id = name_and_id[1].rstrip(")")
            
            if name not in valid_labels:
                labels_to_process.append((name, label_id))
                
    migrations = []
    splits = []
    deletions = []
    
    # Hardcoded known migrations
    known_migrations = {
        "01 Private/05 Other/02 Relationships/Mamma och Pappa": "01 Private/05 Other/02 Relationships/Mamma & Pappa",
        "01 Private/05 Other/02 Relationships/CMA": "01 Private/05 Other/02 Relationships/Carry Martens Adersteg",
        "01 Private/05 Other/03 Collections/Useful & Helpful": "01 Private/05 Other/03 Collections/Useful & Helpful",
        "01 Private/05 Other/03 Collections/Useful": "01 Private/05 Other/03 Collections/Useful & Helpful",
        "03 Studies/01 År 1 | (2009-2010)": "03 Studies/02 Uppsala University/01 År 1 | (2009-2010)",
        "03 Studies/02 År 2 | (2010-2011)": "03 Studies/02 Uppsala University/02 År 2 | (2010-2011)",
        "03 Studies/03 År 3 | (2011-2012)": "03 Studies/02 Uppsala University/03 År 3 | (2011-2012)",
        "03 Studies/04 År 4 | (2012": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "2014)": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "03 Studies/04 År 4 | (2012, 2014)": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "03 Studies/05 År 5 | (2014-2015)": "03 Studies/02 Uppsala University/05 År 5 | (2014-2015)",
        "01 Private/05 Other/01 Projects/20260411 Housewarming C&D": "01 Private/05 Other/99 Archive/20260411 Housewarming C&D",
        "01 Private/05 Other/01 Projects/2027 W": "01 Private/05 Other/01 Projects/2027 Wedding",
        "01 Private/05 Other/01 Projects/The System (TS)": "01 Private/01 Personal Admin/01 Task Management/The System (TS)",
        "01 Private/04 Finances/01 Purchase [AGGREGATOR]/Receipts": "01 Private/04 Finances/01 Purchase/Receipts",
        "00 Google Comments": "99 Google Comments",
        "01 Private/03 Personal Growth/01 Principles": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
        "Goals & Methods": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
        "02 Work/01 Employment/01 202605 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Current Roles/202605 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Quantum 21/01 Professional Admin": "02 Work/01 Employment/01 202605 Quantum 21/01 Professional Admin",
        "02 Work/01 Employment/01 Quantum 21/02 Team & Operations": "02 Work/01 Employment/01 202605 Quantum 21/02 Team & Operations",
        "02 Work/01 Employment/01 Quantum 21/03 Professional Growth": "02 Work/01 Employment/01 202605 Quantum 21/03 Professional Growth",
        "02 Work/01 Employment/01 Quantum 21/05 Projects": "02 Work/01 Employment/01 202605 Quantum 21/05 Projects",
        "02 Work/01 Employment/01 Playmetech/01 Professional Admin": "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin",
        "99 Delete": "99 To be deleted",
        "03 Studies/99 Archive": "03 Studies/99 Studies Archive",
        "03 Studies/99 Archive/Stockholms Nation": "03 Studies/99 Studies Archive/Stockholms Nation",
        "03 Studies/99 Archive/Uppsala University": "03 Studies/99 Studies Archive/Uppsala University",
        "03 Studies/03 00 00": "03 Studies/03 Stockholms Nation",
        "03 Studies/03 00 00/99 Studies Archive": "03 Studies/99 Studies Archive/Stockholms Nation",
        "daniel.adersteg@revolut.com": "02 Work/01 Employment/99 Archive/201911 Revolut",
        "01 Private/05 Other/01 Projects/Colab Notebooks": "01 Private/05 Other/01 Projects/Data Analysis & Software Development",
        "01 Professional Admin/Task Management": "01 Private/01 Personal Admin/01 Task Management",
        "01 Professional Admin/04 Finances/01 Purchase": "01 Private/04 Finances/01 Purchase",
        "02 Work/02 Career Management/Job Descriptions": "02 Work/02 Career Management",
    }
    
    for name, l_id in labels_to_process:
        if name in known_migrations:
            migrations.append((name, l_id, known_migrations[name]))
        elif "," in name:
            # Check if splitting by comma yields valid labels
            parts = [p.strip() for p in name.split(",")]
            all_valid = True
            for p in parts:
                if p not in valid_labels and p not in known_migrations:
                    all_valid = False
            if all_valid:
                splits.append((name, l_id, parts))
            else:
                deletions.append((name, l_id))
        else:
            # Heuristics for pure garbage
            if re.match(r'^[a-zA-Z0-9_-]{20,}$', name): # Likely a hash/id like ckRyaFdyMmd...
                deletions.append((name, l_id))
            elif "Attend the perfume workshop" in name or "Present the gift voucher" in name:
                deletions.append((name, l_id))
            elif name in ["98 SMS", "98 Telegram", "98 WhatsApp"]:
                migrations.append((name, l_id, name.replace("98", "99")))
            else:
                # Add to manual review list basically (we will propose them for review/deletion)
                deletions.append((name, l_id))
                
    # Sort
    migrations.sort(key=lambda x: x[0])
    splits.sort(key=lambda x: x[0])
    deletions.sort(key=lambda x: x[0])
    
    def escape_pipe(text):
        return text.replace("|", "\\|")
        
    with open('/Users/daniel/.gemini/antigravity/brain/cf6fe771-930a-4d43-b141-324c8bdc2649/labels_to_delete.md', 'w') as f:
        f.write("# Gmail Label Cleanup & Migration Plan\n\n")
        f.write("You were totally right. Many of these are historical labels, shifted labels, or fragments that need to be carefully migrated rather than deleted. Here is the revised plan:\n\n")
        
        f.write("## 1. Labels to Migrate (Rename / Re-parent)\n")
        f.write("These labels will not be deleted. Their emails will be moved to the correct equivalent in the current LOS taxonomy, and then the old label will be removed.\n\n")
        f.write("| Old Label (To Remove) | -> | Target Label (To Apply) |\n")
        f.write("| :--- | :--- | :--- |\n")
        for old, l_id, new in migrations:
            f.write(f"| `{escape_pipe(old)}` | -> | `{escape_pipe(new)}` |\n")
            
        f.write("\n## 2. Labels to Split\n")
        f.write("These labels are accidental comma-separated concatenations. I will apply BOTH valid labels to the emails and delete the concatenated label.\n\n")
        f.write("| Concatenated Label | -> | Valid Labels to Apply |\n")
        f.write("| :--- | :--- | :--- |\n")
        for old, l_id, parts in splits:
            f.write(f"| `{escape_pipe(old)}` | -> | `{escape_pipe(str(parts))}` |\n")
            
        f.write("\n## 3. Unrecognized / Garbage (To Delete)\n")
        f.write("These appear to be true garbage (hashes, full sentences, orphaned fragments). Emails will not be deleted, but these labels will be wiped.\n\n")
        f.write("| Label Name | Internal ID | Reason |\n")
        f.write("| :--- | :--- | :--- |\n")
        for name, l_id in deletions:
            reason = "Orphaned fragment / Unknown"
            if len(name) > 20 and " " not in name: reason = "Looks like an ID hash"
            if " " in name and len(name.split()) > 5: reason = "Looks like a Subject Line"
            f.write(f"| `{escape_pipe(name)}` | `{l_id}` | {reason} |\n")
            
if __name__ == '__main__':
    main()
