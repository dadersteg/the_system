import os
import re
import sys
import json
import argparse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Valid roots and their IDs
REAL_ROOT_MAP = {
    '01 00 00 Private': '0B85__gYrQ-2Ud3JDY004TE4xYW8',
    '02 00 00 Work': '0B85__gYrQ-2USXRlV3RQSUd6RUk',
    '03 00 00 Studies': '0B85__gYrQ-2UcE5oeFhDRWg1YVE',
    '99 00 00 Archive': '1nJFVZbiAWArdP6pU-RBdLrKkD0rlelwY'
}

# Stray folders and their IDs
STRAY_ROOT_MAP = {
    '02 XX 99 Work Archive': '1eLuHfE-nh6UamuRgi0seGE7cBW0TD9cK',
    '01 05 99 Personal Archive': '1AZEo-9bBKTtXlTV1UUe_7BV6WwbCe4MR',
    '02 00 00 Unknown': '1q0eZx3v0cdaPqvZJa8oD973RlbpD4WVt',
    '03 02 04': '10bAzhW4Cm5E9W1GBL-u_lZMHOweFgYiT',
    '01 00 00 Unknown': '1BggoUAc0xVgKh4dNOvODYk_C955RDQFI'
}

# Mappings of stray folder IDs (as a set)
STRAY_ROOT_IDS = set(STRAY_ROOT_MAP.values())

def get_drive_service():
    creds = Credentials.from_authorized_user_file('token.json')
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build('drive', 'v3', credentials=creds)

def clean_name(n):
    return re.sub(r'\s+', ' ', n.strip().lower())

def extract_code(name):
    # Match pattern like 01 04 00 or 01 XX 99
    match = re.search(r'\b(\d{2})[\s\-]+([a-zA-Z0-9]{2})[\s\-]+(\d{2})\b', name)
    if match:
        return match.group(0).lower()
    return None

def segments_match(seg, folder_name):
    s_clean = clean_name(seg)
    f_clean = clean_name(folder_name)
    if s_clean == f_clean:
        return True
    
    # Check if they share the same taxonomy code
    s_code = extract_code(s_clean)
    f_code = extract_code(f_clean)
    if s_code and f_code:
        # Match XX wildcards
        s_parts = s_code.split()
        f_parts = f_code.split()
        if len(s_parts) == 3 and len(f_parts) == 3:
            match = True
            for a, b in zip(s_parts, f_parts):
                if a != 'xx' and b != 'xx' and a != b:
                    match = False
                    break
            if match:
                return True

    # Otherwise, check substring matching with word boundaries and minimum length
    # Check if seg is a word or phrase in folder_name
    # Avoid matching single-letter/very short folder names like 'R'
    if len(f_clean) >= 3:
        if re.search(r'\b' + re.escape(f_clean) + r'\b', s_clean):
            return True
    if len(s_clean) >= 3:
        if re.search(r'\b' + re.escape(s_clean) + r'\b', f_clean):
            return True
            
    return False

