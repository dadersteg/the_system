# Project: Automated AI Model Remediation & Leaderboard Sync

## Architecture
- `build_leaderboard.py`: Script that parses models' Concept/BLUF sections and builds `Model_Leaderboard.md`.
- `06_Automated_Models`: Main directory containing 171 model markdown files distributed across subdirectories:
  - `Graduated_Strategies`
  - `Ready_For_Backtesting`
  - `Active_Strategies`
  - `Ideation_Crucible`
  - `Archived_Strategies`
- Model Generation Prompt templates (e.g. `quant_prime_prompt.md`, `quant_validator_prompt.md`).
- Rules for cleanup & style: `penny.md` and `playmetech_coo.md`.

## Code Layout
- `the_system/build_leaderboard.py`: Main leaderboard builder script.
- `agy_quantum21/05_project_pmt/project_ai_betting_framework/06_Automated_Models/`: Directory containing automated models and outputs.
- `.agents/rules/penny.md`: Formatting standards.
- `.agents/rules/playmetech_coo.md`: Technical and tone standards.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Investigation & Design | Find templates, analyze models, and design parser and script logic | none | DONE |
| 2 | Parser Update & Programmatic Remediation | Implement build_leaderboard.py update and batch cleanup script | M1 | DONE |
| 3 | LLM Fallback Rewrite | Use LLM to rewrite any BLUFs failing programmatic parsing | M2 | DONE |
| 4 | Prompt Template Hardening | Update prompt template files to enforce formatting rules | M3 | DONE |
| 5 | Verification & Final Review | Run checks, confirm count of 171, audit formatting, verify clean execution | M4 | DONE |

## Interface Contracts
### build_leaderboard.py ↔ Model Markdown Files (Concept:)
- **Strategy Column:** A single, clean paragraph without bullet points or numbered lists.
- **Efficiency Column:** A numbered list using `(1)`, `(2)`, `(3)`.
- **Key Takeaway Column:** Clean takeaway text.
- **Fallback:** Fail-safe parsing to avoid placing malformed metadata or "active" strings in Strategy.
