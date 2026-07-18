import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

creds_path = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
with open(creds_path, 'r') as f:
    creds_data = json.load(f)
creds = Credentials.from_authorized_user_info(creds_data)
drive_service = build('drive', 'v3', credentials=creds)

FOLDERS = {
    "Private": "1ylbggzC_eIJAMu-_AwPj7YJL1Z_uuoOJ",
    "PMT": "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"
}

VALID_IDS = {
    "1VREgoPzHch9Xv8s-biItsxQNC_dPQf8P", "1fOHMyte-4BK6utHCnCy8Ja-j0tZNQbkC",
    "1yI4BarhjhA-ItunDGmVCvgkA7HwhKHZM", "15ZXJuX4Brv9c5_6TmGiBrgGiDzdboKOg",
    "1bkC2tokT8T4y6J_Wtb5Yvhj2P2SNM7eE", "1RAcHZu-LwItKwhRm_6KEP8oub4lnV4NF",
    "1APimzuaiIwYPLks_oGUyAQlnuotaToXG", "1z3pauhxdHUrwjAnEsFKasGgrePKjR49B",
    "1JsBHV7S7_18OPido_GFwEFCN86ap_9Y7", "11_655bXs1fEzUtcyq9w5YZ1GXxTHOibg",
    "1HYwavvWmxAftTxQaqh5Cu5HrL5cpCFml", "1neIZJ8bbhgHbOc9mk-w9gksKecZ9JrPY",
    "1p2zWJYvO6cTwmBA5wfXydGKNo3P_Epcv", "1OqyqKAUN6nmzQvI1f86ahYfhQaAK7L0O",
    "1D9suPW_QoTZrGPMPCMxsGAEJvf0inlcl", "16Jtn5bcZjsi6_tN0iuT4K5fa-qmd_o7G"
}

for env, folder_id in FOLDERS.items():
    print(f"\n--- Checking {env} ({folder_id}) ---")
    q = f"'{folder_id}' in parents and trashed=false"
    res = drive_service.files().list(q=q, fields="files(id, name, createdTime)").execute()
    files = res.get('files', [])
    
    file_map = {}
    for f in files:
        name = f['name']
        if name not in file_map:
            file_map[name] = []
        file_map[name].append(f)
        
    for name, duplicates in file_map.items():
        if len(duplicates) > 1:
            print(f"DUPLICATE FOUND: {name} has {len(duplicates)} copies.")
            for f in duplicates:
                if f['id'] in VALID_IDS:
                    print(f"  Keeping registered file: {f['id']}")
                else:
                    print(f"  Deleting unregistered duplicate: {f['id']}")
                    drive_service.files().delete(fileId=f['id']).execute()
        else:
            print(f"OK: {name} (1 copy)")

print("\nCleanup complete.")
