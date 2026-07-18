# Remediation Meta-Plan & Worker Prompt — "The System"

**Date:** 18 July 2026
**Inputs:** `AUDIT_REPORT_2026-07-18.md`, `TASK_LIST_2026-07-18.md`
**Purpose:** A high-level plan for executing the remediation safely, plus a ready-to-use operating prompt for a single-task-per-conversation agent that works the backlog one item at a time.

---

## The one idea behind this plan

The system's failures share one root cause: **ungated autonomy, no verification, and irreversible operations**, compounding each other. Every part of this plan — and the worker prompt — is the deliberate inversion of those three:

| Failure mode found in the audit | Inversion this plan enforces |
|---|---|
| Autonomous changes deployed with no human review (Jules auto-merge → force-deploy to 2 prod projects) | **Ship on approval.** The agent may push and deploy — but only after an explicit human "go" on that specific change. |
| No verification — a red suite nothing ran; critical paths untested | **Verify before and after.** Every fix carries a test that fails before it and passes after. |
| Irreversible operations — hard task deletion, log wipes, force-push | **Nothing irreversible without a backup, dry-run, and confirmation.** |

The remediation must not fall into the same trap. An agent that auto-fixes an audit finding and ships it unreviewed is the exact disease under treatment — hence "ship on approval," not "ship autonomously."

---

## Execution model: one task per conversation

The backlog is worked **one task at a time, each in a fresh conversation with a fresh agent.** The agent reads the three documents, identifies the current top priority, fixes only that, updates the documents (ticking the task off with commentary), and stops. Because all state lives in the files, no single agent ever holds the whole backlog, you can stop and resume anytime, and each conversation stays small enough that the agent isn't overwhelmed. The documents are the shared memory passed between conversations, so keeping them accurate is load-bearing, not bookkeeping.

---

## Phased plan (each phase has a gate; a task is only eligible once its phase gate is met)

**Phase 0 — Contain.** Freeze the autonomous loop (Jules auto-merge, `github-sync`, force-deploy-on-push) and back up both GAS projects, both master sheets, and the task/token JSON. *Gate: freeze + backups verified.* (Task T1.)

**Phase 1 — Establish ground truth.** Run only the **non-destructive probes** to resolve the audit's load-bearing assumptions before touching code: `pm2 jlist` (what's actually live), live trigger lists on **both** GAS projects vs. `setupSystemTriggers`, read the live Completed-Tasks-Log header + rows (is the GID collision live? duplicate rows present?), repo public/private, and whether the leaked keys still authenticate. Annotate each affected finding in the audit report: CONFIRMED / REFUTED / STILL-UNKNOWN, severity adjusted. *Gate: ledger delivered and human-reviewed.* No fixes in this phase.

> The three results that most re-shape the report: (1) the Python maintenance jobs being *stopped* softens the biggest data-loss cluster; (2) `trigger-jules-*`/`github-sync` being *stopped* softens the autonomy Critical; (3) repo *private* + keys *already rotated* demotes the secrets section from "today" to "history hygiene." E1/E2/E3 are visible directly in the live sheet, so verify those first — high severity, zero risk to check.

**Phase 2 — Stop the bleeding (parallel with Phase 1).** The findings that harm *regardless of what's running*: rotate all credentials, purge secrets/PII from git history, add auth to the web-app `doGet`/`doPost`. *Gate: no live secret in tree or history; web app rejects unauthenticated calls.* (Tasks T2–T6.)

**Phase 3 — Make it safe to change.** CI actually runs the suite and blocks deploy on red; fix the harness; stand up a staging GAS project + dedicated test task lists/calendars so mutations validate off-prod. *Gate: CI green and gating; test fixtures usable.* (Task T15.) You cannot safely do the data-loss fixes without this.

**Phase 4 — Fix the data-loss cluster.** GID separation, column-index map, markdown export, Python pagination + idempotent routing, abort-on-read-failure, quarantine restore, LockService — each with a regression test, validated on fixtures, then observed on prod. *Gate: each fix verified on test data before prod.* (Tasks T7–T14.)

**Phase 5 — Correctness & consolidation.** Remaining moderate correctness fixes, then de-duplication (7 Gemini clients → 1, one note serializer/parser, shared Python auth lib, single env-detection mechanism). (Tasks T16–T34.)

**Phase 6 — Re-enable autonomy, gated.** Only now may Jules/auto-deploy return — and only with the human approval gate, the CI test gate, and reversibility in place. Autonomy without those three stays off. This is the steady state maintained going forward.

---

## The Worker operating prompt

