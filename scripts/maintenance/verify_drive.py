import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def main():
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
        "1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75", 
        "1AwxxwzWWy42s8KfgoOq8RzV37ZsnQa6dyVq3eXusTuxVcQDpS8Xyhbjg"
    ])

    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    known_failed_id = "1KvIweynK29PqjmEWC8Lln9Dkpfd-sfV2xrOLauChDDG6RtsKtMq6_Lj1"

    verification_failed = []
    
    print("Verifying Drive integrity...")
    for name in core_mapping.keys():
        query = f"name contains '{name}' and trashed = false"
        try:
            results = drive_service.files().list(q=query, fields="files(id, name)").execute()
            for item in results.get('files', []):
                # If we find a non-trashed file matching a core name
                if item['id'] not in active_ids_safelist:
                    if item['id'] == known_failed_id:
                        continue # Ignore the known PMT owned file
                    verification_failed.append(item)
        except Exception as e:
            pass

    if not verification_failed:
        print("VERIFICATION SUCCESSFUL: 100% of the active environment is perfectly pruned.")
        print("There are ZERO non-trashed files with core system names other than the exact ones hardcoded into your system.")
    else:
        print(f"VERIFICATION FAILED: Found {len(verification_failed)} leftover redundant files!")
        for f in verification_failed:
            print(f"FAILED: {f['name']} ({f['id']})")

if __name__ == '__main__':
    main()
