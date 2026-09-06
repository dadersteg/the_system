import subprocess
import json

task1_title = "Rename Market Category column to Market_L1 in Planning - Framework spreadsheet"
task1_notes = """https://mail.google.com/mail/u/0/#all/19efeb7bb993a2e6

Context: 02 01 01 Playmetech > 05 Projects

Rename Market Category column to Market_L1 in Planning - Framework spreadsheet

[DEADLINE: 2026-06-27] | [DURATION: 5m] | [GOAL: 2026-Q2-012]

SYS:
DA:

---SYSTEM_METADATA---
{"duration":"5m","goal":"2026-Q2-012","category_path":"02 01 01 Playmetech > 05 Projects","created_at":"2026-06-25T12:22:23.311Z","deadline":"2026-06-27","ai_hash":"mT+uSdx1BsO90FyD5HUJaQ=="}"""

task2_title = "Update Planning Framework spreadsheet to standardized Cellsior format"
task2_notes = """https://mail.google.com/mail/u/0/#all/19efeb7bb993a2e6

Context: 02 01 01 Playmetech > 05 Projects

Update Planning - Framework spreadsheet to standardized Cellsior format

[DEADLINE: 2026-06-27] | [DURATION: 1h] | [GOAL: 2026-Q2-012]

SYS:
DA:

---SYSTEM_METADATA---
{"duration":"1h","goal":"2026-Q2-012","category_path":"02 01 01 Playmetech > 05 Projects","created_at":"2026-06-25T12:22:23.049Z","deadline":"2026-06-27","ai_hash":"wq43O6k/mS4TeErcP/sFwQ=="}"""

def create(title, notes):
    cmd = ["python3", "scripts/utils/create_task.py", "--title", title, "--notes", notes, "--due", "2026-06-27", "--profile", "work"]
    subprocess.run(cmd, check=True)

create(task1_title, task1_notes)
create(task2_title, task2_notes)

# Complete the old ones
subprocess.run(["python3", "scripts/utils/edit_task.py", "--id", "NTB2VHdoMmc4YTdWRmVhUg", "--list-id", "RWNzLU50Qmp1QUZpalhqSg", "--status", "completed", "--profile", "private"], check=True)
subprocess.run(["python3", "scripts/utils/edit_task.py", "--id", "S3JVMzlfOUZLTDlWSkxfNg", "--list-id", "RWNzLU50Qmp1QUZpalhqSg", "--status", "completed", "--profile", "private"], check=True)

print("Tasks moved successfully.")
