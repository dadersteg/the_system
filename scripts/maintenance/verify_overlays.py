#!/usr/bin/env python3
"""
verify_overlays.py

Audits the local 'data/notebooks_export.json' to ensure all NotebookLM
notebooks adhere strictly to the LOS Taxonomy nomenclature.
Notebooks must either be a "Base Bucket" (e.g., matching a high-level taxonomy node)
or a specific Transversal Overlay (e.g., matching a specific project).
"""

import os
import json
import sys

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log_status(success, task, message):
    status = f"{Colors.OKGREEN}[✅ SUCCESS]{Colors.ENDC}" if success else f"{Colors.FAIL}[❌ FAILED]{Colors.ENDC}"
    print(f"  {status} {task}: {message}")

def log_warning(task, message):
    print(f"  {Colors.WARNING}[⚠️ WARNING]{Colors.ENDC} {task}: {message}")

def load_taxonomy(filepath):
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        log_warning("Taxonomy Load", f"Could not load {filepath} - {e}")
        return []

def extract_valid_bases(taxonomy_list):
    """Extracts all valid taxonomy nodes (e.g., '01 01 00 Personal Admin')"""
    valid_bases = set()
    for entry in taxonomy_list:
        label = entry.get("Concat (Label)", "")
        if label:
            # Add the full label (e.g., '01 Private/01 Personal Admin')
            valid_bases.add(label.lower().strip())
            # Add the specific terminal node if separated by '/'
            parts = label.split('/')
            for part in parts:
                valid_bases.add(part.lower().strip())
    return valid_bases

def main():
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")
    print(f"{Colors.BOLD}       THE SYSTEM: OVERLAY NOMENCLATURE AUDIT       {Colors.ENDC}")
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    system_root = os.path.abspath(os.path.join(script_dir, '../../'))
    data_dir = os.path.join(system_root, 'data')
    
    los_path = os.path.join(system_root, 'docs', 'LOS_Taxonomy.json')
    pmtos_path = os.path.join(system_root, '../agy_pmt/01_playmetech_admin/the_system_pmt/PMTOS_Taxonomy.json')
    notebooks_export_path = os.path.join(system_root, 'data', 'notebooks_export.json')
    
    los_data = load_taxonomy(los_path)
    pmtos_data = load_taxonomy(pmtos_path)
    
    valid_bases = extract_valid_bases(los_data)
    valid_bases.update(extract_valid_bases(pmtos_data))
    
    # Add known hardcoded high-level L1/L2 base buckets that might not map perfectly to JSON
    # based on user's screenshots
    known_bases = [
        "01 01 00 personal admin",
        "01 02 00 health",
        "01 03 00 personal growth",
        "01 04 00 finances",
        "01 05 00 other",
        "01 05 01 projects",
        "02 01 00 employment",
        "02 02 00 career management",
        "02 03 00 collections",
        "01 01 01 the system (ts)",
        "02 01 03 professional growth",
        "02 01 03 betting intelligence",
        "01 05 01 2027 wedding",
        "01 05 03 collections",
        "01 04 02 house",
        "02 02 99 archive",
        "01 03 03 personal growth theory",
        "01 05 01 ai"
    ]
    for kb in known_bases:
        valid_bases.add(kb)
    
    if not os.path.exists(notebooks_export_path):
        log_status(False, "Notebooks Export", f"File not found at {notebooks_export_path}. Run the audit_overlays skill first.")
        return
        
    try:
        with open(notebooks_export_path, 'r') as f:
            export_data = json.load(f)
            notebooks = export_data.get("notebooks", [])
    except Exception as e:
        log_status(False, "Notebooks Export", f"Failed to read JSON: {e}")
        return
        
    if not notebooks:
        log_warning("Notebooks Audit", "No notebooks found in export.")
        return
        
    print(f"\n{Colors.OKBLUE}Auditing {len(notebooks)} active NotebookLM notebooks...{Colors.ENDC}\n")
    
    violations = []
    
    for nb in notebooks:
        title = nb.get("title", "")
        # The naming protocol typically uses "BASE > Specific Project" or just "BASE"
        # We check if the title strictly adheres to a taxonomy prefix.
        
        # Example format: "02 01 03 Betting Intelligence > WTA In-Play Trading Viability"
        if " > " in title:
            base_part = title.split(" > ")[0].strip().lower()
        else:
            base_part = title.strip().lower()
            
        is_valid = False
        for valid_base in valid_bases:
            if base_part == valid_base or base_part.startswith(valid_base) or valid_base.startswith(base_part):
                is_valid = True
                break
                
        if is_valid:
            log_status(True, f"Notebook: '{title}'", "Valid nomenclature.")
        else:
            log_status(False, f"Notebook: '{title}'", "ROGUE NOMENCLATURE. Does not match Taxonomy Base Buckets.")
            violations.append(title)
            
    print(f"\n{Colors.BOLD}===================================================={Colors.ENDC}")
    if violations:
        print(f"{Colors.FAIL}Audit Failed! Found {len(violations)} rogue notebooks:{Colors.ENDC}")
        for v in violations:
            print(f"  - {v}")
    else:
        print(f"{Colors.OKGREEN}Audit Passed! All NotebookLM instances strictly follow Taxonomy.{Colors.ENDC}")
    print(f"{Colors.BOLD}===================================================={Colors.ENDC}")

if __name__ == "__main__":
    main()
