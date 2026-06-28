# Project: Google Tasks Multi-Persona Analysis

> **Architectural Note:** For global topological layout, identity boundaries, and folder routing rules, refer to the [TS - System Architecture Map.md](../../../../the_system/docs/TS%20-%20System%20Architecture%20Map.md) (or equivalent path in `docs/`).


## Architecture
- **Extractor/Analyzer**: Python script `scripts/analyze_tasks.py` to extract Google Tasks via API using `token_tasks_work.json`. It will use Gemini (or just prompt templates if manual is needed, but given the scale, likely Gemini API via a python script) to evaluate tasks based on `james.md`, `playmetech_coo.md`, and `task_master.md` personas.
- **Output**: Generates a comprehensive markdown table at `/Users/daniel/Documents/agy_pmt/artifacts/task_review_table.md`.
- **E2E Testing**: Python script `tests/verify_task_table.py` to check that the row count in the output markdown matches the extracted task count.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Implementation Track | Write Python script to extract tasks, run evaluations using the 3 personas, and write out the markdown table. | none | PLANNED |
| 2 | E2E Testing Track | Write Python test script to extract tasks and count them, then parse the markdown table to count rows, asserting they match. | none | PLANNED |
| 3 | Final Milestone | Pass 100% of the E2E test suite (verify_task_table.py passes) and adversarial testing. | 1, 2 | PLANNED |

## Interface Contracts
### API ↔ Script
- Uses `token_tasks_work.json` for authentication.
### Output format
- Markdown table with "Original" and "Proposed" states (grouping, due date, priority, backlog status, deletion).

## Code Layout
- `scripts/analyze_tasks.py`: Main implementation.
- `tests/verify_task_table.py`: Verification script.
- `/Users/daniel/Documents/agy_pmt/artifacts/task_review_table.md`: Output file.
