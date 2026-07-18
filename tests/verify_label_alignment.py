import json
import re
import sys

import os

base_dir = os.path.dirname(os.path.dirname(__file__))
taxonomy_path = os.path.join(base_dir, "docs", "LOS_Taxonomy.json")
actual_labels_path = os.path.join(base_dir, "exports", "Actual_Gmail_Labels.json")
report_path = os.path.join(base_dir, "label_alignment_report.md")

# 1. Load Taxonomy and Actual Labels
with open(taxonomy_path, "r", encoding="utf-8") as f:
    taxonomy = json.load(f)

with open(actual_labels_path, "r", encoding="utf-8") as f:
    actual_labels = json.load(f)

taxonomy_paths = set(item["Drive Path"] for item in taxonomy if "Drive Path" in item and item["Drive Path"])
actual_names = set(item["name"] for item in actual_labels if "name" in item)

print(f"Loaded {len(taxonomy_paths)} taxonomy paths.")
print(f"Loaded {len(actual_names)} actual Gmail labels.")

# 2. Parse label_alignment_report.md
with open(report_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

def split_markdown_row(line):
    temp = line.replace(r"\|", "__PIPE__")
    parts = [p.strip() for p in temp.split("|")]
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return [p.replace("__PIPE__", "|") for p in parts]

renames = []
deletes = []
creates = []
retains = []

current_section = ""

for line in lines:
    line = line.strip()
    if line.startswith("##"):
        current_section = line
        continue
    
    if not line.startswith("|") or "Current Gmail Label" in line or "Legacy Gmail Label" in line or "Target Gmail Label Path" in line or ":---" in line:
        continue
    
    # We only care about recommendations in section 3 and 4
    if not (current_section.startswith("### 3.") or current_section.startswith("### 4.")):
        continue
        
    parts = split_markdown_row(line)
    if len(parts) < 3:
        continue
        
    label = parts[0].replace("`", "")
    reason = parts[1]
    recommendation = parts[2]
    
    rec_clean = recommendation.replace("`", "")
    
    if "Rename/Split" in recommendation:
        paths = re.findall(r'`([^`]+)`', recommendation)
        renames.append({
            "section": current_section,
            "source": label,
            "targets": paths,
            "action": "Rename/Split",
            "raw": line
        })
    elif "Rename" in recommendation:
        paths = re.findall(r'`([^`]+)`', recommendation)
        if not paths:
            paths = [rec_clean.replace("**Rename** to", "").strip()]
        renames.append({
            "section": current_section,
            "source": label,
            "targets": [paths[0]],
            "action": "Rename",
            "raw": line
        })
    elif "Delete" in recommendation:
        deletes.append({
            "section": current_section,
            "source": label,
            "action": "Delete",
            "raw": line
        })
    elif "Create" in recommendation:
        creates.append({
            "section": current_section,
            "target": label,
            "action": "Create",
            "raw": line
        })
    elif "Retain" in recommendation:
        retains.append({
            "section": current_section,
            "source": label,
            "action": "Retain",
            "raw": line
        })

print(f"\n--- PARSING SUMMARY ---")
print(f"Renames count: {len(renames)}")
print(f"Creates count: {len(creates)}")
print(f"Deletes count: {len(deletes)}")
print(f"Retains count: {len(retains)}")

# Validation checks
failed = False

print(f"\n--- VALIDATION RUN ---")

# Check 1: BLUF Counts Match Unique Recommendations
print("Checking BLUF counts...")
if len(renames) != 108:
    print(f"[FAIL] Renames count {len(renames)} does not match BLUF 108")
    failed = True
else:
    print("[PASS] Renames count matches 108")

if len(creates) != 12:
    print(f"[FAIL] Creates count {len(creates)} does not match BLUF 12")
    failed = True
else:
    print("[PASS] Creates count matches 12")

if len(deletes) != 4:
    print(f"[FAIL] Deletes count {len(deletes)} does not match BLUF 4")
    failed = True
else:
    print("[PASS] Deletes count matches 4")

if len(retains) != 1:
    print(f"[FAIL] Retains count {len(retains)} does not match BLUF 1")
    failed = True
else:
    print("[PASS] Retains count matches 1")

# Check 2: Uniqueness of Recommendations
rename_sources = [r["source"] for r in renames]
create_targets = [c["target"] for c in creates]
delete_sources = [d["source"] for d in deletes]

if len(rename_sources) != len(set(rename_sources)):
    print(f"[WARN] Duplicate sources in renames: {set([x for x in rename_sources if rename_sources.count(x) > 1])}")
    failed = True
else:
    print("[PASS] Rename sources are unique")

if len(create_targets) != len(set(create_targets)):
    print(f"[WARN] Duplicate targets in creates: {set([x for x in create_targets if create_targets.count(x) > 1])}")
    failed = True
else:
    print("[PASS] Create targets are unique")

if len(delete_sources) != len(set(delete_sources)):
    print(f"[WARN] Duplicate sources in deletes: {set([x for x in delete_sources if delete_sources.count(x) > 1])}")
    failed = True
else:
    print("[PASS] Delete sources are unique")


# Check 3: All proposed renames targets and creations resolve to valid taxonomy paths.
print("\nChecking proposed renames targets against taxonomy...")
rename_targets_errors = []
for r in renames:
    for target in r["targets"]:
        if target not in taxonomy_paths:
            rename_targets_errors.append((r["source"], target))

if rename_targets_errors:
    print(f"[FAIL] The following rename targets do not exist in the taxonomy:")
    for src, tgt in rename_targets_errors:
        print(f"  - Source: {src} -> Target: {tgt}")
    failed = True
else:
    print("[PASS] All proposed renames targets exist in the taxonomy.")

print("\nChecking proposed creations against taxonomy...")
create_targets_errors = []
for c in creates:
    if c["target"] not in taxonomy_paths:
        create_targets_errors.append(c["target"])

if create_targets_errors:
    print(f"[FAIL] The following created labels do not exist in the taxonomy:")
    for tgt in create_targets_errors:
        print(f"  - Target: {tgt}")
    failed = True
else:
    print("[PASS] All proposed creations exist in the taxonomy.")


# Check 4: Obsolete/unrecognized root labels proposed for deletion exist in actual labels and are not active taxonomy nodes.
print("\nChecking obsolete/unrecognized root labels proposed for deletion...")
delete_errors = []
for d in deletes:
    src = d["source"]
    in_actual = src in actual_names
    in_taxonomy = src in taxonomy_paths
    
    print(f"Delete label '{src}': in_actual={in_actual}, in_taxonomy={in_taxonomy}")
    if not in_actual:
        print(f"  [FAIL] Label '{src}' is proposed for deletion but does not exist in actual Gmail labels.")
        delete_errors.append(src)
    if in_taxonomy:
        print(f"  [FAIL] Label '{src}' is proposed for deletion but is an active taxonomy node.")
        delete_errors.append(src)

if delete_errors:
    failed = True
    print("[FAIL] Some delete recommendations failed validation.")
else:
    print("[PASS] All proposed deletes exist in actual labels and are not active taxonomy nodes.")


# Check 5: Retained label daniel.adersteg@revolut.com
print("\nChecking retained label...")
retain_errors = []
for r in retains:
    src = r["source"]
    in_actual = src in actual_names
    in_taxonomy = src in taxonomy_paths
    print(f"Retain label '{src}': in_actual={in_actual}, in_taxonomy={in_taxonomy}")
    if not in_actual:
        print(f"  [FAIL] Retained label '{src}' does not exist in actual Gmail labels.")
        retain_errors.append(src)
    if in_taxonomy:
        print(f"  [WARN] Retained label '{src}' exists in the taxonomy (not expected for Revolut tag).")

if retain_errors:
    failed = True
    print("[FAIL] Retain validation failed.")
else:
    print("[PASS] Retain validation passed.")


# Extra Check 6: Check that all rename sources exist in the actual labels.
print("\nChecking if rename sources exist in actual labels...")
rename_source_not_in_actual = []
for r in renames:
    if r["source"] not in actual_names:
        rename_source_not_in_actual.append(r["source"])

if rename_source_not_in_actual:
    print(f"[WARN] The following rename sources do not exist in the actual Gmail labels:")
    for src in rename_source_not_in_actual:
        print(f"  - {src}")
else:
    print("[PASS] All rename source labels exist in the actual Gmail labels.")


# Extra Check 7: Check that all creations do NOT exist in actual labels.
print("\nChecking if created labels do not already exist in actual labels...")
creates_in_actual = []
for c in creates:
    if c["target"] in actual_names:
        creates_in_actual.append(c["target"])

if creates_in_actual:
    print(f"[WARN] The following created labels already exist in actual Gmail labels (unexpected for missing labels):")
    for tgt in creates_in_actual:
        print(f"  - {tgt}")
else:
    print("[PASS] None of the proposed created labels exist in the actual Gmail labels.")


# Overall Verdict
print(f"\n--- OVERALL VERDICT ---")
if failed:
    print("VERDICT: FAIL")
    sys.exit(1)
else:
    print("VERDICT: PASS")
    sys.exit(0)
