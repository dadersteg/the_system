import os
import re
import datetime
import json
import time
from lib.config import (
    PRIVATE_TOKEN_PATH,
    WORK_TOKEN_PATH,
    AUTH_DIR
)
from lib.google_auth import get_service

SCOPES = ['https://www.googleapis.com/auth/tasks']

# Work LOS context code to trigger local routing from Private -> Work Google Tasks
WORK_LOS_CODE = '02 01 01'
# Private LOS context code to trigger local routing from Work -> Private Google Tasks
PRIVATE_LOS_CODE = '01 01 00'

# The work Google Tasks list to route tasks into.
# '@default' targets whatever list is set as default on the account.
WORK_TASKS_DEST = '@default'
PRIVATE_TASKS_DEST = '@default'

# Redaction rules (Regex patterns to scrub from combined Markdown tasks)
REDACTION_PATTERNS = [
    # Emails
    (r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[EMAIL]'),
    # Financial values — uses actual Unicode symbols (£, €, ¥) not HTML entities
    (r'[\$\u00a3\u20ac\u00a5]\d+(?:[.,]\d+)?\s*(?:k|million|m)?\b', '[AMOUNT]'),
    # URLs (scrub all URLs to be safe)
    (r'https?://[^\s]+', '[URL]'),
    # Specific sensitive project/client names can be added here
]


def fetch_all_pages(request_method, **kwargs):
    """Fetches all pages from a paginated Google API list method, with retry and backoff."""
    items = []
    page_token = None
    max_retries = 3
    while True:
        if page_token:
            kwargs['pageToken'] = page_token
        elif 'pageToken' in kwargs:
            del kwargs['pageToken']
            
        retries = 0
        response = None
        while retries <= max_retries:
            try:
                response = request_method(**kwargs).execute()
                break
            except Exception as e:
                retries += 1
                if retries > max_retries:
                    print(f"Error fetching page after {max_retries} retries: {e}")
                    raise e
                print(f"Error fetching page (retry {retries}/{max_retries}): {e}")
                time.sleep(2 ** retries)
                
        items.extend(response.get('items', []))
        page_token = response.get('nextPageToken')
        if not page_token:
            break
    return items

def strip_system_metadata(text):
    """Strips the internal ---SYSTEM_METADATA--- block that The System's Task Engine
    appends to task notes. Without this, the block appears as garbled inline text
    in the combined markdown output."""
    if not text:
        return ""
    marker = '---SYSTEM_METADATA---'
    idx = text.find(marker)
    if idx != -1:
        return text[:idx].strip()
    return text

def get_los_code_from_metadata(notes):
    """Extracts the category_path from the V6 JSON metadata block."""
    if not notes:
        return ""
    marker = '---SYSTEM_METADATA---'
    idx = notes.find(marker)
    if idx != -1:
        json_str = notes[idx + len(marker):].strip()
        try:
            metadata = json.loads(json_str)
            return metadata.get('category_path', '')
        except ValueError:
            pass
    return ""

def get_or_create_quarantine_list(service):
    """Retrieves or creates a task list named 'Triage Quarantine' in the given service."""
    try:
        task_lists = fetch_all_pages(service.tasklists().list, maxResults=100)
        for lst in task_lists:
            if lst.get('title') == 'Triage Quarantine':
                return lst['id']
    except Exception as e:
        print(f"[Quarantine] Error searching for Triage Quarantine list: {e}")
    
    try:
        new_list = service.tasklists().insert(body={'title': 'Triage Quarantine'}).execute()
        print(f"[Quarantine] Created 'Triage Quarantine' list with ID: {new_list['id']}")
        return new_list['id']
    except Exception as e:
        print(f"[Quarantine] Failed to create 'Triage Quarantine' list: {e}")
        raise e

def redact_text(text):
    """Anonymizes sensitive details from titles and notes."""
    if not text:
        return ""
    cleaned = strip_system_metadata(text)
    for pattern, replacement in REDACTION_PATTERNS:
        cleaned = re.sub(pattern, replacement, cleaned)
    return cleaned

def is_pmt_task(category_path, title, notes):
    notes_upper = notes.upper() if notes else ""
    if "DA: THIS IS NOT A PMT TASK" in notes_upper or "DA: PERSONAL" in notes_upper:
        return False
    if "DA: THIS IS A PMT TASK" in notes_upper:
        return True

    cat = category_path.strip() if category_path else ""
    title = title if title else ""
    
    if not cat and not title:
        return False
        
    cat_upper = cat.upper()
    title_upper = title.upper()
    
    # Explicit Private/Work LOS pointers to Playmetech
    if "PLAYMETECH" in cat_upper or "Q21" in cat_upper:
        return True
    if "PLAYMETECH" in title_upper or "Q21" in title_upper:
        return True
        
    # Standard PMT categories in unified taxonomy:
    # e.g. 02 Work/02 01 00 Playmetech or any subfolder starting with 02 Work/02 01
    if cat.startswith("02 Work/02 01") or "02 01 00" in cat:
        return True
        
    # PMTOS 2-digit native categories (e.g. "02 Team & Operations", "01 Playmetech Admin")
    # Requires a 2-digit prefix followed by a space and a letter.
    if re.match(r'^0[1-5]\s+[A-Za-z]', cat):
        # Prevent collision with Private LOS root categories that share this pattern format
        if not re.match(r'^0[1-5]\s+(Private|Work|Relationships|Health|Other)\b', cat, re.IGNORECASE):
            return True
        
    # Legacy context code check (e.g. Context: 02 01 01)
    match = re.search(r'Context:\s*(\d{2}\s\d{2}\s\d{2})', notes)
    if match:
        code = match.group(1).strip()
        if code.startswith("02 01 01") or code.startswith("02 01"):
            return True

    return False

def is_private_task(category_path, title, notes):
    notes_upper = notes.upper() if notes else ""
    if "DA: THIS IS NOT A PMT TASK" in notes_upper or "DA: PERSONAL" in notes_upper:
        return True
    if "DA: THIS IS A PMT TASK" in notes_upper:
        return False

    cat = category_path.strip() if category_path else ""
    if not cat or cat.upper() in ["INBOX", "TBD", "NONE", "N/A", "UNCLASSIFIED"]:
        return False # Do not route unclassified tasks to Private

    if is_pmt_task(category_path, title, notes):
        return False
        
    return True

def check_and_route_tasks(private_service, work_service):
    """
    Checks the private Google Tasks lists for tasks matching work LOS,
    and work Google Tasks lists for tasks matching private LOS, routing them appropriately.
    """
    print("\n[Gateway] Checking for tasks to route (Bi-directional)...")
    routed_count = 0

    # --- 1. Private to Work ---
    try:
        private_lists = fetch_all_pages(private_service.tasklists().list, maxResults=100)
        for lst in private_lists:
            list_id = lst['id']
            list_title = lst['title']
            if "deleted" in list_title.lower() or "recurring" in list_title.lower() or "quarantine" in list_title.lower(): continue
            
            tasks = fetch_all_pages(private_service.tasks().list, tasklist=list_id, showCompleted=False)
            for task in tasks:
                title = task.get('title', '')
                notes = task.get('notes', '')
                category_path = get_los_code_from_metadata(notes)
                
                is_work = False
                needs_recovery = False
                if "[ROUTED_TO_PRIVATE]" in notes:
                    is_work = False # Prevent bouncing back to Work
                elif "[ROUTED_TO_WORK]" in notes:
                    needs_recovery = True
                else:
                    if is_pmt_task(category_path, title, notes):
                        is_work = True
                        
                if is_work or needs_recovery:
                    print(f"[Gateway] Found Work task in private list '{list_title}': '{title}'")
                    try:
                        if is_work:
                            # 1. Patch original task
                            if "---SYSTEM_METADATA---" in notes:
                                notes = notes.replace("---SYSTEM_METADATA---", "[ROUTED_TO_WORK]\n---SYSTEM_METADATA---")
                            else:
                                notes += "\n[ROUTED_TO_WORK]"
                            private_service.tasks().patch(tasklist=list_id, task=task['id'], body={'id': task['id'], 'notes': notes}).execute()
                            
                            # 2. Insert to dest
                            constraint = "Must classify as Work/PMTOS. Do not use 01 or 02 01 99."
                            dest_notes = notes
                            if "DA:" in dest_notes:
                                dest_notes = re.sub(r'DA:(.*)$', lambda m: f"DA: {m.group(1).strip()} | {constraint}" if m.group(1).strip() else f"DA: {constraint}", dest_notes, flags=re.MULTILINE)
                            else:
                                dest_notes = dest_notes.replace("---SYSTEM_METADATA---", f"DA: {constraint}\n---SYSTEM_METADATA---")
    
                            work_task_body = {'title': title, 'notes': dest_notes, 'due': task.get('due')}
                            inserted = work_service.tasks().insert(tasklist=WORK_TASKS_DEST, body=work_task_body).execute()
                            print(f"[Gateway] Pushed task to Work default list. (ID: {inserted['id']})")
                        else:
                            print(f"[Gateway] Recovering partially routed task '{title}'. Skipping insert to prevent duplicates.")
                        
                        # 3. Move to Quarantine
                        quarantine_list_id = get_or_create_quarantine_list(private_service)
                        quarantine_body = {
                            'title': task.get('title'),
                            'notes': task.get('notes'),
                            'due': task.get('due'),
                            'status': task.get('status')
                        }
                        private_service.tasks().insert(tasklist=quarantine_list_id, body=quarantine_body).execute()
                        print(f"[Gateway] Quarantined original task in Private account.")

                        # 4. Delete from source
                        private_service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                        print(f"[Gateway] Removed task from Private list.")
                        routed_count += 1
                    except Exception as ex:
                        print(f"[Gateway] Error routing task '{title}': {ex}")
    except Exception as e:
        print(f"Failed to fetch private task lists: {e}")

    # --- 2. Work to Private ---
    try:
        work_lists = fetch_all_pages(work_service.tasklists().list, maxResults=100)
        for lst in work_lists:
            list_id = lst['id']
            list_title = lst['title']
            if "deleted" in list_title.lower() or "recurring" in list_title.lower() or "quarantine" in list_title.lower(): continue
            
            tasks = fetch_all_pages(work_service.tasks().list, tasklist=list_id, showCompleted=False)
            for task in tasks:
                title = task.get('title', '')
                notes = task.get('notes', '')
                category_path = get_los_code_from_metadata(notes)
                
                is_private = False
                needs_recovery = False
                if "[ROUTED_TO_WORK]" in notes:
                    is_private = False # Prevent bouncing back to Private
                elif "[ROUTED_TO_PRIVATE]" in notes:
                    needs_recovery = True
                else:
                    if is_private_task(category_path, title, notes):
                        is_private = True
                        
                if is_private or needs_recovery:
                    print(f"[Gateway] Found Personal task in work list '{list_title}': '{title}'")
                    try:
                        if is_private:
                            # 1. Patch original task
                            if "---SYSTEM_METADATA---" in notes:
                                notes = notes.replace("---SYSTEM_METADATA---", "[ROUTED_TO_PRIVATE]\n---SYSTEM_METADATA---")
                            else:
                                notes += "\n[ROUTED_TO_PRIVATE]"
                            work_service.tasks().patch(tasklist=list_id, task=task['id'], body={'id': task['id'], 'notes': notes}).execute()
                            
                            # 2. Insert to dest
                            constraint = "Must classify as Personal/LOS. Do not use 02."
                            dest_notes = notes
                            if "DA:" in dest_notes:
                                dest_notes = re.sub(r'DA:(.*)$', lambda m: f"DA: {m.group(1).strip()} | {constraint}" if m.group(1).strip() else f"DA: {constraint}", dest_notes, flags=re.MULTILINE)
                            else:
                                dest_notes = dest_notes.replace("---SYSTEM_METADATA---", f"DA: {constraint}\n---SYSTEM_METADATA---")
    
                            private_task_body = {'title': title, 'notes': dest_notes, 'due': task.get('due')}
                            inserted = private_service.tasks().insert(tasklist=PRIVATE_TASKS_DEST, body=private_task_body).execute()
                            print(f"[Gateway] Pushed task to Private default list. (ID: {inserted['id']})")
                        else:
                            print(f"[Gateway] Recovering partially routed task '{title}'. Skipping insert to prevent duplicates.")
                        
                        # 3. Move to Quarantine
                        quarantine_list_id = get_or_create_quarantine_list(work_service)
                        quarantine_body = {
                            'title': task.get('title'),
                            'notes': task.get('notes'),
                            'due': task.get('due'),
                            'status': task.get('status')
                        }
                        work_service.tasks().insert(tasklist=quarantine_list_id, body=quarantine_body).execute()
                        print(f"[Gateway] Quarantined original task in Work account.")

                        # 4. Delete from source
                        work_service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                        print(f"[Gateway] Removed task from Work list.")
                        routed_count += 1
                    except Exception as ex:
                        print(f"[Gateway] Error routing task '{title}': {ex}")
    except Exception as e:
        print(f"Failed to fetch work task lists: {e}")
                    
    print(f"[Gateway] Routing sweep complete. Routed {routed_count} task(s).")

def fetch_tasks_from_service(service, label):
    """Fetches all active tasks from all tasklists of a service."""
    all_tasks = {}
    try:
        task_lists = fetch_all_pages(service.tasklists().list, maxResults=100)
        for lst in task_lists:
            list_id = lst['id']
            list_title = lst['title']
            
            # Skip junk lists
            if "deleted" in list_title.lower() or "quarantine" in list_title.lower():
                continue
                
            tasks = fetch_all_pages(service.tasks().list, tasklist=list_id, showCompleted=False)
            if tasks:
                all_tasks[list_title] = tasks
    except Exception as e:
        print(f"Failed to fetch tasks for {label}: {e}")
    return all_tasks

def write_combined_markdown(private_tasks, work_tasks, output_path, same_account=False):
    """Writes the combined tasks list into a beautiful Markdown file."""
    now_str = datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S")
    
    with open(output_path, 'w') as f:
        f.write(f"# Google Tasks (Combined View)\n\n")
        f.write(f"*Last Aggregated: {now_str}*\n")
        f.write(f"> [!NOTE]\n")
        f.write(f"> This is a local, one-directional aggregated view. Updates to this file will not sync back to the cloud.\n")
        f.write(f"> Work task descriptions and notes have been anonymized/redacted for local storage security.\n\n")
        
        # --- WORK SECTOR ---
        f.write(f"## 💼 Work Tasks (Playmetech / Playmetech)\n\n")
        if same_account:
            f.write("> [!WARNING]\n")
            f.write("> Work OAuth token is currently authenticated to the same Google Account as Private Tasks.\n")
            f.write("> Work tasks are hidden here to prevent duplicate listing. Please re-authenticate your Work account token.\n\n")
        elif not work_tasks:
            f.write("*No active work tasks found.*\n\n")
        else:
            for list_title, tasks in work_tasks.items():
                f.write(f"### {list_title}\n\n")
                for task in tasks:
                    title = redact_text(task.get('title', 'Untitled Task'))
                    notes = redact_text(task.get('notes', ''))
                    due = task.get('due')
                    
                    line = f"- [ ] **{title}**"
                    if due:
                        # Tasks due dates are usually YYYY-MM-DDT00:00:00.000Z
                        due_date = due.split('T')[0]
                        line += f" *(Due: {due_date})*"
                    f.write(line + "\n")
                    
                    if notes:
                        # Clean notes layout for markdown block
                        clean_notes = notes.replace('\n', ' ').strip()
                        f.write(f"  - **Notes:** {clean_notes}\n")
                f.write("\n")

        # --- PERSONAL SECTOR ---
        f.write(f"## 🏠 Personal Tasks\n\n")
        if not private_tasks:
            f.write("*No active personal tasks found.*\n\n")
        else:
            for list_title, tasks in private_tasks.items():
                f.write(f"### {list_title}\n\n")
                for task in tasks:
                    title = task.get('title', 'Untitled Task')
                    # Strip SYSTEM_METADATA blocks before rendering personal notes
                    notes = strip_system_metadata(task.get('notes', ''))
                    due = task.get('due')
                    
                    line = f"- [ ] **{title}**"
                    if due:
                        due_date = due.split('T')[0]
                        line += f" *(Due: {due_date})*"
                    f.write(line + "\n")
                    
                    if notes:
                        clean_notes = notes.replace('\n', ' ').strip()
                        f.write(f"  - **Notes:** {clean_notes}\n")
                f.write("\n")

    print(f"Combined Markdown generated successfully at: {output_path}")

def write_individual_markdown(tasks_dict, output_path, title_header, same_account=False):
    """Writes an individual tasks list into a beautiful Markdown file."""
    now_str = datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S")
    
    with open(output_path, 'w') as f:
        f.write(f"# {title_header}\n\n")
        f.write(f"*Last Aggregated: {now_str}*\n")
        
        if same_account:
            f.write("> [!WARNING]\n")
            f.write("> Work OAuth token is currently authenticated to the same Google Account as Private Tasks.\n")
            f.write("> Work tasks are hidden here to prevent duplicate listing. Please re-authenticate your Work account token.\n\n")
        elif not tasks_dict:
            f.write("*No active tasks found.*\n\n")
        else:
            for list_title, tasks in tasks_dict.items():
                f.write(f"## {list_title}\n\n")
                for task in tasks:
                    title = task.get('title', 'Untitled Task')
                    notes = strip_system_metadata(task.get('notes', ''))
                    due = task.get('due')
                    
                    line = f"- [ ] **{title}**"
                    if due:
                        due_date = due.split('T')[0]
                        line += f" *(Due: {due_date})*"
                    f.write(line + "\n")
                    
                    if notes:
                        clean_notes = notes.replace('\n', ' ').strip()
                        f.write(f"  - **Notes:** {clean_notes}\n")
                f.write("\n")
    
    print(f"Individual Markdown generated successfully at: {output_path}")

def main():
    print("====================================================")
    print("      Starting Tasks Aggregator & Routing Gateway   ")
    print("====================================================")

    # 1. Setup paths
    output_md = os.path.join(AUTH_DIR, 'Google Tasks (Combined).md')
    output_private_md = os.path.join(AUTH_DIR, 'Google Tasks (Private).md')
    output_work_md = os.path.join(AUTH_DIR, 'Google Tasks (Work).md')

    # 2. Get Private API Service
    print("\n[Auth] Fetching credentials for Private Account...")
    private_service = get_service('tasks', 'v1', PRIVATE_TOKEN_PATH, None, "Private Account")
    if private_service:
        print("Private Google Tasks API Connected.")
    else:
        print("Warning: Private Tasks API could not be connected. Skipping private sync.")

    # 3. Get Work API Service
    print("\n[Auth] Fetching credentials for Work Account (Playmetech / Playmetech)...")
    work_service = get_service('tasks', 'v1', WORK_TOKEN_PATH, None, "Work Account")
    if work_service:
        print("Work Google Tasks API Connected.")
    else:
        print("Warning: Work Tasks API could not be connected. Skipping work sync.")

    # Check for same account token collision
    same_account = False
    if private_service and work_service:
        try:
            lists_p = private_service.tasklists().list(maxResults=1).execute().get('items', [])
            lists_w = work_service.tasklists().list(maxResults=1).execute().get('items', [])
            if lists_p and lists_w and lists_p[0]['id'] == lists_w[0]['id']:
                same_account = True
                print("⚠️  WARNING: Both Private and Work OAuth tokens point to the same Google Account!")
        except Exception as e:
            print(f"Error checking accounts match: {e}")

    # 4. Run Routing Gateway (Requires both services, only if they are different accounts)
    if private_service and work_service:
        if not same_account:
            check_and_route_tasks(private_service, work_service)
        else:
            print("[Gateway] Bypassing bi-directional routing to prevent infinite loops (Account collision).")

    # 5. Fetch Tasks
    private_tasks = {}
    work_tasks = {}
    
    if private_service:
        print("\n[Sync] Fetching private tasks...")
        private_tasks = fetch_tasks_from_service(private_service, "Private")
        
    if work_service and not same_account:
        print("\n[Sync] Fetching work tasks...")
        work_tasks = fetch_tasks_from_service(work_service, "Work")

    # 6. Generate combined markdown
    if private_service or work_service:
        print("\n[Output] Generating combined Markdown...")
        write_combined_markdown(private_tasks, work_tasks, output_md, same_account=same_account)
        
    if private_service:
        print("\n[Output] Generating private Markdown...")
        write_individual_markdown(private_tasks, output_private_md, "Google Tasks (Private)")
        
    if work_service:
        print("\n[Output] Generating work Markdown...")
        write_individual_markdown(work_tasks, output_work_md, "Google Tasks (Work)", same_account=same_account)
        
    print("\nExecution complete.")

if __name__ == '__main__':
    main()
