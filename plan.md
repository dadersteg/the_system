1. **Target File:** `src/Code_ListLabels.js`
2. **JSDoc Updates:** Inject comprehensive JSDoc/Google-style docstrings into all functions (e.g., `updateLabelList`, `alignLabelsWithTaxonomy`, `migrateDuplicateGmailLabels`, `recoverLostLabelsFromLog`, `cleanExecutionLogLabels`). The file header will be updated to strictly adhere to the `jules.md` format (including `@file`, `@description`, `@version`, `@last_modified`, `@modified_by`, and `@changelog`).
3. **Variable Standardization:** Standardize JS variable casing to `camelCase` (e.g., `target_gid` -> `targetGid`, `valid_labels` -> `validLabels`).
4. **Cleanup:** Remove orphaned or legacy code, such as the `recoverLostLabelsFromLog` and `cleanExecutionLogLabels` emergency scripts, which appear to be one-off fixes for a past migration bug.
5. **Verification:** Run `node -c src/Code_ListLabels.js` to verify syntax.
6. **Pre-commit:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
7. **Submit:** Submit the changes via a Pull Request.
