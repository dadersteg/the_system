import time
import subprocess
import os

SYNC_INTERVAL = 120 # Run every 2 minutes (120 seconds)

def run_sync():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting task sync...")
    try:
        # We use subprocess to run it exactly as a fresh invocation
        result = subprocess.run(['python3', 'sync_tasks_combined.py'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Sync complete.")
        else:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Sync failed with error:")
            print(result.stderr)
    except Exception as e:
        print(f"Error during sync execution: {e}")

if __name__ == '__main__':
    print(f"Starting Task Sync Daemon (Interval: {SYNC_INTERVAL}s)")
    while True:
        run_sync()
        time.sleep(SYNC_INTERVAL)