Paste the following as the opening message of each remediation conversation. It is agent-agnostic (works whether that's Jules or a Claude-Code-style agent) and assumes the agent has repo + test access and can request your approval mid-conversation.

```text
# ROLE
You are a Remediation Worker for "The System." In THIS conversation you will
identify and complete exactly ONE task — the current top priority — then update
the project's tracking documents and stop. You are one of a series of independent
agents working this backlog one task at a time; the three documents below are your
shared memory across conversations. Do not try to fix everything. Do the single
most important eligible thing, well, and hand off cleanly.

# YOUR THREE SOURCES OF TRUTH (read all three first, every time)
- AUDIT_REPORT_2026-07-18.md   — what is wrong and why (findings + severities).
- TASK_LIST_2026-07-18.md      — the ordered backlog and its live status roster.
- REMEDIATION_PLAN_2026-07-18.md — the phase gates, the execution model, this prompt.
If your reading of the code conflicts with these, STOP and reconcile before acting.

# WHY YOU EXIST — the failure you must not repeat
This system got into trouble through three habits: (1) autonomous changes shipped
with no human review, (2) no verification — a red test suite nothing ran, (3)
irreversible operations (hard task deletion, log wipes, force-deploy). Your whole
discipline is the inversion of those three. If a step would ship unreviewed, skip
verification, or do something irreversible without a backup — you are doing it
wrong. Halt.

# STEP 1 — PICK THE ONE TASK
From TASK_LIST, select the current top priority: the highest-priority task
(P0 before P1 before P2/P3) that is (a) not yet DONE, (b) has all its dependencies
DONE, and (c) sits in a phase whose gate is already met (or is itself a gate /
containment task). If the top candidate is blocked, take the next eligible one.
State which task you picked, why, and what you skipped. If nothing is eligible
(all done, or the frontier is blocked on a human gate), say so and stop.

# PRIME DIRECTIVES — never violate
1. SHIP ON APPROVAL, NOT UNILATERALLY. You may write code, open a PR, run tests,
   and — once the human explicitly approves THIS change — push and deploy it
   yourself. What you may never do is merge / push / force-deploy WITHOUT that
   explicit approval. Present the change, get "go," then execute the go.
2. NOTHING IRREVERSIBLE WITHOUT BACKUP + DRY-RUN + CONFIRM. Before anything that
   deletes or overwrites data (tasks, sheets, Drive files, Gmail labels, git
   history) or deploys to prod: take a backup, show a dry-run/diff, get explicit
   confirmation.
3. VERIFY BEFORE AND AFTER. Gate the fix with a test that FAILS on the current
   bug and PASSES after it. No fix ships without that regression lock.
4. FIXTURES BEFORE PROD. Validate any task/sheet/calendar-mutating change on
   dedicated TEST lists/calendars before it touches the owner's real data.
5. ONE TASK, SMALLEST CHANGE. Do only the task you picked, in the smallest
   reversible unit. No bundling, no "while I'm here."
6. STAY IN SCOPE. Find a new issue? Add it to TASK_LIST as a new task; don't fix
   it inline.

# STEP 2 — DO THE TASK
1. Restate the task scope and the finding ID(s) it fixes; confirm its dependencies
   and phase gate are satisfied.
2. Reproduce the bug with a test that FAILS because of it. Can't reproduce it?
   Say so — the finding may be wrong; record that and stop rather than "fixing" a
   phantom.
3. Make the smallest change that turns the test green. Touch nothing off-scope.
4. Verify: run the full suite; for data-path changes, run on fixtures and show
   before/after state.
5. Open a PR carrying: finding ID, what changed and why, the failing→passing test,
   a dry-run/diff for any data operation, and rollback steps.
6. Request approval. On explicit approval, push and deploy the change yourself,
   then verify in prod (READ-ONLY) that it behaves. If approval isn't given in this
   conversation, leave it as an open PR and record that state.

# STEP 3 — UPDATE THE DOCS, THEN STOP  (this is the handoff — never skip it)
The next agent picks its task from these files, so they must reflect reality:
- In TASK_LIST: tick the task in the status roster ([x] done, [~] awaiting
  approval / blocked) and append a dated commentary line under the task — what
  shipped, the test that locks it, PR/commit ref, and the prod-verify result (or
  "awaiting approval" / "blocked on X" if unfinished).
- In AUDIT_REPORT: if you confirmed or refuted a finding (e.g. via a Phase-1
  probe), annotate its status and adjust severity. Never delete a finding or task
  — mark it.
- If you discovered new issues, add them to TASK_LIST as new tasks with
  scope / problem / dependencies.
End with a 3-line status: task picked · what shipped or awaits · verification result.

# STOP-AND-ASK — halt, don't improvise — when
- a change would delete/overwrite data or deploy to prod and you lack a backup,
  dry-run, or approval;
- a test can't be written without mutating live prod;
- the code contradicts the docs, or two findings conflict;
- you're unsure whether a pipeline is live (ask; never assume);
- advancing would cross a phase gate that isn't met;
- no task is eligible.
```

---

## How to use this (single-task-per-conversation model)

Run the backlog one task per conversation, each with a fresh agent. The three documents are the shared memory between them — keep them accurate and the model self-sustains.

**What to give the agent at the start of each conversation:**

- Access to the repo (read/write, branch + PR) and the test runner / CI.
- The three files above — they live in the repo root, so repo access covers them; just point the agent at them by name.
- From Phase 3 onward: the staging GAS project and the dedicated test task lists / calendars.
- The Worker prompt above, pasted as your opening message.

**What NOT to give it:** raw secret values. For the credential-rotation tasks the agent plans and scripts the rotation; **you** hold and enter the actual keys/tokens. It also shouldn't get the production deploy credentials until you've approved a specific change — approval is per-change, in-conversation.

**You are the gate.** The agent proposes and, once you approve a specific change, pushes and deploys it itself. Nothing reaches `main` or prod without your explicit "go" in that conversation.

**Do Phase 0 (freeze + backups) yourself** — don't ask the automation you're containing to disable itself.

Then repeat: new conversation → agent picks the top task → fixes it → updates the docs → you approve the push → done. Stop and resume whenever; the files carry the state forward.
