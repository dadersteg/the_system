import os
import json
import logging
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def get_gmail_service():
    creds = Credentials.from_authorized_user_file('auth/token.json')
    return build('gmail', 'v1', credentials=creds)

def main():
    service = get_gmail_service()
    
    # 1. Fetch all current labels
    logging.info("Fetching current Gmail labels...")
    try:
        results = service.users().labels().list(userId='me').execute()
        labels = results.get('labels', [])
        label_name_to_id = {l['name']: l['id'] for l in labels}
    except Exception as e:
        logging.error(f"Failed to fetch labels: {e}")
        return

    # From categorize_labels.py
    migrations = {
        "01 Private/05 Other/02 Relationships/Mamma och Pappa": "01 Private/05 Other/02 Relationships/Mamma & Pappa",
        "01 Private/05 Other/02 Relationships/CMA": "01 Private/05 Other/02 Relationships/Carry Martens Adersteg",
        "01 Private/05 Other/03 Collections/Useful & Helpful": "01 Private/05 Other/03 Collections/Useful & Helpful",
        "01 Private/05 Other/03 Collections/Useful": "01 Private/05 Other/03 Collections/Useful & Helpful",
        "03 Studies/01 År 1 | (2009-2010)": "03 Studies/02 Uppsala University/01 År 1 | (2009-2010)",
        "03 Studies/02 År 2 | (2010-2011)": "03 Studies/02 Uppsala University/02 År 2 | (2010-2011)",
        "03 Studies/03 År 3 | (2011-2012)": "03 Studies/02 Uppsala University/03 År 3 | (2011-2012)",
        "03 Studies/04 År 4 | (2012": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "2014)": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "03 Studies/04 År 4 | (2012, 2014)": "03 Studies/02 Uppsala University/04 År 4 | (2012, 2014)",
        "03 Studies/05 År 5 | (2014-2015)": "03 Studies/02 Uppsala University/05 År 5 | (2014-2015)",
        "01 Private/05 Other/01 Projects/20260411 Housewarming C&D": "01 Private/05 Other/99 Archive/20260411 Housewarming C&D",
        "01 Private/05 Other/01 Projects/2027 W": "01 Private/05 Other/01 Projects/2027 Wedding",
        "01 Private/05 Other/01 Projects/The System (TS)": "01 Private/01 Personal Admin/01 Task Management/The System (TS)",
        "01 Private/04 Finances/01 Purchase [AGGREGATOR]/Receipts": "01 Private/04 Finances/01 Purchase/Receipts",
        "00 Google Comments": "99 Google Comments",
        "01 Private/03 Personal Growth/01 Principles": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
        "Goals & Methods": "01 Private/03 Personal Growth/01 Principles, Goals & Methods",
        "02 Work/01 Employment/01 202605 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Current Roles/202605 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Quantum 21": "02 Work/01 Employment/01 202605 Quantum 21",
        "02 Work/01 Employment/01 Quantum 21/01 Professional Admin": "02 Work/01 Employment/01 202605 Quantum 21/01 Professional Admin",
        "02 Work/01 Employment/01 Quantum 21/02 Team & Operations": "02 Work/01 Employment/01 202605 Quantum 21/02 Team & Operations",
        "02 Work/01 Employment/01 Quantum 21/03 Professional Growth": "02 Work/01 Employment/01 202605 Quantum 21/03 Professional Growth",
        "02 Work/01 Employment/01 Quantum 21/05 Projects": "02 Work/01 Employment/01 202605 Quantum 21/05 Projects",
        "02 Work/01 Employment/01 Playmetech/01 Professional Admin": "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin",
        "99 Delete": "99 To be deleted",
        "03 Studies/99 Archive": "03 Studies/99 Studies Archive",
        "03 Studies/99 Archive/Stockholms Nation": "03 Studies/99 Studies Archive/Stockholms Nation",
        "03 Studies/99 Archive/Uppsala University": "03 Studies/99 Studies Archive/Uppsala University",
        "03 Studies/03 00 00": "03 Studies/03 Stockholms Nation",
        "03 Studies/03 00 00/99 Studies Archive": "03 Studies/99 Studies Archive/Stockholms Nation",
        "daniel.adersteg@revolut.com": "02 Work/01 Employment/99 Archive/201911 Revolut",
        "01 Private/05 Other/01 Projects/Colab Notebooks": "01 Private/05 Other/01 Projects/Data Analysis & Software Development",
        "01 Professional Admin/Task Management": "01 Private/01 Personal Admin/01 Task Management",
        "01 Professional Admin/04 Finances/01 Purchase": "01 Private/04 Finances/01 Purchase",
        "02 Work/02 Career Management/Job Descriptions": "02 Work/02 Career Management",
        "98 SMS": "99 SMS",
        "98 Telegram": "99 Telegram",
        "98 WhatsApp": "99 WhatsApp"
    }

    splits = {
        "01 Private/04 Finances/01 Purchase, 01 Private/02 Health/02 Mental Health": ["01 Private/04 Finances/01 Purchase", "01 Private/02 Health/02 Mental Health"],
        "01 Private/05 Other/03 Collections/Newsletters, 01 Private/05 Other/01 Projects/AI": ["01 Private/05 Other/03 Collections/Newsletters", "01 Private/05 Other/01 Projects/AI"]
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

    def get_or_create_label(name):
        if name in label_name_to_id:
            return label_name_to_id[name]
        logging.info(f"Creating missing label: {name}")
        try:
            label = service.users().labels().create(userId='me', body={"name": name}).execute()
            label_name_to_id[name] = label['id']
            return label['id']
        except Exception as e:
            logging.error(f"Failed to create label {name}: {e}")
            return None

    def get_threads_with_label(label_id):
        threads = []
        page_token = None
        while True:
            res = service.users().threads().list(userId='me', labelIds=[label_id], pageToken=page_token).execute()
            threads.extend([t['id'] for t in res.get('threads', [])])
            page_token = res.get('nextPageToken')
            if not page_token:
                break
        return threads

    # 2. Process Migrations
    logging.info("--- Processing Migrations ---")
    for old_name, new_name in migrations.items():
        if old_name not in label_name_to_id:
            continue
        old_id = label_name_to_id[old_name]
        
        # Don't migrate to itself if names are exactly identical
        if old_name == new_name:
            continue
            
        new_id = get_or_create_label(new_name)
        if not new_id: continue
        
        threads = get_threads_with_label(old_id)
        if threads:
            logging.info(f"Moving {len(threads)} threads from '{old_name}' to '{new_name}'")
            for tid in threads:
                try:
                    service.users().threads().modify(userId='me', id=tid, body={'addLabelIds': [new_id], 'removeLabelIds': [old_id]}).execute()
                except Exception as e:
                    logging.error(f"Failed to modify thread {tid}: {e}")

        # Delete old label
        logging.info(f"Deleting migrated label: '{old_name}'")
        try:
            service.users().labels().delete(userId='me', id=old_id).execute()
        except Exception as e:
            logging.error(f"Failed to delete {old_name}: {e}")

    # 3. Process Splits
    logging.info("--- Processing Splits ---")
    for combo_name, valid_names in splits.items():
        if combo_name not in label_name_to_id:
            continue
        combo_id = label_name_to_id[combo_name]
        
        valid_ids = []
        for v in valid_names:
            vid = get_or_create_label(v)
            if vid: valid_ids.append(vid)
            
        threads = get_threads_with_label(combo_id)
        if threads:
            logging.info(f"Splitting {len(threads)} threads from '{combo_name}' into {valid_names}")
            for tid in threads:
                try:
                    service.users().threads().modify(userId='me', id=tid, body={'addLabelIds': valid_ids, 'removeLabelIds': [combo_id]}).execute()
                except Exception as e:
                    logging.error(f"Failed to modify thread {tid}: {e}")

        logging.info(f"Deleting split label: '{combo_name}'")
        try:
            service.users().labels().delete(userId='me', id=combo_id).execute()
        except Exception as e:
            pass
            
    # 4. Process Deletions
    logging.info("--- Processing Deletions ---")
    for del_name in deletions:
        if del_name in label_name_to_id:
            del_id = label_name_to_id[del_name]
            logging.info(f"Deleting garbage label: '{del_name}'")
            try:
                service.users().labels().delete(userId='me', id=del_id).execute()
            except Exception as e:
                logging.error(f"Failed to delete {del_name}: {e}")

    logging.info("Done!")

if __name__ == '__main__':
    main()
