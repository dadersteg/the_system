# Project: Duplicate Private Gmail Labels Fix & Cleanup

## Architecture
- `docs/TS - Categorisation (Private).md`: Input file containing taxonomy rules/categories.
- `src/Code_WorkspaceTaxonomy.js` (or similar): Script that parses the taxonomy rules and calls Gmail APIs to sync labels.
- `npx clasp push`: Apps Script sync command.
- Cleanup script (e.g. `src/Code_CleanupDuplicateLabels.js` or inline script): Script to clean up duplicated Gmail labels.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Root Cause Analysis | Find duplicate label causes in taxonomy parsing logic | none | DONE |
| 2 | Code Fix & Cleanup Prep | Implement parsing logic fix and cleanup script | M1 | DONE |
| 3 | Deployment & Execution | Clasp push and execution of cleanup script | M2 | DONE |
| 4 | Independent Verification | Review of code fix and cleanup logs by subagents | M3 | DONE |

## Interface Contracts
### Code_WorkspaceTaxonomy ↔ docs/TS - Categorisation (Private).md
- Input: markdown file.
- Action: parse headers, bullets, or labels.
- Output: sync labels via Gmail API.
