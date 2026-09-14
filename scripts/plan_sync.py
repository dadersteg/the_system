#!/usr/bin/env python3
# MIRROR of the_system_ce/scripts/plan_sync.py (canonical). Edit there, then copy here.
# Present so the Private profile can run the engine on machines without the_system_ce.
"""plan_sync.py - READ-ONLY reconciliation between a profile's Plan Sources and Google Tasks.

Writes nothing. Produces the diff the plan_sync skill acts on after approval: tasks whose
plan row is Done or Blocked, plan rows with no task, tasks with no plan home, and links
that point at rows that no longer exist.

Everything that is a fact about The System - which sources exist, where they live, how
they route, what their status words mean, which lists and channels a profile has - comes
from the registry `Plan_Sources.json` in the docs repo (Protocols §3.4;
`TS - Plan Sync Protocol.md`). This file holds only the computation.

Runs on either side of the profile boundary (Protocol §3.3): the CE adapter uses this
repository's `common.py`; the Private adapter shells out to the_system's task bridge
(`scripts/utils/list_tasks.py`) and needs that profile's token on the machine. The file
has no hard dependency on `common`, so a mirror copy can run where the_system_ce is
absent (canonical copy: the_system_ce/scripts/plan_sync.py).

Usage:
    plan_sync.py                                 # markdown report, profile ce
    plan_sync.py --profile private               # needs the Private token on this machine
    plan_sync.py --profile ce --json             # machine-readable buckets
    plan_sync.py --registry PATH                 # registry other than $DOCS_REPO/Plan_Sources.json
    plan_sync.py --out FILE                      # also write the report to FILE

Environment: DOCS_REPO (docs repo path), PLAN_SYNC_REGISTRY (registry file),
PLAN_SYNC_PROFILE (default profile), THE_SYSTEM_HOME (the_system checkout for the bridge),
PLAN_SYNC_BRIDGE_PYTHON (interpreter for the bridge; default: this one).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

HOME = Path.home()


def _first_existing(env_var: str, *candidates: Path) -> Path:
    """An explicit env var wins; otherwise the first candidate that exists; otherwise the first
    candidate (so the error message names a sensible path). Candidates cover the work laptop
    (~/Developer/...) and the Mac mini (~/Documents/AGY/..., docs nested in the_system)."""
    env = os.getenv(env_var)
    if env:
        return Path(os.path.expanduser(env))
    return next((p for p in candidates if p.exists()), candidates[0])


DOCS_REPO = _first_existing("DOCS_REPO",
                            HOME / "Developer" / "the_system_docs",
                            HOME / "Documents" / "AGY" / "the_system" / "docs",
                            HOME / "AGY" / "the_system_docs",
                            HOME / "AGY" / "the_system" / "docs")
REGISTRY_DEFAULT = Path(os.path.expanduser(os.getenv("PLAN_SYNC_REGISTRY", str(DOCS_REPO / "Plan_Sources.json"))))
METADATA_MARKER = "---SYSTEM_METADATA---"   # the GAS engines' block; identical for both profiles
# Matching linguistics only - not a fact about the system, so it stays in code.
STOP = set("the a an of to for and or in on with into by from as is are be we our their "
           "this that it its across within per plus no not "
           "define finalize analyze redesign consolidate review update".split())


# --- Registry ---------------------------------------------------------------
def load_registry(path: Path) -> Dict[str, Any]:
    if not path.exists():
        sys.exit(f"registry not found: {path}\n"
                 "Plan_Sources.json lives in the docs repo (DOCS_REPO); pull it, or pass --registry.")
    reg = json.loads(path.read_text(encoding="utf-8"))
    for prof in reg.get("profiles", {}).values():
        for src in prof.get("sources", []):
            src["dir"] = Path(os.path.expanduser(src["path"]))
    return reg


def profile_cfg(reg: Dict[str, Any], profile: str) -> Dict[str, Any]:
    profs = reg.get("profiles", {})
    if profile not in profs:
        sys.exit(f"unknown profile {profile!r}; registry has: {', '.join(profs)}")
    return profs[profile]


# --- Task notes (same layout in both profiles) ------------------------------
def split_metadata(notes: str):
    notes = notes or ""
    if METADATA_MARKER in notes:
        head, tail = notes.split(METADATA_MARKER, 1)
        return head.rstrip(), METADATA_MARKER + tail
    return notes.rstrip(), ""


def parse_metadata(notes: str) -> Dict[str, Any]:
    _, meta = split_metadata(notes)
    if not meta:
        return {}
    try:
        return json.loads(meta[len(METADATA_MARKER):].strip() or "{}")
    except ValueError:
        return {}


def normalize_task(reg: Dict[str, Any], raw: Dict[str, Any], list_name: str) -> Optional[Dict[str, Any]]:
    """Raw Google Task -> the engine's task record, or None if excluded by the registry."""
    title = raw.get("title", "")
    prefixes = tuple(reg.get("exclusions", {}).get("title_prefixes", []))
    if prefixes and title.startswith(prefixes):
        return None  # marker task, not a unit of work
    staged_prefixes = tuple(reg.get("exclusions", {}).get("staged_done_prefixes", []))
    is_staged_done = bool(staged_prefixes and title.startswith(staged_prefixes))
    notes = raw.get("notes", "")
    meta = parse_metadata(notes)
    human, _ = split_metadata(notes)
    goal = (meta.get("goal") or "").strip()
    if not goal:
        mm = re.search(r"\[GOAL:\s*([^\]]+)\]", human)
        goal = mm.group(1).strip() if mm else ""
    due = (raw.get("due") or "")[:10]
    return {"id": raw["id"], "list": list_name, "title": title, "due": due,
            "backlog": due in set(reg.get("exclusions", {}).get("report_only_due", [])),
            "staged_done": is_staged_done,
            "goal": goal, "category": meta.get("category_path") or "",
            "milestone": meta.get("milestone") or "", "tracker_ref": meta.get("tracker_ref") or ""}