class DriveIndex:
    def __init__(self, service):
        self.service = service
        self.folders = {}  # id -> {name, parents, children_ids}
        self.files_by_parent = {} # parent_id -> list of files
        self.load_folders()

    def load_folders(self):
        print("Indexing all folders in Google Drive...")
        page_token = None
        while True:
            res = self.service.files().list(
                q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                pageSize=1000,
                pageToken=page_token,
                fields="nextPageToken, files(id, name, parents)"
            ).execute()
            
            for f in res.get('files', []):
                self.folders[f['id']] = {
                    'name': f['name'],
                    'parents': f.get('parents', []),
                    'children_ids': []
                }
            
            page_token = res.get('nextPageToken')
            if not page_token:
                break
        
        # Populate children
        for fid, info in self.folders.items():
            for p in info['parents']:
                if p in self.folders:
                    self.folders[p]['children_ids'].append(fid)
                    
        print(f"Indexed {len(self.folders)} folders.")

    def is_descendant_of_any(self, folder_id, target_set):
        if folder_id in target_set:
            return True
        visited = set()
        queue = [folder_id]
        while queue:
            curr = queue.pop(0)
            if curr in visited:
                continue
            visited.add(curr)
            if curr in target_set:
                return True
            parents = self.folders.get(curr, {}).get('parents', [])
            queue.extend(parents)
        return False

    def get_real_folders(self):
        # A folder is real if it is NOT a descendant of any stray root
        real = {}
        for fid, info in self.folders.items():
            if not self.is_descendant_of_any(fid, STRAY_ROOT_IDS):
                real[fid] = info
        return real

    def get_stray_files(self):
        # Find all files inside the stray folder trees (excluding folder mimeType)
        stray_files = []
        for stray_root_id in STRAY_ROOT_IDS:
            print(f"Scanning stray root folder: {self.folders.get(stray_root_id, {}).get('name')} ({stray_root_id})...")
            
            # Find all files recursively
            stray_folder_ids = []
            for fid in self.folders:
                if self.is_descendant_of_any(fid, {stray_root_id}):
                    stray_folder_ids.append(fid)
            
            # Batch query for files in these folders
            # Drive API query parent in list is not directly supported, so query per folder
            for fid in stray_folder_ids:
                page_token = None
                while True:
                    query = f"'{fid}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
                    res = self.service.files().list(
                        q=query,
                        pageToken=page_token,
                        fields="nextPageToken, files(id, name, mimeType, description, parents)"
                    ).execute()
                    
                    stray_files.extend(res.get('files', []))
                    page_token = res.get('nextPageToken')
                    if not page_token:
                        break
        return stray_files

def parse_taxonomy_path(description):
    if not description:
        return None
    # Parse "Taxonomy: <path>"
    match = re.search(r'Taxonomy:\s*(.+)', description)
    if match:
        path_str = match.group(1).strip()
        # Split by '>' or space or arrow
        segments = [s.strip() for s in re.split(r'[>\u2192]', path_str)]
        # Remove empty segments
        segments = [s for s in segments if s]
        return segments
    return None

def find_global_folder(index, real_folders, seg, parent_id):
    parent_name = real_folders.get(parent_id, {}).get('name', '')
    parent_code = extract_code(parent_name) or extract_code(seg)
    
    # Determine correct root categories (01, 02, 03, 99)
    target_roots = []
    if parent_code:
        prefix = parent_code[:2]
        if prefix == '01':
            target_roots = [REAL_ROOT_MAP['01 00 00 Private'], REAL_ROOT_MAP['99 00 00 Archive']]
        elif prefix == '02':
            target_roots = [REAL_ROOT_MAP['02 00 00 Work'], REAL_ROOT_MAP['99 00 00 Archive']]
        elif prefix == '03':
            target_roots = [REAL_ROOT_MAP['03 00 00 Studies'], REAL_ROOT_MAP['99 00 00 Archive']]
    else:
        target_roots = list(REAL_ROOT_MAP.values())
        
    for fid, info in real_folders.items():
        if segments_match(seg, info['name']):
            # Check if it is a descendant of target roots
            for r in target_roots:
                if index.is_descendant_of_any(fid, {r}):
                    # Also verify that the folder name isn't too generic to avoid false matches
                    if len(clean_name(info['name'])) > 3:
                        return fid
    return None

