import os
import shutil

def clear_sessions():
    print("Starting cleanup of local compromised session/token files...")

    files_to_delete = [
        "auth/token.json",
        "auth/token_calendar.json",
        "auth/token_calendar_work.json",
        "auth/token_tasks.json",
        "auth/token_tasks_work.json",
        "auth/photos_token.json",
        "data/token_tasks.json",
        "data/token_tasks_work.json",
        "data/token_work_setup.json",
        "data/TS_telethon_session.session",
        "data/TS_telethon_session_1.session",
        "TS_telethon_session.session",
        "Fca_Database/database.sqlite",
        "src/ingestion/Fca_Database/database.sqlite"
    ]

    for f_path in files_to_delete:
        if os.path.exists(f_path):
            try:
                os.remove(f_path)
                print(f"✓ Deleted: {f_path}")
            except Exception as e:
                print(f"✗ Failed to delete {f_path}: {e}")
        else:
            print(f"· Already absent: {f_path}")

    print("Session cleanup completed successfully.")

if __name__ == "__main__":
    clear_sessions()