# --- Text helpers -----------------------------------------------------------
def tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 2}


def overlap(a: str, b: str) -> float:
    """max of Jaccard and containment-of-a: catches a short task title whose words are a
    subset of a longer row title (different phrasing, same work)."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return max(inter / len(ta | tb), inter / len(ta))


def make_status_normalizer(reg: Dict[str, Any], src: Dict[str, Any]) -> Callable[[str], Optional[str]]:
    table = dict(reg.get("status_map", {}))
    table.update(src.get("status_map", {}))
    def norm(cell: str) -> Optional[str]:
        return table.get(cell.strip().lower().strip("*_ "))
    return norm


# --- Source parsers (dispatch on registry `type`) ---------------------------
def parse_markdown_tracker(reg: Dict[str, Any], prof: Dict[str, Any], src: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Ledger rows `| ID | ... |` with a normalised status and a short description.
    Column order varies between trackers, so status is found by vocabulary and
    owner / where by convention rather than by fixed position."""
    path = src["dir"] / src.get("tracker_file", "MASTER_TRACKER.md")
    if not path.exists():
        return []
    norm = make_status_normalizer(reg, src)
    where_values = set(prof.get("row_conventions", {}).get("where_values", []))
    id_pat = re.compile(r"^\s*\|\s*(" + src["id_pattern"] + r")\s*\|", re.I)
    rows: List[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = id_pat.match(line)
        if not m:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        status = next((norm(c) for c in cells if norm(c)), None)
        where = next((c for c in cells if c in where_values), "")
        owner = next((c for c in cells if re.fullmatch(r"[A-Z][a-z]+(?: [A-Z][a-z]+)?", c)
                      and c not in where_values), "")
        raw = max(cells[1:], key=len, default="")
        desc = re.sub(r"\*+", "", raw)
        bold = re.search(r"\*\*(.+?)\*\*", raw)
        title = bold.group(1) if bold else re.split(r"[.—\-–:(]", desc, maxsplit=1)[0]
        rows.append({"id": m.group(1), "status": status or "?", "where": where, "owner": owner,
                     "title": title.strip()[:120], "desc": desc[:200], "source": src["key"]})
    return rows


PARSERS: Dict[str, Callable[..., List[Dict[str, Any]]]] = {
    "markdown_tracker": parse_markdown_tracker,
}


def parse_source(reg, prof, src) -> List[Dict[str, Any]]:
    parser = PARSERS.get(src.get("type", ""))
    if parser is None:
        sys.exit(f"source {src['key']}: no parser for type {src.get('type')!r} (known: {', '.join(PARSERS)})")
    return parser(reg, prof, src)


def load_links(src: Dict[str, Any]) -> Dict[str, str]:
    p = src["dir"] / src.get("links_file", "task_links.json")
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


# --- Tasks adapters (dispatch on registry `tasks_adapter`) ------------------
def tasks_the_system_ce(reg: Dict[str, Any], prof: Dict[str, Any]) -> List[Dict[str, Any]]:
    """CE profile through this repository's own Tasks client (work-account token)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from common import LIST_NAMES, list_open_tasks  # noqa: E402
    except ImportError as e:
        sys.exit(f"the_system_ce adapter needs this repository's common.py ({e}). "
                 "Run the CE profile from the work laptop (Protocol §3.3).")
    name_to_id = {v: k for k, v in LIST_NAMES.items()}
    out: List[Dict[str, Any]] = []
    for lname in prof.get("task_lists", []):
        lid = name_to_id.get(lname)
        if not lid:
            print(f"warning: task list {lname!r} not known to this engine; skipped", file=sys.stderr)
            continue
        out += [t for t in (normalize_task(reg, raw, lname) for raw in list_open_tasks(lid)) if t]
    return out


def _the_system_home() -> Optional[Path]:
    env = os.getenv("THE_SYSTEM_HOME")
    candidates = [Path(os.path.expanduser(env))] if env else []
    candidates += [HOME / "Documents" / "AGY" / "the_system",   # Mac mini (master route)
                   HOME / "AGY" / "the_system",
                   HOME / "Developer" / "the_system"]           # work laptop (read-only copy)
    return next((p for p in candidates if (p / "scripts" / "utils" / "list_tasks.py").exists()), None)


def tasks_agy_agents(reg: Dict[str, Any], prof: Dict[str, Any], profile: str) -> List[Dict[str, Any]]:
    """Private (or work) profile through the_system's task bridge, `scripts/utils/list_tasks.py
    --json --profile <private|work>`, which reads `<the_system>/auth/token_tasks[_work].json`.
    Output: {"warning": str|null, "private": {list_title: [raw tasks]}, "work": {...}}."""
    bridge_profile = {"private": "private", "ce": "work"}.get(profile, profile)
    root = _the_system_home()
    if root is None:
        sys.exit("agy_agents adapter: the_system checkout not found (looked at $THE_SYSTEM_HOME, "
                 "~/AGY/the_system, ~/Developer/the_system). This profile runs on its own machine "
                 "(Protocol §3.3).")
    token = root / "auth" / ("token_tasks.json" if bridge_profile == "private" else "token_tasks_work.json")
    if not token.exists():
        sys.exit(f"agy_agents adapter: no {bridge_profile} token at {token}. The {prof.get('label', profile)} "
                 "profile is not reachable from this machine (Protocol §3.3) - run it where its token lives.")
    py = os.getenv("PLAN_SYNC_BRIDGE_PYTHON", sys.executable)
    cmd = [py, str(root / "scripts" / "utils" / "list_tasks.py"), "--json", "--profile", bridge_profile]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=str(root))
    if res.returncode != 0:
        tail = "\n".join(res.stderr.strip().splitlines()[-3:])
        sys.exit(f"agy_agents adapter: bridge failed (exit {res.returncode}):\n{tail}")
    try:
        data = json.loads(res.stdout)
    except ValueError:
        sys.exit("agy_agents adapter: bridge returned no JSON:\n" + res.stdout[-400:])
    if data.get("warning"):
        print(f"warning (bridge): {data['warning']}", file=sys.stderr)
    by_list: Dict[str, List[Dict[str, Any]]] = data.get(bridge_profile) or {}
    out: List[Dict[str, Any]] = []
    for lname in prof.get("task_lists", []):
        if lname not in by_list:
            print(f"note: list {lname!r} returned no active tasks (empty, or not present in this account)",
                  file=sys.stderr)
            continue
        out += [t for t in (normalize_task(reg, raw, lname) for raw in by_list[lname]) if t]
    return out


TASK_ADAPTERS: Dict[str, Callable[..., List[Dict[str, Any]]]] = {
    "the_system_ce": lambda reg, prof, profile: tasks_the_system_ce(reg, prof),
    "agy_agents": tasks_agy_agents,
    "the_system": tasks_agy_agents,
    "the_system_bridge": tasks_agy_agents,
}


def load_tasks(reg, prof, profile: str) -> List[Dict[str, Any]]:
    adapter = TASK_ADAPTERS.get(prof.get("tasks_adapter", ""))
    if adapter is None:
        sys.exit(f"no tasks adapter {prof.get('tasks_adapter')!r} in this engine (known: {', '.join(TASK_ADAPTERS)}).")
    return adapter(reg, prof, profile)


# --- Routing ----------------------------------------------------------------
def _match_category_code(code: str, category_path: str) -> bool:
    if not code or not category_path:
        return False
    c = code.strip().lower()
    cat = category_path.strip().lower()
    if cat.startswith(c):
        return True
    segments = [s.strip() for s in re.split(r"[/>]", cat) if s.strip()]
    for seg in segments:
        if seg == c or seg.startswith(c):
            return True
    return False


def route(reg: Dict[str, Any], sources: List[Dict[str, Any]], task: Dict[str, Any]) -> Optional[str]:
    """Registry precedence: an 'override' anchor routes outright; the rest are summed weights."""
    r = reg.get("routing", {})
    weights = r.get("weights", {})
    fields = {"title_kw": task["title"].lower(), "category_kw": task["category"].lower(),
              "milestone_kw": task["milestone"].lower()}
    best, best_score = None, 0
    for src in sources:
        anchors = src.get("routing", {})
        score = 0
        for key in r.get("precedence", []):
            w = weights.get(key)
            if key == "goals":
                hit = task["goal"] in anchors.get("goals", [])
            elif key == "category_codes":
                codes = anchors.get("category_codes", [])
                hit = any(_match_category_code(c, task.get("category", "")) for c in codes)
            else:
                hit = any(k in fields.get(key, "") for k in anchors.get(key, []))
            if not hit:
                continue
            if w == "override":
                return src["key"]
            score += int(w or 0)
        if score > best_score:
            best, best_score = src["key"], score
    return best


# --- Reconcile --------------------------------------------------------------
def reconcile(reg: Dict[str, Any], profile: str) -> Dict[str, Any]:
    prof = profile_cfg(reg, profile)
    sources = prof.get("sources", [])
    threshold = float(reg.get("routing", {}).get("match_threshold", 0.5))
    act = prof.get("row_conventions", {}).get("actionable_row", {})
    tasks = load_tasks(reg, prof, profile)
    srcs = {s["key"]: {"cfg": s, "rows": parse_source(reg, prof, s), "links": load_links(s)} for s in sources}
    for t in tasks:
        t["routed"] = route(reg, sources, t)

    buckets: Dict[str, List[Dict[str, Any]]] = {
        "close_candidate": [], "blocked_needs_redate": [], "add_row_candidate": [],
        "unrouted": [], "create_task_candidate": [], "dangling_link": [],
    }
    linked = set()
    staged_prefixes = tuple(reg.get("exclusions", {}).get("staged_done_prefixes", []))
    staged_done_count = 0
    staged_linked = 0
    staged_unlinked = 0

    for t in tasks:
        if t.get("staged_done"):
            staged_done_count += 1
            key = t["routed"]
            if not key:
                staged_unlinked += 1
                continue
            rows, links = srcs[key]["rows"], srcs[key]["links"]
            row = None
            ref = t["tracker_ref"] or links.get(t["id"])
            if ref:
                rid = ref.split(":")[-1]
                row = next((r for r in rows if r["id"] == rid), None)
                if row is None:
                    t["bad_ref"] = ref
                    buckets["dangling_link"].append(t)
                    staged_unlinked += 1
                    continue
            if not row:
                clean_title = t["title"]
                for pfx in staged_prefixes:
                    if clean_title.startswith(pfx):
                        clean_title = clean_title[len(pfx):].strip()
                        break
                scored = sorted(((max(overlap(clean_title, r["title"]), overlap(clean_title, r["desc"])), r)
                                 for r in rows), key=lambda x: x[0], reverse=True)
                if scored and scored[0][0] >= threshold:
                    row = scored[0][1]
            if row:
                linked.add((key, row["id"]))
                staged_linked += 1
            else:
                staged_unlinked += 1
            continue

        key = t["routed"]
        if not key:
            buckets["unrouted"].append(t)
            continue
        rows, links = srcs[key]["rows"], srcs[key]["links"]
        row = None
        # 1) explicit link. A ref that resolves to no row is a defect (row split, renumbered
        #    or mistyped) - flagged loudly, never quietly replaced by a fuzzy match (Protocol §6).
        ref = t["tracker_ref"] or links.get(t["id"])
        if ref:
            rid = ref.split(":")[-1]
            row = next((r for r in rows if r["id"] == rid), None)
            if row is None:
                t["bad_ref"] = ref
                buckets["dangling_link"].append(t)
                continue
        # 2) conservative fuzzy suggestion, only when there was no explicit link (Protocol §5)
        if not row:
            scored = sorted(((max(overlap(t["title"], r["title"]), overlap(t["title"], r["desc"])), r)
                             for r in rows), key=lambda x: x[0], reverse=True)
            if scored and scored[0][0] >= threshold:
                row = scored[0][1]
                t["match_score"], t["match_inferred"] = round(scored[0][0], 2), True
        if not row:
            buckets["add_row_candidate"].append(t)
            continue
        linked.add((key, row["id"]))
        t["matched_row"] = row
        if row["status"] == "DONE":
            buckets["close_candidate"].append(t)
        elif row["status"] == "BLOCKED":
            buckets["blocked_needs_redate"].append(t)

    # plan rows that are the owner's work with no task (registry actionable_row)
    for key, s in srcs.items():
        for r in s["rows"]:
            if r["status"] not in set(act.get("statuses", [])):
                continue
            owner_hit = any(o in r["owner"].lower() for o in act.get("owner_contains", []))
            where_hit = r["where"] in set(act.get("where_in", []))
            if (owner_hit or where_hit) and (key, r["id"]) not in linked:
                buckets["create_task_candidate"].append(r)

    return {"profile": profile, "label": prof.get("label", profile), "tasks": tasks,
            "sources": srcs, "buckets": buckets, "threshold": threshold,
            "task_lists": prof.get("task_lists", []),
            "staged_done_count": staged_done_count,
            "staged_linked": staged_linked,
            "staged_unlinked": staged_unlinked}


# --- Rendering --------------------------------------------------------------
def render_md(res: Dict[str, Any]) -> str:
    b = res["buckets"]
    L: List[str] = [f"# Plan Sources ↔ Google Tasks reconciliation — {res['label']} (read-only)\n"]
    staged_part = f" ({res.get('staged_done_count', 0)} staged-done: {res.get('staged_linked', 0)} linked, {res.get('staged_unlinked', 0)} unlinked)"
    L.append(f"Open tasks scanned: **{len(res['tasks'])}** across {' + '.join(res['task_lists'])}{staged_part}. Sources: "
             + (", ".join(f"{s['cfg']['name']} ({len(s['rows'])} rows)" for s in res["sources"].values()) or "none registered")
             + ".\n")
    L += ["| Bucket | Count | Meaning |", "|---|---|---|",
          f"| Close candidates | {len(b['close_candidate'])} | task open, plan row DONE |",
          f"| Blocked → re-date | {len(b['blocked_needs_redate'])} | task open, plan row BLOCKED |",
          f"| Add-a-row candidates | {len(b['add_row_candidate'])} | task routed, no matching row |",
          f"| Create-a-task candidates | {len(b['create_task_candidate'])} | actionable row, no task |",
          f"| Unrouted | {len(b['unrouted'])} | task matches no source |",
          f"| ⚠️ Dangling links | {len(b['dangling_link'])} | explicit link to a row id that no longer exists |", ""]

    def task_line(t):
        ref = t.get("matched_row", {}).get("id", "")
        inf = f" ~inferred {t.get('match_score')}" if t.get("match_inferred") else ""
        bl = " Ⓑbacklog" if t.get("backlog") else ""
        return (f"- **{t['title']}** · {t['list']} · due {t['due'] or '-'}{bl} · "
                f"goal {t['goal'] or '-'} → `{t['routed']}:{ref}`{inf}")

    sections = [
        ("dangling_link", "## ⚠️ Dangling links (broken reference — fix before executing)",
         lambda t: f"- **{t['title']}** · {t['list']} · linked to `{t['routed']}:{t['bad_ref'].split(':')[-1]}` "
                   f"which is not a current row — re-point or drop the link"),
        ("close_candidate", "## ✅ Close candidates (propose `stage_done`)", task_line),
        ("blocked_needs_redate", "## ⛔ Blocked → annotate + re-date", task_line),
        ("add_row_candidate", "## ➕ Tasks with no plan row (propose add-a-row / leave Tasks-only)", task_line),
        ("create_task_candidate", "## \U0001f4cb Actionable plan rows with no task (propose create-task)",
         lambda r: f"- `{r['source']}:{r['id']}` [{r['status']}] {r['owner'] or 'owner?'} · {r['where'] or 'where?'} · {r['desc'][:120]}"),
        ("unrouted", "## ❓ Unrouted tasks (no source matched)",
         lambda t: f"- {t['title']} · goal {t['goal'] or '-'} · {t['category'] or '-'}"),
    ]
    for key, header, fmt in sections:
        if b[key]:
            L += [header + "\n"] + [fmt(x) for x in b[key]] + [""]
    L.append(f"\n_Read-only. Nothing was modified. Fuzzy matches below {res['threshold']} are reported as "
             "add-a-row, never paired; inferred matches are marked and are never acted on without confirmation "
             "(TS - Plan Sync Protocol §3.1)._")
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", default=os.getenv("PLAN_SYNC_PROFILE", "ce"))
    ap.add_argument("--registry", default=str(REGISTRY_DEFAULT))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()
    reg = load_registry(Path(os.path.expanduser(a.registry)))
    res = reconcile(reg, a.profile)
    if a.json:
        out = json.dumps({"profile": res["profile"], "buckets": {
            k: [{kk: vv for kk, vv in item.items() if kk != "matched_row"} for item in lst]
            for k, lst in res["buckets"].items()}}, ensure_ascii=False, indent=2)
    else:
        out = render_md(res)
    if a.out:
        Path(a.out).write_text(out, encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
