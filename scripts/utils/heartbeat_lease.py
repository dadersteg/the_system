"""
scripts/utils/heartbeat_lease.py
Updates the shared Google Sheet heartbeat lease from local Mac mini Antigravity daemons.
Guarantees complete cross-layer race condition prevention between Mac mini and Google Cloud.
"""

import os
import sys
import argparse
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from lib.google_auth import get_service

MASTER_SHEET_ID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
TOKEN_PATH = str(BASE_DIR / "auth" / "token.json")

PIPELINE_ROW_MAP = {
    "ALL": 2,
    "CLERK_EMAIL": 3,
    "CLERK_DRIVE": 4,
    "CLERK_NOTES": 5,
    "TASK_MASTER": 6,
    "CLERK_PHOTOS": 7
}

def touch_heartbeat_lease(pipeline_name="TASK_MASTER", status="SUCCESS", duration_sec=0.0, details="", silent=False):
    try:
        service = get_service('sheets', 'v4', TOKEN_PATH, account_name="Private")
        if not service:
            if not silent:
                print("[HeartbeatLease] Error: Could not obtain Google Sheets service.", file=sys.stderr)
            return False

        utc_now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        row_idx = PIPELINE_ROW_MAP.get(pipeline_name.upper(), 2)

        data = [
            {"range": "System_Status!B2", "values": [[utc_now]]}
        ]

        if row_idx != 2:
            data.append({
                "range": f"System_Status!A{row_idx}:F{row_idx}",
                "values": [[pipeline_name.upper(), utc_now, "macmini_antigravity", status, duration_sec, details]]
            })
        else:
            data.append({
                "range": f"System_Status!A2:F2",
                "values": [["ALL", utc_now, "macmini_antigravity", status, duration_sec, details or "Global lease touched"]]
            })

        body = {
            "valueInputOption": "USER_ENTERED",
            "data": data
        }

        service.spreadsheets().values().batchUpdate(
            spreadsheetId=MASTER_SHEET_ID,
            body=body
        ).execute()

        if not silent:
            print(f"[HeartbeatLease] Successfully touched lease for {pipeline_name} at {utc_now}")
        return True

    except Exception as e:
        if not silent:
            print(f"[HeartbeatLease] Warning: Failed to touch Google Sheet lease: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update shared Google Sheet heartbeat lease.")
    parser.add_argument("--pipeline", default="TASK_MASTER", help="Pipeline name (e.g. TASK_MASTER, CLERK_EMAIL, CLERK_DRIVE, CLERK_NOTES, CLERK_PHOTOS, ALL)")
    parser.add_argument("--status", default="SUCCESS", help="Execution status (SUCCESS, SKIPPED, PARTIAL_FAILURE)")
    parser.add_argument("--duration", type=float, default=0.0, help="Duration in seconds")
    parser.add_argument("--details", default="", help="Operational details or note")
    args = parser.parse_args()

    success = touch_heartbeat_lease(
        pipeline_name=args.pipeline,
        status=args.status,
        duration_sec=args.duration,
        details=args.details
    )
    sys.exit(0 if success else 1)
