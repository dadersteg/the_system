import os
import re
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/tasks']

# Keywords to trigger local routing from Private -> Work Google Tasks
WORK_KEYWORDS = ['playmetech', 'quantum 21', 'quantum21']

# The work Google Tasks list to route tasks into.
# '@default' targets whatever list is set as default on the work account.
# Once the work instance of The System is fully set up, replace this with
# the specific work Importer list ID (e.g. 'MDI4NDE2...') so routed tasks
# land directly in the work inbox pipeline.
WORK_TASKS_DEST = '@default'

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

def get_credentials(token_path, creds_path, account_name):
    """Authenticate and return credentials for a given account."""
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print(f"Refreshing expired token for {account_name}...")
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Failed to refresh token: {e}. Re-authenticating...")
                creds = None
        
        if not creds:
            if not os.path.exists(creds_path):
                print(f"Error: Client secrets file '{creds_path}' not found for {account_name}.")
                print(f"Please place your OAuth client ID credentials in '{creds_path}'.")
                return None
            
            print(f"Please authenticate in the browser for {account_name}...")
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0, open_browser=True)
            
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
            print(f"Token saved to {token_path}")
            
    return creds

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

def redact_text(text):
    """Anonymizes sensitive details from titles and notes."""
    if not text:
        return ""
    cleaned = strip_system_metadata(text)
    for pattern, replacement in REDACTION_PATTERNS:
        cleaned = re.sub(pattern, replacement, cleaned)
    return cleaned

def check_and_route_tasks(private_service, work_service):
    """
    Checks the private Google Tasks lists for tasks matching work keywords
    and automatically routes them to the work account.
    """
    print("\n[Gateway] Checking for tasks to route from Private to Work...")
    try:
        task_lists = private_service.tasklists().list(maxResults=20).execute().get('items', [])
    except Exception as e:
        print(f"Failed to fetch private task lists: {e}")
        return

    routed_count = 0

    for lst in task_lists:
        list_id = lst['id']
        list_title = lst['title']
        
        # Don't sweep tasks from 'To be deleted' list if it's junk
        if "deleted" in list_title.lower():
            continue
            
        try:
            tasks = private_service.tasks().list(tasklist=list_id, showCompleted=False).execute().get('items', [])
        except Exception as e:
            print(f"Failed to fetch tasks for private list {list_title}: {e}")
            continue

        for task in tasks:
            title = task.get('title', '')
            notes = task.get('notes', '')
            
            # Combine title and notes to check for work keywords
            combined_text = (title + " " + notes).lower()
            
            if any(keyword in combined_text for keyword in WORK_KEYWORDS):
                print(f"[Gateway] Found work-related task in private list '{list_title}': '{title}'")
                try:
                    # 1. Insert into the configured work destination list
                    #    Strip SYSTEM_METADATA before sending to work account
                    routed_notes = strip_system_metadata(task.get('notes', ''))
                    work_task_body = {
                        'title': task.get('title'),
                        'notes': routed_notes or 'Routed from personal account.',
                        'due': task.get('due')
                    }
                    inserted = work_service.tasks().insert(tasklist=WORK_TASKS_DEST, body=work_task_body).execute()
                    print(f"[Gateway] Pushed task to Work default list. (ID: {inserted['id']})")
                    
                    # 2. Delete from private tasks list
                    private_service.tasks().delete(tasklist=list_id, task=task['id']).execute()
                    print(f"[Gateway] Removed task from Private list.")
                    routed_count += 1
                except Exception as ex:
                    print(f"[Gateway] Error routing task '{title}': {ex}")
                    
    print(f"[Gateway] Routing sweep complete. Routed {routed_count} task(s).")

def fetch_tasks_from_service(service, label):
    """Fetches all active tasks from all tasklists of a service."""
    all_tasks = {}
    try:
        task_lists = service.tasklists().list(maxResults=20).execute().get('items', [])
        for lst in task_lists:
            list_id = lst['id']
            list_title = lst['title']
            
            # Skip junk lists
            if "deleted" in list_title.lower():
                continue
                
            tasks = service.tasks().list(tasklist=list_id, showCompleted=False).execute().get('items', [])
            if tasks:
                all_tasks[list_title] = tasks
    except Exception as e:
        print(f"Failed to fetch tasks for {label}: {e}")
    return all_tasks

def write_combined_markdown(private_tasks, work_tasks, output_path):
    """Writes the combined tasks list into a beautiful Markdown file."""
    now_str = datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S")
    
    with open(output_path, 'w') as f:
        f.write(f"# Google Tasks (Combined View)\n\n")
        f.write(f"*Last Aggregated: {now_str}*\n")
        f.write(f"> [!NOTE]\n")
        f.write(f"> This is a local, one-directional aggregated view. Updates to this file will not sync back to the cloud.\n")
        f.write(f"> Work task descriptions and notes have been anonymized/redacted for local storage security.\n\n")
        
        # --- WORK SECTOR ---
        f.write(f"## 💼 Work Tasks (Quantum 21 / Playmetech)\n\n")
        if not work_tasks:
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

def main():
    print("====================================================")
    print("      Starting Tasks Aggregator & Routing Gateway   ")
    print("====================================================")

    # 1. Setup paths
    # Fallback to token.json / creds.json for backwards-compatibility
    private_token = 'token_tasks_private.json' if os.path.exists('token_tasks_private.json') else 'token_tasks.json'
    private_creds = 'creds_private.json' if os.path.exists('creds_private.json') else 'creds.json'
    
    work_token = 'token_tasks_work.json'
    work_creds = 'creds_work.json'
    
    output_md = 'Google Tasks (Combined).md'

    # 2. Get Private API Service
    print("\n[Auth] Fetching credentials for Private Account...")
    private_auth = get_credentials(private_token, private_creds, "Private Account")
    private_service = None
    if private_auth:
        private_service = build('tasks', 'v1', credentials=private_auth)
        print("Private Google Tasks API Connected.")
    else:
        print("Warning: Private Tasks API could not be connected. Skipping private sync.")

    # 3. Get Work API Service
    print("\n[Auth] Fetching credentials for Work Account (Quantum 21 / Playmetech)...")
    work_auth = get_credentials(work_token, work_creds, "Work Account")
    work_service = None
    if work_auth:
        work_service = build('tasks', 'v1', credentials=work_auth)
        print("Work Google Tasks API Connected.")
    else:
        print("Warning: Work Tasks API could not be connected. Skipping work sync.")

    # 4. Run Routing Gateway (Requires both services)
    if private_service and work_service:
        check_and_route_tasks(private_service, work_service)

    # 5. Fetch Tasks
    private_tasks = {}
    work_tasks = {}
    
    if private_service:
        print("\n[Sync] Fetching private tasks...")
        private_tasks = fetch_tasks_from_service(private_service, "Private")
        
    if work_service:
        print("\n[Sync] Fetching work tasks...")
        work_tasks = fetch_tasks_from_service(work_service, "Work")

    # 6. Generate combined markdown
    if private_service or work_service:
        print("\n[Output] Generating combined Markdown...")
        write_combined_markdown(private_tasks, work_tasks, output_md)
        
    print("\nExecution complete.")

if __name__ == '__main__':
    main()