def resolve_target_folder(index, real_folders, segments, dry_run=True):
    if not segments:
        return None
    
    # Try to find target folder starting from the roots
    current_candidates = list(REAL_ROOT_MAP.values())
    
    # Step 1: Find folders matching the first segment globally among real_folders
    first_seg = segments[0]
    matched_folders = []
    for fid, info in real_folders.items():
        if segments_match(first_seg, info['name']):
            matched_folders.append(fid)
            
    if matched_folders:
        # If there are matching folders, we prefer ones that are under correct root
        first_code = extract_code(first_seg)
        if first_code:
            prefix = first_code[:2]
            preferred_root = None
            if prefix == '01':
                preferred_root = REAL_ROOT_MAP['01 00 00 Private']
            elif prefix == '02':
                preferred_root = REAL_ROOT_MAP['02 00 00 Work']
            elif prefix == '03':
                preferred_root = REAL_ROOT_MAP['03 00 00 Studies']
            
            if preferred_root:
                filtered = [f for f in matched_folders if index.is_descendant_of_any(f, {preferred_root})]
                if filtered:
                    matched_folders = filtered
        
        current_candidates = matched_folders
    else:
        # Fallback: look for a child of roots matching first_seg
        children_matches = []
        for root_id in REAL_ROOT_MAP.values():
            children_ids = real_folders.get(root_id, {}).get('children_ids', [])
            for cid in children_ids:
                if segments_match(first_seg, real_folders[cid]['name']):
                    children_matches.append(cid)
        if children_matches:
            current_candidates = children_matches
        else:
            # Fallback to correct root based on code
            first_code = extract_code(first_seg)
            if first_code:
                prefix = first_code[:2]
                if prefix == '01':
                    current_candidates = [REAL_ROOT_MAP['01 00 00 Private']]
                elif prefix == '02':
                    current_candidates = [REAL_ROOT_MAP['02 00 00 Work']]
                elif prefix == '03':
                    current_candidates = [REAL_ROOT_MAP['03 00 00 Studies']]

    # Step 2: Iterate through remaining segments
    for seg in segments[1:]:
        next_candidates = []
        
        # Check if current folder name already matches/contains seg (e.g. segment "Archive" in "01 05 99 Archive")
        for cand in current_candidates:
            cand_name = real_folders.get(cand, {}).get('name', '')
            if segments_match(seg, cand_name):
                next_candidates.append(cand)
                
        if next_candidates:
            current_candidates = next_candidates
            continue
            
        # Search among children
        for cand in current_candidates:
            children_ids = real_folders.get(cand, {}).get('children_ids', [])
            for cid in children_ids:
                if segments_match(seg, real_folders[cid]['name']):
                    next_candidates.append(cid)
                    
        # Fallback: if no child matches, check if we can find a matching folder globally (only for top-level/specific folders)
        if not next_candidates:
            for cand in current_candidates:
                cand_name = real_folders.get(cand, {}).get('name', '')
                is_top_level = (cand in REAL_ROOT_MAP.values()) or (extract_code(cand_name) is not None)
                if is_top_level:
                    global_fid = find_global_folder(index, real_folders, seg, cand)
                    if global_fid:
                        next_candidates.append(global_fid)
                        
        if next_candidates:
            current_candidates = next_candidates
        else:
            # If no child matches, we must create a folder.
            # We pick the first current candidate as parent.
            parent_id = current_candidates[0]
            parent_name = real_folders.get(parent_id, {}).get('name', 'Unknown')
            
            print(f"Directory '{seg}' not found under parent '{parent_name}' ({parent_id}).")
            if dry_run:
                # Mock the folder creation by generating a virtual ID and adding to real_folders
                virtual_id = f"virtual_{parent_id}_{clean_name(seg)}"
                print(f"[DRY-RUN] Would create folder '{seg}' under '{parent_name}' (simulated ID: {virtual_id})")
                real_folders[virtual_id] = {
                    'name': seg,
                    'parents': [parent_id],
                    'children_ids': []
                }
                if parent_id in real_folders:
                    real_folders[parent_id]['children_ids'].append(virtual_id)
                current_candidates = [virtual_id]
            else:
                # Perform actual folder creation
                print(f"Creating folder '{seg}' under parent '{parent_name}'...")
                file_metadata = {
                    'name': seg,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [parent_id]
                }
                new_folder = index.service.files().create(body=file_metadata, fields='id').execute()
                new_id = new_folder.get('id')
                
                # Update our real_folders mapping in memory
                real_folders[new_id] = {
                    'name': seg,
                    'parents': [parent_id],
                    'children_ids': []
                }
                if parent_id in real_folders:
                    real_folders[parent_id]['children_ids'].append(new_id)
                current_candidates = [new_id]

    return current_candidates[0]

