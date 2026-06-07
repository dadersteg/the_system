import subprocess
import shlex

commands = [
    # Request cost and service breakdown from Morad
    'my_venv/bin/python3 scripts/utils/edit_task.py --id ZmF4VjhRcnE2T2xyYUFNRQ --list-id M05Gb0c1dG91bXlkQUJpVQ --status completed --profile work',
    # Schedule team operations discussion with Daniel Adersteg
    'my_venv/bin/python3 scripts/utils/edit_task.py --id UWhHbG9BaE1OOGFSZEN5Zw --list-id M05Gb0c1dG91bXlkQUJpVQ --status completed --profile work',
    # Call VJA to clarify individual team responsibilities
    'my_venv/bin/python3 scripts/utils/edit_task.py --id b1VyN1pBaVFPVldpbi02Zg --list-id M05Gb0c1dG91bXlkQUJpVQ --status completed --profile work',
    # Update due date of 'Share strategy and market tables' to be after 'Finalize...' which is 06-15. Let's make 'Share...' due on 06-16.
    'my_venv/bin/python3 scripts/utils/edit_task.py --id QjE4c25aQ0w3ZUZ1T1g5SA --list-id M05Gb0c1dG91bXlkQUJpVQ --due "2026-06-16" --profile work'
]

for cmd in commands:
    print(f"Running: {cmd}")
    subprocess.run(shlex.split(cmd))

