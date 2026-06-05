# E2E Test Infra: Google Tasks Markdown Table Generation

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Compare ground-truth data from the live API with the generated output artifact.
- Execution: Python test script (`tests/verify_task_table.py`) hits Google Tasks API using the provided token file and asserts that the number of active tasks exactly matches the number of table rows in the generated artifact.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Table Markdown Generation | ORIGINAL_REQUEST | 1      | 1      | ✓      |
| 2 | Active Task Enumeration | ORIGINAL_REQUEST | 1      | 1      | ✓      |
| 3 | E2E Task Count Integrity | ORIGINAL_REQUEST | 1      | 1      | ✓      |

## Test Architecture
- Test runner: `python tests/verify_task_table.py`
- Test case format: Script connects to Google Tasks API, calculates active task count, parses `/Users/daniel/Documents/agy_quantum21/artifacts/task_review_table.md`, and asserts counts are equal.
- Pass/Fail semantics: Exit code 0 if counts match; non-zero exit code if counts differ or files are missing.
- Directory layout:
  - `tests/verify_task_table.py`: The validation script
  - `token_tasks_work.json`: API credentials
  - `/Users/daniel/Documents/agy_quantum21/artifacts/task_review_table.md`: The output file to test

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full end-to-end sync and verify | F1, F2, F3 | Medium |

## Coverage Thresholds
- Tier 1: ≥1 per feature (due to single macro-scenario)
- Tier 2: ≥1 per feature 
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥1 realistic application scenario
