import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import glob
import re

def main():
    # 1. The Active IDs we MUST NOT delete
    active_ids = set([
        "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY", # PMT Master
        "1bX5HtL1Yrtwt1xwEiB-H6qes4hetRaiw", # PMT Workspace
        "1V-w6QtL9e16nnWdi5m58U0iPxfuIVfmyMrHrfZk9iI8", # PMT Habits
        "1okMRrvTSoHg6Hudi0tHniP5Vjnt_PFTE",
        "1gFvlLGijJ2Z1wbK8L32SFakH66yGXVUo",
        "1txdOFb0fWHc5CrfTkyaG9L_9ucRa7wZ3",
        "18vdXyMd4AK5FAqS9fPRDIA1nOIjN12vN",
        "1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7",
        "18rIhK5SX4gS9rNQNvYkXkMFCCVqKcLO_YNJFqqcqEnA",
        "1TcHyODoMm5zziuu6COD86qQroOFyMz05KtddAEsb0bY",
        "1P0LgSK70Ztn772hrHtTOK7s8IM55llxnaVk_AeZuthA",
        "1OaW3uaTB7edPYQFXNFzMpvxqlUvCRMG2",
        "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY", # Private Master
        "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", # Private Workspace
        "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo", # Private Habits
        "1Ot9fJ5P-Z_O6BOIlWZ2L_oyCIw6Ixeet",
        "142r2YeV5v209crHS5J5HvWr1s4TOnexp",
        "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
        "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn",
        "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq",
        "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3",
        "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u",
        "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R",
        "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty",
        "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", # Shared Prompts
        "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb",
        "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf",
        "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2",
        "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
        "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC",
        "1nFJpikIiZX9ykPk0aePAQyx0mFO0DswD", # Wait, I will use exact from previous script to be safe
        "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD",
        "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N",
        "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U",
        "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk",
        "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ",
        "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm",
        "1fs00OCWVi0kGY404b0Ew_alfd3B4c4Wi"
    ])

    core_names = [
        "TS & TM (Private)",
        "TS & TM (Work)",
        "the_system",
        "Goals, habits and method logging (Private)",
        "Goals, habits and method logging",
        "Principles, Goals, Methods and Habits",
        "TS - Task Master > 1 Day Operations Prompt",
        "Task_Master_7_Day_Prompt",
        "Task_Master_28_Day_Prompt",
        "Task_Master_84_Day_Prompt",
        "TS - Vantage Prompt",
        "Personal Growth Reflection - Vantage > Custom Instructions",
        "TS - Categorisation (Private)",
        "LOS_Taxonomy",
        "TS - Clerk > System Instructions",
        "TS - The System Protocols",
        "TS - Clerk > Email Categorizer Prompt",
        "TS - Master Asset Naming Protocol",
        "TS - Agent Protocol > Time Frameworks",
        "TS - Task Master > 1 Day Execution Plan",
        "TS - Task Master > 7 Day Roadmap",
        "TS - Task Master > 28 Day Strategic",
        "TS - Task Master > 84 Day Strategic",
        "Google Tasks (Private)",
        "Google Tasks (Combined)"
    ]

    report = ["# REDUNDANT FILES REPORT\n"]

    # 2. Local Files Analysis
    report.append("## 1. LOCAL FILESYSTEM DUPLICATES")
    local_duplicates = []
    
    # We look for files matching the core names, especially those with (1), (2), copy, etc.
    all_local_files = []
    for root, dirs, files in os.walk('/Users/daniel/Documents/AGY/the_system'):
        if 'node_modules' in root or '.git' in root:
            continue
        for f in files:
            all_local_files.append(os.path.join(root, f))
            
    for fpath in all_local_files:
        fname = os.path.basename(fpath)
        # Check if it looks like a duplicate e.g. "Task_Master_7_Day_Prompt (1).md"
        if re.search(r'\(\d+\)', fname) or "Copy of" in fname:
            # See if it's a duplicate of a core file
            for core in core_names:
                if core in fname:
                    local_duplicates.append(fpath)
                    break
                    
    if not local_duplicates:
        report.append("No local duplicates found.\n")
    else:
        for d in local_duplicates:
            report.append(f"- [DELETE] Local File: {d}")
        report.append("\n")

    # 3. Google Drive Analysis
    report.append("## 2. GOOGLE DRIVE REDUNDANCIES (Private Account)")
    try:
        creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
        drive_service = build('drive', 'v3', credentials=creds)
        
        drive_redundancies = []
        
        for name in core_names:
            query = f"name contains '{name}' and trashed = false"
            try:
                results = drive_service.files().list(q=query, fields="files(id, name, mimeType)").execute()
                for item in results.get('files', []):
                    if item['id'] not in active_ids:
                        drive_redundancies.append(f"- [DELETE] Drive File: '{item['name']}' (ID: {item['id']})")
                    else:
                        pass # It's an active file
            except Exception as e:
                pass
                
        if not drive_redundancies:
            report.append("No Drive redundancies found.\n")
        else:
            for d in set(drive_redundancies):
                report.append(d)
            report.append("\n")
            
    except Exception as e:
        report.append(f"Error accessing Google Drive: {e}\n")

    with open('/Users/daniel/Documents/AGY/the_system/redundancy_report.txt', 'w') as f:
        f.write('\n'.join(report))

    print("Analysis complete. Saved to redundancy_report.txt")

if __name__ == '__main__':
    main()