def repair_structure(dry_run=True):
    service = get_drive_service()
    index = DriveIndex(service)
    
    real_folders = index.get_real_folders()
    stray_files = index.get_stray_files()
    
    print(f"\nFound {len(stray_files)} files in the stray root folder trees.")
    
    migrations = []
    
    for f in stray_files:
        desc = f.get('description', '')
        segments = parse_taxonomy_path(desc)
        if not segments:
            # Reconstruct segments from filename prefix if no taxonomy matches
            code = extract_code(f['name'])
            if code:
                segments = [code]
            else:
                segments = ['01 05 99', 'Archive', 'Unknown']
                
        # Resolve target folder ID
        target_folder_id = resolve_target_folder(index, real_folders, segments, dry_run=dry_run)
        
        if target_folder_id:
            # We want to remove the current parent and add target_folder_id
            current_parents = f.get('parents', [])
            # Filter parents to find which one is the stray parent
            stray_parents = [p for p in current_parents if index.is_descendant_of_any(p, STRAY_ROOT_IDS)]
            
            migrations.append({
                'file_id': f['id'],
                'file_name': f['name'],
                'remove_parents': stray_parents,
                'add_parent': target_folder_id,
                'target_path_str': " > ".join(segments)
            })

    print(f"\n--- MIGRATION PLAN ({'DRY RUN' if dry_run else 'EXECUTION'}) ---")
    for m in migrations:
        target_folder_name = real_folders.get(m['add_parent'], {}).get('name', 'Unknown')
        print(f"Move '{m['file_name']}'")
        print(f"  From stray parent(s): {m['remove_parents']}")
        print(f"  To real folder:       '{target_folder_name}' ({m['add_parent']})")
        print(f"  Resolved Taxonomy:    {m['target_path_str']}")
        print("-" * 40)
        
    if dry_run:
        print(f"\n[DRY RUN] {len(migrations)} files would be moved. No changes were made.")
        return
        
    print(f"\nExecuting {len(migrations)} file moves...")
    for idx, m in enumerate(migrations):
        file_id = m['file_id']
        add_parent = m['add_parent']
        
        # In case add_parent is a simulated virtual ID, it shouldn't happen here as dry_run=False creates them.
        if add_parent.startswith('virtual_'):
            print(f"Error: Target parent is virtual: {add_parent}. Skipping file {m['file_name']}.")
            continue
            
        remove_parents = ",".join(m['remove_parents'])
        
        try:
            service.files().update(
                fileId=file_id,
                addParents=add_parent,
                removeParents=remove_parents,
                fields='id, parents'
            ).execute()
            print(f"[{idx+1}/{len(migrations)}] Successfully moved '{m['file_name']}'")
        except Exception as e:
            print(f"[{idx+1}/{len(migrations)}] Failed to move '{m['file_name']}': {e}")
            
    # Step 5: Delete empty stray folders recursively
    print("\nStarting recursive cleanup of empty stray folders...")
    # Get all stray folders (descendants of STRAY_ROOT_IDS)
    stray_folder_ids = []
    for fid in index.folders:
        if index.is_descendant_of_any(fid, STRAY_ROOT_IDS):
            stray_folder_ids.append(fid)
            
    # Sort folders by depth in the tree (deepest first) so we delete children before parents
    def get_depth(fid):
        depth = 0
        curr = fid
        visited = set()
        while curr in index.folders and curr not in STRAY_ROOT_IDS:
            if curr in visited:
                break
            visited.add(curr)
            parents = index.folders[curr]['parents']
            if not parents:
                break
            curr = parents[0]
            depth += 1
        return depth
        
    stray_folder_ids.sort(key=get_depth, reverse=True)
    
    for fid in stray_folder_ids:
        # Check if the folder is empty (no files and no child folders)
        # Note: since we delete deepest first, child folders should already be deleted
        try:
            # List children
            res = service.files().list(q=f"'{fid}' in parents and trashed = false", fields='files(id, name)').execute()
            children = res.get('files', [])
            if not children:
                # Folder is empty, we can delete it
                folder_name = index.folders.get(fid, {}).get('name', 'Unknown')
                print(f"Deleting empty stray folder: '{folder_name}' ({fid})...")
                service.files().delete(fileId=fid).execute()
            else:
                folder_name = index.folders.get(fid, {}).get('name', 'Unknown')
                print(f"Skipping folder '{folder_name}' ({fid}) because it still contains: {[c['name'] for c in children]}")
        except Exception as e:
            print(f"Failed to check/delete folder {fid}: {e}")
            
    print("\nCleanup and repair complete!")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Repair Google Drive folder structure and clean up stray root folders.")
    parser.add_argument('--execute', action='store_true', help="Execute the migrations (default is dry-run mode).")
    args = parser.parse_args()
    
    repair_structure(dry_run=not args.execute)
