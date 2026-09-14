# Preserve unknown `---SYSTEM_METADATA---` keys (Plan Sync `tracker_ref`)

**For:** the engine owner (Verne / Mac mini route). **Raised:** 2026-09-14, from a CE `task_verify` run.
**Status:** diagnosis + contract. No engine code changed in this PR — the fix belongs where the full
grooming/normalisation cadence is owned and deployed (Mac mini).

## Symptom (verified)
Plan Sync writes a link two ways (TS - Plan Sync Protocol §6): `task_links.json` in the source repo
(authoritative) and a best-effort `tracker_ref: "SOURCE:ROW-ID"` mirror inside a task's
`---SYSTEM_METADATA---` block. On 2026-09-14, **71/71 `tracker_ref` values written to live CE tasks
were gone within ~15 minutes** (the next engine sweep). The committed `task_links.json` caches were
untouched, so the reconciler kept resolving links and the sync never broke — but the in-task mirror
is being erased, which defeats cross-device dual state. Protocol v1.2 has demoted `tracker_ref` to
best-effort as a result; this PR is about restoring it.

## What was ruled out (both repos read)
- **Routers preserve the block.** `03_TaskEngine.js` builds `existingMetadata = parsedNoteData.metadata`
  (a full `JSON.parse` via `parseTaskNotes` in `01_SystemCore.js`), mutates known fields, and
  re-`JSON.stringify`s the whole object — unknown keys survive. The laptop `task_master_sweep.py`
  route path does the same (`meta = parse_metadata(...); meta.update(...)` → `compose_engine_notes`
  dumps the whole dict).
- **The hash does not see the block.** `getStandardizedTaskHash` / the laptop `task_hash` both strip
  everything below `---SYSTEM_METADATA---` (and SYS/tag lines) before hashing, so writing `tracker_ref`
  does not change the hash and should not, by itself, trigger a re-route.
- **ToDo tasks are read for context only** by the router, not rewritten.

## Therefore
The stripper is a **normalisation / grooming path**, not the router — a place that rebuilds the
metadata block from a fixed field set (or from LLM output that regenerates the block) rather than
round-tripping the parsed object. Candidates to check: the full-ecosystem grooming/audit apply path
in `03_TaskEngine.js` (the LLM is *instructed* to preserve the block but may not, and/or the apply
step reconstructs it), `scripts/utils/align_all_tasks_metadata.py`, and any sheet-sync/maintenance
step that rewrites notes. The observed task also gained `engine` and `routed_at` and had its duration
re-derived, which points at a routing/normalisation writeback re-running on the freshly created tasks.

## The contract to enforce (wherever the block is rewritten)
1. Parse the existing `---SYSTEM_METADATA---` JSON, and **carry forward every key the writer does not
   itself manage** (allowlist-out, not allowlist-in). At minimum preserve `tracker_ref`.
2. Applies to every path that writes a task's notes: router, grooming/audit apply, align/normalise,
   and any LLM path (do not let the model regenerate the block — merge onto the parsed original).
3. Add a regression test (mirror `tests/run_tests.js`): route/grow a task whose block carries
   `{"tracker_ref":"OKR:T-142", ...}` and assert `tracker_ref` is intact in the output notes.

## Not urgent, but load-bearing for dual state
Sync works today on `task_links.json` alone (Protocol v1.2). This fix restores `tracker_ref` as a
durable cross-device mirror so a task can name its row on any surface (mobile, other machine) without
the repo cache. Once deployed, re-mirroring the 71 links is a one-shot `link` batch on CE and the
equivalent on Private.
