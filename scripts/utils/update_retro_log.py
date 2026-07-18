import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import os
import re
from googleapiclient.discovery import build

def get_sheets_service():
    creds = Credentials.from_authorized_user_file('auth/token.json')
    return build('sheets', 'v4', credentials=creds)

SPREADSHEET_ID = '13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY'
RANGE_NAME = "'5 Import - Retro Emails Log'!H2:H"

migrations = {
    "01 Private/05 Other/02 Relationships/Mamma och Pappa": "01 Private/05 Other/02 Relationships/Mamma & Pappa",
    "01 Private/05 Other/02 Relationships/CMA": "01 Private/05 Other/02 Relationships/Carry Martens Adersteg",
    "03 Studies/01 År 1 | (2009-2010)": "03 Studies/02 Uppsala University/01 År 1 | (2009-2010)",
    "03 Studies/02 År 2 | (2010-2011)": "03 Studies/02 Uppsala University/02 År 2 | (2010-2011)",
    "03 Studies/03 År 3 | (2011-2012)": "03 Studies/02 Uppsala University/03 År 3 | (2011-2012)",
    "03 Studies/04 År 4 | (2012, 2014)": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
    "03 Studies/05 År 5 | (2014-2015)": "03 Studies/02 Uppsala University/05 År 5 | (2014-2015)",
    "01 Private/05 Other/01 Projects/20260411 Housewarming C&D": "01 Private/05 Other/99 Archive/20260411 Housewarming C&D",
    "01 Private/05 Other/01 Projects/2027 W": "01 Private/05 Other/01 Projects/2027 Wedding",
    "01 Private/05 Other/01 Projects/The System (TS)": "01 Private/01 Personal Admin/01 Task Management/The System (TS)",
    "01 Private/04 Finances/01 Purchase [AGGREGATOR]/Receipts": "01 Private/04 Finances/01 Purchase/Receipts",
    "00 Google Comments": "99 Google Comments",
    "01 Private/03 Personal Growth/01 Principles": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
    "Goals & Methods": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
    "02 Work/01 Employment/01 Current Roles/202605 Playmetech": "02 Work/01 Employment/01 202605 Playmetech",
    "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin": "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin",
    "99 Delete": "99 To be deleted",
    "03 Studies/99 Archive": "03 Studies/99 Studies Archive",
    "03 Studies/03 00 00": "03 Studies/03 Stockholms Nation",
    "daniel.adersteg@revolut.com": "02 Work/01 Employment/99 Archive/201911 Revolut",
    "01 Private/05 Other/01 Projects/Colab Notebooks": "01 Private/05 Other/01 Projects/Data Analysis & Software Development",
    "01 Playmetech Admin/Task Management": "01 Private/01 Personal Admin/01 Task Management",
    "01 Playmetech Admin/04 Finances/01 Purchase": "01 Private/04 Finances/01 Purchase",
    "02 Work/02 Career Management/Job Descriptions": "02 Work/02 Career Management",
    "98 SMS": "99 SMS",
    "98 Telegram": "99 Telegram",
    "98 WhatsApp": "99 WhatsApp"
}

deletions = [
    "2026; Present the gift voucher (02/11/2025) at the session",
    "Attend the perfume workshop at OPAR Alegria in Lisbon on May 11",
    "N/A", "Photo_Extracted",
    "QXY4Rm81bU5UaVRoajhPbw", "SF9ReFZyUk9lZ3ViMlJiYw", "SGhXZmtXY2hBX0MtODQ5NQ",
    "U01qY1JOUjhtSzNSdk95Mw", "UU9pdktTMmIzSW96OG1UbQ", "V3RpYTlvX28zWTlsem9iWA",
    "VGFyblZzaV9wVTdBdjNEMQ", "WW8xYTJ4dzVpdnpvTW51NQ", "YmJJZ1lreUpwSnI3NU0yOA",
    "ckRyaFdyMmdJWTdid0N6Sw"
]

def update_cell(val):
    if not val:
        return val
        
    original = val
    
    # Remove deletions
    for bad in deletions:
        pattern = r'(^|,\s*)' + re.escape(bad) + r'(?=\s*,|$)'
        val = re.sub(pattern, '', val)
    
    # Clean up trailing/leading commas left by deletions
    val = re.sub(r'^,\s*', '', val)
    val = re.sub(r',\s*$', '', val)
    
    # Apply migrations
    # Sort keys by length descending to replace most specific first
    sorted_migrations = sorted(migrations.items(), key=lambda x: len(x[0]), reverse=True)
    for bad, good in sorted_migrations:
        # Only replace if it matches the whole label (between commas or start/end)
        # Using a positive lookahead for end, and lookbehind/start for beginning
        pattern = r'(^|,\s*)' + re.escape(bad) + r'(?=\s*,|$)'
        # But we need to ensure we don't replace if it's "02 Work/01 Employment/01 Playmetech/01 Admin"
        # Since we anchored to commas, it works perfectly!
        val = re.sub(pattern, r'\g<1>' + good.replace('\\', '\\\\'), val)

    # Special case for "02 Work/01 Employment/01 Playmetech" to "02 Work/01 Employment/01 202605 Playmetech"
    # we don't want to break "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin"
    pattern = r'(^|,\s*)02 Work/01 Employment/01 Playmetech(?=\s*,|$)'
    val = re.sub(pattern, r'\g<1>02 Work/01 Employment/01 202605 Playmetech', val)
    
    return val

def main():
    service = get_sheets_service()
    print("Fetching column H from Retro Emails Log...")
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=RANGE_NAME
    ).execute()
    
    rows = result.get('values', [])
    if not rows:
        print("No data found.")
        return
        
    print(f"Fetched {len(rows)} rows. Applying migrations...")
    updated_rows = []
    changes = 0
    for row in rows:
        val = row[0] if row else ""
        new_val = update_cell(val)
        updated_rows.append([new_val])
        if new_val != val:
            changes += 1
            
    print(f"Total cells to update: {changes}")
    
    if changes > 0:
        print("Writing updates to spreadsheet...")
        body = {
            'values': updated_rows
        }
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=RANGE_NAME,
            valueInputOption='RAW',
            body=body
        ).execute()
        print("Updates written successfully!")
    else:
        print("No changes needed!")

if __name__ == '__main__':
    main()
