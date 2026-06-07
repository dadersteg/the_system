import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
    # Complete mapping of core names to their ACTIVE IDs so we can link the "Replaced By"
    core_mapping = {
        "TS & TM (Private)": {"id": "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY", "type": "sheet"},
        "TS & TM (Work)": {"id": "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY", "type": "sheet"},
        "Goals, habits and method logging": {"id": "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo", "type": "sheet"},
        "Principles, Goals, Methods and Habits": {"id": "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo", "type": "sheet"},
        "TS - Task Master > 1 Day Operations Prompt": {"id": "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", "type": "doc"},
        "Task_Master_7_Day_Prompt": {"id": "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb", "type": "doc"},
        "Task_Master_28_Day_Prompt": {"id": "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf", "type": "doc"},
        "Task_Master_84_Day_Prompt": {"id": "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2", "type": "doc"},
        "TS - Vantage Prompt": {"id": "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D", "type": "doc"},
        "Personal Growth Reflection - Vantage > Custom Instructions": {"id": "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC", "type": "doc"},
        "TS - Categorisation (Private)": {"id": "142r2YeV5v209crHS5J5HvWr1s4TOnexp", "type": "doc"},
        "LOS_Taxonomy": {"id": "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq", "type": "file"},
        "TS - Clerk > System Instructions": {"id": "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U", "type": "doc"},
        "TS - The System Protocols": {"id": "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk", "type": "doc"},
        "TS - Clerk > Email Categorizer Prompt": {"id": "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ", "type": "doc"},
        "TS - Master Asset Naming Protocol": {"id": "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn", "type": "doc"},
        "TS - Agent Protocol > Time Frameworks": {"id": "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm", "type": "doc"},
        "TS - Task Master > 1 Day Execution Plan": {"id": "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq", "type": "doc"},
        "TS - Task Master > 7 Day Roadmap": {"id": "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3", "type": "doc"},
        "TS - Task Master > 28 Day Strategic": {"id": "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u", "type": "doc"},
        "TS - Task Master > 84 Day Strategic": {"id": "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R", "type": "doc"},
        "Google Tasks (Private)": {"id": "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty", "type": "doc"},
        "Google Tasks (Combined)": {"id": "1fs00OCWVi0kGY404b0Ew_alfd3B4c4Wi", "type": "doc"},
        "The System (Private)": {"id": "1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75", "type": "script"},
        "The System (Work)": {"id": "1AwxxwzWWy42s8KfgoOq8RzV37ZsnQa6dyVq3eXusTuxVcQDpS8Xyhbjg", "type": "script"},
    }

    # Add ALL active IDs from the original list just to be globally safe from deletion
    active_ids_safelist = set([
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
        "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar", "1Pk_hMSx9-VGGW0Kv77Z30dPztg3wEhAE", 
        "1ILTdDEzEjL17h1Bh2lEXs87f7-anlGwW", "1nLCTXImAM4jFvi1zjJXo5hmcyql8TdFu",
        "1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75", # Apps Script Private!
        "1AwxxwzWWy42s8KfgoOq8RzV37ZsnQa6dyVq3eXusTuxVcQDpS8Xyhbjg"  # Apps Script Work!
    ])

    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'])
    drive_service = build('drive', 'v3', credentials=creds)
    sheets_service = build('sheets', 'v4', credentials=creds)

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
            
    def make_link(f_id, f_type, text="Link"):
        if f_type == "sheet":
            return f'=HYPERLINK("https://docs.google.com/spreadsheets/d/{f_id}/edit", "{text}")'
        elif f_type == "doc":
            return f'=HYPERLINK("https://docs.google.com/document/d/{f_id}/edit", "{text}")'
        elif f_type == "script":
            return f'=HYPERLINK("https://script.google.com/d/{f_id}/edit", "{text}")'
        else:
            return f'=HYPERLINK("https://drive.google.com/file/d/{f_id}/view", "{text}")'

    rows = []
    # Header
    rows.append(["Filename", "Location", "Created", "Edited", "Reason for deletion", "File to Delete (URL)", "Replaced By / Active File (URL)"])

    redundancies = []
    
    for name in core_mapping.keys():
        query = f"name contains '{name}' and trashed = false"
        try:
            results = drive_service.files().list(q=query, fields="files(id, name, mimeType, createdTime, modifiedTime, parents)").execute()
            for item in results.get('files', []):
                if item['id'] not in active_ids_safelist:
                    
                    if any(r['id'] == item['id'] for r in redundancies):
                        continue
                        
                    parent_id = item.get('parents', [None])[0]
                    location = get_folder_name(parent_id)
                    created = item.get('createdTime', 'Unknown')[:10]
                    edited = item.get('modifiedTime', 'Unknown')[:10]
                    
                    reason = "Obsolete Copy"
                    if "shortcut" in item['mimeType']:
                        reason = "Stale Shortcut"
                    
                    # Deduce type for the bad file link based on mimetype
                    b_type = "file"
                    if "spreadsheet" in item['mimeType']: b_type = "sheet"
                    if "document" in item['mimeType']: b_type = "doc"
                    if "script" in item['mimeType']: b_type = "script"
                        
                    bad_link = make_link(item['id'], b_type, "View Bad File")
                    
                    good_id = core_mapping[name]['id']
                    g_type = core_mapping[name]['type']
                    good_link = make_link(good_id, g_type, f"View Active ({name})")
                    
                    redundancies.append(item)
                    rows.append([item['name'], location, created, edited, reason, bad_link, good_link])
        except Exception as e:
            pass

    # Now write this to the spreadsheet
    spreadsheet_id = '1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8'
    
    # 1. Add new sheet
    add_sheet_request = {
        'addSheet': {
            'properties': {
                'title': 'Deletion Candidates',
                'index': 1
            }
        }
    }
    
    sheet_id = None
    try:
        response = sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'requests': [add_sheet_request]}
        ).execute()
        sheet_id = response['replies'][0]['addSheet']['properties']['sheetId']
    except Exception as e:
        if "already exists" in str(e).lower():
            sheet_info = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            sheet_id = next(s['properties']['sheetId'] for s in sheet_info['sheets'] if s['properties']['title'] == 'Deletion Candidates')
            # Clear it
            sheets_service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range='Deletion Candidates', body={}).execute()
        else:
            print(f"Error adding sheet: {e}")
            return

    # 2. Write data (USER_ENTERED so formulas evaluate)
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range='Deletion Candidates!A1',
        valueInputOption='USER_ENTERED',
        body={'values': rows}
    ).execute()
    
    # 3. Format header and resize
    format_requests = [
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0, 'endRowIndex': 1,
                    'startColumnIndex': 0, 'endColumnIndex': 7
                },
                'cell': {
                    'userEnteredFormat': {
                        'textFormat': {'bold': True},
                        'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}
                    }
                },
                'fields': 'userEnteredFormat(textFormat,backgroundColor)'
            }
        },
        {
            'updateDimensionProperties': {
                'range': {'sheetId': sheet_id, 'dimension': 'COLUMNS', 'startIndex': 0, 'endIndex': 1},
                'properties': {'pixelSize': 300}, 'fields': 'pixelSize'
            }
        },
        {
            'updateDimensionProperties': {
                'range': {'sheetId': sheet_id, 'dimension': 'COLUMNS', 'startIndex': 5, 'endIndex': 7},
                'properties': {'pixelSize': 200}, 'fields': 'pixelSize'
            }
        }
    ]
    
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={'requests': format_requests}
    ).execute()
    
    print("Spreadsheet successfully updated!")

if __name__ == '__main__':
    main()
