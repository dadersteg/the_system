import os
import sys
import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
from googleapiclient.discovery import build

def get_service(token_path):
    if not os.path.exists(token_path):
        return None
    creds = Credentials.from_authorized_user_file(token_path)
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        with open(token_path, 'w') as f:
            f.write(creds.to_json())
    return build('tasks', 'v1', credentials=creds)

def main():
    script_dir = os.path.dirname(os.path.realpath(__file__))
    auth_dir = os.path.realpath(os.path.join(script_dir, '../../auth'))
    work_token = os.path.join(auth_dir, 'token_tasks_work.json')
    service = get_service(work_token)
    if not service:
        print("Could not load Work account token.")
        return

    lists = service.tasklists().list(maxResults=50).execute().get('items', [])
    
    ai_review_id = None
    todo_id = None
    for lst in lists:
        t = lst['title'].lower()
        if "ai review" in t: ai_review_id = lst['id']
        if "todo" == t or "to do" == t: todo_id = lst['id']

    if not ai_review_id or not todo_id:
        print(f"List error: AI Review={ai_review_id}, ToDo={todo_id}")
        return

    tasks = []
    page_token = None
    while True:
        resp = service.tasks().list(tasklist=ai_review_id, showCompleted=False, maxResults=100, pageToken=page_token).execute()
        tasks.extend(resp.get('items', []))
        page_token = resp.get('nextPageToken')
        if not page_token: break

    moves = {
        "todo": [
            "Request GitHub Permission", "Provide VPN Access", "Request Slack Admin",
            "Migrate Skills", "Compile Tech Documentation", "Locate raw data",
            "Draft Claude framework", "Discuss Responsibility"
        ],
        "05_projects": [
            "Update H2 Plan", "Refine Strategy List", "Map Team Processes", "Define H2 Milestones",
            "Discuss Framework", "Investigate domain ownership", "Review Windows Server",
            "Update infrastructure document", "Research tech stack", "Distribute revised scorecards",
            "Create Anonymous Pulse Check", "Develop spreadsheet playbook"
        ],
        "02_ops": ["Trading Lead"],
        "delete": [
            "Send Strategy List", "Assign Performance Tasks", "Clarify intern expectations",
            "Coordinate deployment", "Rewrite Codebase", "Review Spreadsheets",
            "Standardize Spreadsheets", "Organize Spreadsheets", "Share Dashboard",
            "Update Slack Communication", "Share Compliance Docs", "Test test"
        ]
    }

    keep_one_tracker = {
        "develop spreadsheet playbook": False,
        "investigate domain ownership": False,
        "investigate pitech.net ownership": False,
        "investigate pametech.net ownership": False,
        "identify domain owner": False,
        "update infrastructure documentation": False,
        "update documentation": False,
        "research tech stack": False,
        "distribute revised scorecards": False,
        "share scorecards": False,
        "send scorecards": False,
        "present trader scorecards": False,
        "review scorecards": False,
        "share technical scorecards": False,
        "discuss scorecards": False
    }

    def title_contains(t, phrases):
        t_low = t.lower()
        for p in phrases:
            if p.lower() in t_low: return True
        return False

    for t in tasks:
        title = t.get('title', '')
        t_low = title.lower()
        tid = t['id']
        notes = t.get('notes', '')
        webview = t.get('webViewLink', '')

        action = None
        new_notes_append = ""

        is_cluster_task = False
        for cluster_phrase in keep_one_tracker.keys():
            if cluster_phrase in t_low:
                is_cluster_task = True
                if not keep_one_tracker[cluster_phrase]:
                    keep_one_tracker[cluster_phrase] = True
                    action = "MOVE"
                    if "domain owner" in cluster_phrase or "tech stack" in cluster_phrase or "infrastructure doc" in cluster_phrase:
                        new_notes_append = "\nContext: 05 Projects / Tech and DevOps"
                        if "pametech.net" in cluster_phrase or "pitech.net" in cluster_phrase:
                            title = "Investigate domain ownership (playmetech.net)"
                    elif "scorecard" in cluster_phrase:
                        new_notes_append = "\nContext: 05 Projects / Performance Framework"
                    elif "spreadsheet playbook" in cluster_phrase:
                        new_notes_append = "\nContext: 05 Projects / Automation & Efficiency"
                else:
                    action = "DELETE"
                break

        if is_cluster_task:
            pass
        elif title_contains(title, moves["delete"]):
            action = "DELETE"
        elif title_contains(title, moves["todo"]):
            action = "MOVE"
        elif title_contains(title, ["Update H2 Plan", "Refine Strategy List", "Map Team Processes", "Define H2 Milestones"]):
            action = "MOVE"
            new_notes_append = "\nContext: 05 Projects / Planning Framework"
        elif title_contains(title, ["Discuss Framework"]):
            action = "MOVE"
            new_notes_append = "\nContext: 05 Projects / Automation & Efficiency"
        elif title_contains(title, ["Review Windows Server"]):
            action = "MOVE"
            new_notes_append = "\nContext: 05 Projects / Tech and DevOps"
        elif title_contains(title, ["Create Anonymous Pulse Check"]):
            action = "MOVE"
            new_notes_append = "\nContext: 05 Projects / Talent Density"
        elif title_contains(title, moves["02_ops"]):
            action = "MOVE"
            new_notes_append = "\nContext: 02 Team & Operations"
        else:
            action = "SKIP"

        if action == "DELETE":
            print(f"Deleting: {title}")
            service.tasks().delete(tasklist=ai_review_id, task=tid).execute()
        elif action == "MOVE":
            print(f"Moving: {title} to ToDo with routing context")
            if webview and webview not in notes:
                notes += f"\n\nOriginal Source: {webview}"
            
            # Use GAS standard routing tag
            if "[ROUTED_TO_WORK]" not in notes:
                notes = "[ROUTED_TO_WORK]\n" + notes
                
            notes += new_notes_append

            new_task = {
                'title': title,
                'notes': notes.strip(),
                'status': t.get('status', 'needsAction'),
                'due': t.get('due')
            }
            service.tasks().insert(tasklist=todo_id, body=new_task).execute()
            service.tasks().delete(tasklist=ai_review_id, task=tid).execute()
        else:
            print(f"Skipping: {title}")

if __name__ == "__main__":
    main()
