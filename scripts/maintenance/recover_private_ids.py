import os
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    token_path = 'auth/token.json'
    if not os.path.exists(token_path):
        print("token.json not found")
        return

    creds = Credentials.from_authorized_user_file(
        token_path, 
        ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    drive_service = build('drive', 'v3', credentials=creds)

    files_to_find = [
        "TS & TM (Private)", # Master sheet
        "the_system", # Workspace folder
        "Goals, habits and method logging (Private)", # Habits sheet
        "TS - Task Master > 1 Day Operations Prompt.md",
        "TS - Task Master > 7 Day Roadmap Prompt.md", # Need to check exact name
        "TS - Task Master > 28 Day Strategic Prompt.md",
        "TS - Task Master > 84 Day Strategic Prompt.md",
        "TS - Vantage Prompt.md",
        "Personal Growth Reflection - Vantage > Custom Instructions.md",
        "TS - Categorisation (Private)", # Taxonomy Doc
        "LOS_Taxonomy.json", # Taxonomy JSON
        "Principles, Goals, Methods and Habits (Personal) - Output (Active).md",
        "Principles, Goals, Methods and Habits (Work) - Output (Active).md",
        "TS - Clerk > System Instructions.md",
        "TS - The System Protocols.md", # Clerk drive protocol
        "TS - Clerk > Email Categorizer Prompt.md",
        "TS - Master Asset Naming Protocol.md",
        "TS - Agent Protocol > Time Frameworks.md",
        "TS - Task Master > 1 Day Execution Plan (Private).md",
        "TS - Task Master > 7 Day Roadmap (Private).md",
        "TS - Task Master > 28 Day Strategic Pruning (Private).md",
        "TS - Task Master > 84 Day Strategic Reflection (Private).md",
        "Google Tasks (Private).md",
        "Google Tasks (Combined).md",
        "old_LOS", # Retro root folder
    ]

    print("SEARCHING PRIVATE GOOGLE DRIVE...")
    for filename in files_to_find:
        # We use a broad search first
        query = f"name contains '{filename.replace('.md', '')}' and trashed = false"
        try:
            results = drive_service.files().list(q=query, fields="files(id, name, mimeType)").execute()
            items = results.get('files', [])
            if not items:
                print(f"NOT FOUND: {filename}")
            else:
                for item in items:
                    print(f"FOUND: {item['name']} -> {item['id']} ({item['mimeType']})")
        except Exception as e:
            print(f"ERROR searching {filename}: {e}")

if __name__ == '__main__':
    main()
