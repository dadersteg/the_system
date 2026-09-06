import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    active_ids = set([
        "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY", "1bX5HtL1Yrtwt1xwEiB-H6qes4hetRaiw", 
        "1V-w6QtL9e16nnWdi5m58U0iPxfuIVfmyMrHrfZk9iI8", "1okMRrvTSoHg6Hudi0tHniP5Vjnt_PFTE",
        "1gFvlLGijJ2Z1wbK8L32SFakH66yGXVUo", "1txdOFb0fWHc5CrfTkyaG9L_9ucRa7wZ3",
        "18vdXyMd4AK5FAqS9fPRDIA1nOIjN12vN", "1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7",
        "18rIhK5SX4gS9rNQNvYkXkMFCCVqKcLO_YNJFqqcqEnA", "1TcHyODoMm5zziuu6COD86qQroOFyMz05KtddAEsb0bY",
        "1P0LgSK70Ztn772hrHtTOK7s8IM55llxnaVk_AeZuthA", "1OaW3uaTB7edPYQFXNFzMpvxqlUvCRMG2",
        "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY", "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", 
        "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo", "1Ot9fJ5P-Z_O6BOIlWZ2L_oyCIw6Ixeet",
        "142r2YeV5v209crHS5J5HvWr1s4TOnexp", "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
        "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn", "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq",
        "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3", "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u",
        "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R", "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty",
        "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb",
        "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf", "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2",
        "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D", "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC",
        "1nFJpikIiZX9ykPk0aePAQyx0mFO0DswD", "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD",
        "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N", "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U",
        "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk", "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ",
        "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm", "1fs00OCWVi0kGY404b0Ew_alfd3B4c4Wi",
        # Extra shared active ones
        "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar", "1Pk_hMSx9-VGGW0Kv77Z30dPztg3wEhAE", "1ILTdDEzEjL17h1Bh2lEXs87f7-anlGwW", "1nLCTXImAM4jFvi1zjJXo5hmcyql8TdFu"
    ])

    core_names = [
        "TS & TM (Private)", "TS & TM (Work)", "the_system",
        "Goals, habits and method logging", "Principles, Goals, Methods and Habits",
        "TS - Task Master > 1 Day Operations Prompt", "Task_Master_7_Day_Prompt",
        "Task_Master_28_Day_Prompt", "Task_Master_84_Day_Prompt",
        "TS - Vantage Prompt", "Personal Growth Reflection - Vantage > Custom Instructions",
        "TS - Categorisation (Private)", "LOS_Taxonomy",
        "TS - Clerk > System Instructions", "TS - The System Protocols",
        "TS - Clerk > Email Categorizer Prompt", "TS - Master Asset Naming Protocol",
        "TS - Agent Protocol > Time Frameworks", "TS - Task Master > 1 Day Execution Plan",
        "TS - Task Master > 7 Day Roadmap", "TS - Task Master > 28 Day Strategic",
        "TS - Task Master > 84 Day Strategic", "Google Tasks (Private)", "Google Tasks (Combined)"
    ]

    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    folders_cache = {}
    def get_folder_name(folder_id):
        if not folder_id: return "Root"
        if folder_id in folders_cache: return folders_cache[folder_id]
        try:
            f = drive_service.files().get(fileId=folder_id, fields="name").execute()
            folders_cache[folder_id] = f.get('name', 'Unknown Folder')
            return folders_cache[folder_id]
        except:
            return "Unknown Folder"

    report_lines = []
    report_lines.append("# Redundant Files Ready for Deletion")
    report_lines.append("This table lists every file discovered in your Google Drive (Private & Shared Work) that shares the exact name of a core system file but is **not** the active ID bound to `Code_Config.js`.")
    report_lines.append("")
    report_lines.append("| Filename | ID | Location | Created | Edited | Reason for deletion |")
    report_lines.append("|---|---|---|---|---|---|")

    redundancies = []
    
    for name in core_names:
        query = f"name contains '{name}' and trashed = false"
        try:
            results = drive_service.files().list(q=query, fields="files(id, name, mimeType, createdTime, modifiedTime, parents)").execute()
            for item in results.get('files', []):
                if item['id'] not in active_ids:
                    
                    # Prevent duplicate ID entries (due to multiple matches)
                    if any(r['id'] == item['id'] for r in redundancies):
                        continue
                        
                    parent_id = item.get('parents', [None])[0]
                    location = get_folder_name(parent_id)
                    
                    created = item.get('createdTime', 'Unknown')[:10]
                    edited = item.get('modifiedTime', 'Unknown')[:10]
                    
                    reason = f"Duplicate/Obsolete ID. Name matches core system file, but is not the active architecture file in Code_Config.js."
                    
                    if "shortcut" in item['mimeType']:
                        reason = "Stale Shortcut"
                    
                    redundancies.append(item)
                    report_lines.append(f"| {item['name']} | {item['id']} | {location} | {created} | {edited} | {reason} |")
        except Exception as e:
            print(f"Error querying {name}: {e}")

    # Write to a markdown artifact
    with open('/Users/daniel/.gemini/antigravity/brain/568fddeb-4e25-4767-897b-fe9a64a8ecf3/Deletion_Report.md', 'w') as f:
        f.write('\n'.join(report_lines))

if __name__ == '__main__':
    main()
