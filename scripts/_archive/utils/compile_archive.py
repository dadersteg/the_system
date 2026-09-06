import re

with open("docs/TS - Categorisation.md", "r") as f:
    lines = f.readlines()

archive_items = []
in_archive = False
for line in lines:
    if line.startswith("### 4.1. Archive (L4)"):
        in_archive = True
        continue
    
    if in_archive and line.startswith("|") and not "---" in line and not "Parent | Code" in line:
        parts = [p.strip() for p in line.split("|") if p.strip()]
        if len(parts) >= 3:
            parent = parts[0]
            code = parts[1].replace("**", "")
            archive_items.append({"parent": parent, "code": code})

archive_md = "# Life Organisation System (LOS) - Categorisation Archive\n\n"
archive_md += "**Status:** Active | **Purpose:** Legacy Archive Reference\n\n"
archive_md += "This document is automatically compiled from the 4.1 Archive (L4) table in TS - Categorisation.md. It acts as a curated registry of historical projects, past employers, and concluded studies. Random physical sub-folders are intentionally excluded.\n\n---\n\n"

from collections import defaultdict
grouped = defaultdict(list)
for item in archive_items:
    l2_prefix = item["parent"][:5] + " 99"
    # Basic mapping for readability
    mapping = {
        "01 01 99": "Personal Admin Archive",
        "01 02 99": "Health Archive",
        "01 03 99": "Personal Growth Archive",
        "01 04 99": "Finances Archive",
        "01 05 99": "Other/Projects Archive",
        "02 01 99": "Employment Archive",
        "02 02 99": "Career Management Archive",
        "03 00 99": "Studies Archive"
    }
    l2_name = mapping.get(l2_prefix, "Unknown Archive")
    grouped[f"{l2_prefix} ({l2_name})"].append(item["code"])

for l2 in sorted(grouped.keys()):
    archive_md += f"### {l2}\n"
    for l4 in sorted(grouped[l2]):
        archive_md += f"- {l4}\n"
    archive_md += "\n"

with open("docs/TS - Categorisation Archive.md", "w") as f:
    f.write(archive_md)

print("Archive MD built cleanly from Categorisation.md!")
