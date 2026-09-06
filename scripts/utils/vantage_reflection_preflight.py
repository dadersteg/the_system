#!/usr/bin/env python3
"""
scripts/utils/vantage_reflection_preflight.py
Static CLI preflight utility for Vantage Daily Reflection AI Audit.
Replaces dynamic inline python (-c) to guarantee zero Antigravity permission modals.

Usage:
  python3 scripts/utils/vantage_reflection_preflight.py [--max-age-hours 48]
"""

import os
import sys
import time
import json
import argparse
from pathlib import Path

# Ensure workspace venv site-packages are loaded in sandboxed runs
for candidate_site in [
    Path(__file__).resolve().parent.parent.parent / "scratch" / "my_venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path(__file__).resolve().parent.parent.parent / "venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path("/Users/daniel/Documents/AGY/the_system/scratch/my_venv/lib/python3.14/site-packages"),
    Path("/Users/daniel/Developer/the_system/venv/lib/python3.14/site-packages"),
]:
    if candidate_site.exists() and str(candidate_site) not in sys.path:
        sys.path.insert(1, str(candidate_site))

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCRATCH_DIR = BASE_DIR / "scratch"
LOCK_PATH = SCRATCH_DIR / ".vantage_reflection_sweep.lock"

# Standard paths
DOCS_AGY_DIR = Path("/Users/daniel/Documents/AGY")
VANTAGE_RAW_LOG = DOCS_AGY_DIR / "reflection" / "Vantage_Log_2-Day.md"
PRIORITY_GOALS = DOCS_AGY_DIR / "reflection" / "Priority Goals.md"
LOS_TAXONOMY = DOCS_AGY_DIR / "the_system" / "docs" / "LOS_Taxonomy.json"

def main():
    parser = argparse.ArgumentParser(description="Preflight check for Vantage Reflection AI Audit.")
    parser.add_argument("--max-age-hours", type=float, default=48.0, help="Maximum allowed age for raw log in hours (default: 48)")
    parser.add_argument("--force", action="store_true", help="Bypass stale data warning")
    args = parser.parse_args()

    now = time.time()

    # 1. Mutex lock check
    if LOCK_PATH.exists():
        try:
            mtime = LOCK_PATH.stat().st_mtime
            if now - mtime < 300: # 5 minute lock TTL
                print(json.dumps({
                    "status": "LOCKED",
                    "message": f"Prior Vantage reflection audit currently active (age: {int(now - mtime)}s < 300s). Exiting."
                }))
                sys.exit(0)
            else:
                # Stale lock override
                LOCK_PATH.unlink(missing_ok=True)
        except Exception:
            pass

    # 2. Verify existence of raw data files
    if not VANTAGE_RAW_LOG.exists():
        print(json.dumps({
            "status": "ERROR",
            "message": f"Vantage raw log file not found at: {VANTAGE_RAW_LOG}"
        }), file=sys.stderr)
        sys.exit(1)

    # 3. Check data freshness
    raw_mtime = VANTAGE_RAW_LOG.stat().st_mtime
    age_hours = (now - raw_mtime) / 3600.0

    if age_hours > args.max_age_hours and not args.force:
        print(json.dumps({
            "status": "STALE_RAW_DATA",
            "age_hours": round(age_hours, 1),
            "max_allowed_hours": args.max_age_hours,
            "message": f"Vantage_Log_2-Day.md is {round(age_hours, 1)}h old (> {args.max_age_hours}h limit). Wait for next Apps Script sync or pass --force."
        }))
        sys.exit(0)

    # 4. Acquire mutex lock for active run
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(str(now), encoding="utf-8")

    # 5. Extract quick metadata summary from raw log
    content = VANTAGE_RAW_LOG.read_text(encoding="utf-8", errors="ignore")
    has_health = "Biological & Health Snapshot" in content
    meeting_count = content.count("- **")
    has_goals = PRIORITY_GOALS.exists()
    has_taxonomy = LOS_TAXONOMY.exists()

    payload = {
        "status": "ACTIONABLE",
        "message": "Raw Vantage log is fresh and ready for daily AI reflection clustering",
        "raw_log_path": str(VANTAGE_RAW_LOG),
        "raw_log_age_hours": round(age_hours, 2),
        "raw_log_size_bytes": len(content),
        "has_health_snapshot": has_health,
        "rough_items_count": meeting_count,
        "priority_goals_path": str(PRIORITY_GOALS) if has_goals else None,
        "los_taxonomy_path": str(LOS_TAXONOMY) if has_taxonomy else None,
        "lock_acquired": True
    }

    print(json.dumps(payload, indent=2))
    sys.exit(0)

if __name__ == '__main__':
    main()
