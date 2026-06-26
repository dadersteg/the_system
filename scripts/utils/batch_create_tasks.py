import json
import sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def create_tasks():
    with open('auth/token_tasks_work.json', 'r') as f:
        creds_data = json.load(f)
    
    creds = Credentials(
        token=creds_data['token'],
        refresh_token=creds_data['refresh_token'],
        token_uri=creds_data['token_uri'],
        client_id=creds_data['client_id'],
        client_secret=creds_data['client_secret']
    )
    
    service = build('tasks', 'v1', credentials=creds)
    
    # We will use the primary list (@default) since it's the PMT profile
    list_id = '@default'
    
    tasks = [
        {"title": "Schedule 20-minute individual meetings with team members", "notes": "Discuss H2 goals and ambitions.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Optimize unit calculator in spreadsheet", "notes": "Clean up the section to improve display clarity.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Resolve Fixture Logic discrepancies", "notes": "Fix data discrepancies regarding cancelled games and fixture dates within the tracking tool.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Migrate historical trading data", "notes": "Port existing historical data into the new standardized spreadsheet format.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Convert MLB signal Telegram group to channel", "notes": "Enables full automation of the inflow data.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Develop Strategy Spreadsheets", "notes": "Create and refine standardized spreadsheets for MLB and qualitative tennis strategies.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Define P&L targets with Mark", "notes": "Consult Mark regarding the finalization of performance metrics and goals for H2.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Reschedule meeting with Finn Brasher", "notes": "Arrange a meeting for Monday to review individual performance scorecards.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Update Claude skill Readme", "notes": "Accurately document input requirements and procedures.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Develop code to parse Match Reports", "notes": "Reverse engineer match reports into a structured data format.\n\n[Source: Sync: Daniel <> Traders]"},
        {"title": "Present trading spreadsheet to traders", "notes": "Demonstrate usage and gather feedback.\n\n[Source: Mark / Daniel - Quick alignment before synch with traders]"},
        {"title": "Refine trading spreadsheet", "notes": "Based on discussion and feedback from the traders.\n\n[Source: Mark / Daniel - Quick alignment before synch with traders]"},
        {"title": "Create Strategy Templates", "notes": "Develop the trading spreadsheet templates for tennis, NBA, and NFL.\n\n[Source: Mark / Daniel - Quick alignment before synch with traders]"},
        {"title": "Update Scorecard KPIs", "notes": "Evaluate the inclusion of efficiency metrics in the trader performance scorecard based on the spreadsheet Mark shares.\n\n[Source: Mark / Daniel - Quick alignment before synch with traders]"}
    ]
    
    for t in tasks:
        # TaskMaster rules: TheClerk appends context and metadata.
        # But we'll just insert them cleanly.
        try:
            result = service.tasks().insert(tasklist=list_id, body=t).execute()
            print(f"Created task: {result['title']}")
        except Exception as e:
            print(f"Error creating task {t['title']}: {e}")

create_tasks()
