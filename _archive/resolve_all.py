import os
import re
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def main():
    token_path = 'token.json'
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

    ids_to_resolve = [
        # ROOTS
        "1h18P9LxpTfNS17k-G9nUKAX8Wfk8CYwe", # WORKSPACE_FOLDER_ID Work
        "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", # WORKSPACE_FOLDER_ID Private
        
        # DOCS
        "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar", # TASK_MASTER_PROMPT_ID
        "1bMNfanIwxmZa2XeappF0E5Pha4OhbHXu", # TASK_MASTER_DAILY_PROMPT_ID
        "1fdnk0fy427rh5KBBIbOZ7b7aDJN5Q9oh", # TASK_MASTER_WEEKLY_PROMPT_ID
        "1Pbd82pt6qEfTbc7iPNlvCiR6VwqDoj1d", # TASK_MASTER_MONTHLY_PROMPT_ID
        "19tMj7x-enx2V46zxQk_GV8zCMDnXYPC3", # TASK_MASTER_QUARTERLY_PROMPT_ID
        "1gFvlLGijJ2Z1wbK8L32SFakH66yGXVUo", # TAXONOMY_DOC_ID Work
        "1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf", # TAXONOMY_DOC_ID Private
        "1o5nw6OXjXUP15pcsCM139mQm33xKT4NA", # TAXONOMY_JSON_ID Work
        "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq", # TAXONOMY_JSON_ID Private
        "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U", # CLERK_DRIVE_INSTRUCTIONS
        "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ", # CLERK_EMAIL_PROMPT_ID
        "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D", # VANTAGE PROMPT
        "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC", # VANTAGE CUSTOM
        
        # GENERATED OUTPUTS
        "1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7", # DAY 1 WORK
        "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq", # DAY 1 PRIVATE
        "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3", # DAY 7 
        "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u", # DAY 28
        "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R", # DAY 84
        "1OaW3uaTB7edPYQFXNFzMpvxqlUvCRMG2", # TASKS_EXPORT WORK
        "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty", # TASKS_EXPORT PRIVATE

        # DRIVE FOLDERS
        "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb", # STND_DEST Default
        "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY", # REVIEW Default
        "10OWXo6W88eB3P-yP_zq67vrEPHqtbuc1", # OUT_OF_SCOPE Default

        # DRIVE SOURCES (Array)
        "1XossC1cdOZE82efew3qH48LJnhl6ng4i",
        "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9",
        "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si",
        "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh",
        "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv",
        "17uUH01ihipNeRfTQQcD61zzjORpWFCRY",
        "1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo",

        # CLERK NOTES
        "1yKMLA11aEG3FI8UuWSsGHP9X-fgBBEfa", # ROUTE_MODE
        "1ImPaXVXQetcaCFE9aY9DT0AM3thGXcEc", # CLEAN_MODE
        
        # REFLECTION CONFIG
        "1pchhGyniJKiWRm6zNXy834SSeITh3BW4ogVJGImfvFM",
        "1Ot9fJ5P-Z_O6BOIlWZ2L_oyCIw6Ixeet",
        "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo",
        "1V-w6QtL9e16nnWdi5m58U0iPxfuIVfmyMrHrfZk9iI8"
    ]

    print("Fetching exact names from Drive API...")
    for file_id in ids_to_resolve:
        try:
            f = drive_service.files().get(fileId=file_id, fields="name, mimeType").execute()
            name = f.get('name')
            mime = f.get('mimeType')
            print(f"{file_id} -> {name} ({mime})")
        except Exception as e:
            print(f"{file_id} -> NOT FOUND OR NO PERMISSION")

if __name__ == '__main__':
    main()
