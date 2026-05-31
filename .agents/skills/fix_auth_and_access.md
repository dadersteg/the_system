---
name: fix_auth_and_access
description: Runs diagnostics to check and re-authorize OAuth scopes and verify read/write access to Google Drive folders, Sheets, Docs, and Tasks.
---

# Skill Description
Use this skill when you encounter `GoogleJsonResponseException` (e.g., 403 Forbidden, 401 Unauthorized, 404 Not Found), permission errors, or invalid resource ID errors during execution of Google Apps Script code or Google API integrations. Running this diagnostics function checks all active OAuth scopes, verifies the access tokens, and tests the exact resource IDs configured in `SYSTEM_CONFIG`.

# Instructions
1. Run the following command in the terminal inside `the_system` workspace directory to execute the diagnostic script via clasp:
```bash
npx clasp run checkEverything
```
2. Inspect the terminal output. It will print a report showing whether the OAuth token is valid, list the active authorized scopes, and show `✅ SUCCESS` or `❌ FAILED` for each Sheet, Folder, Document, and Task list configured in `SYSTEM_CONFIG`.
3. **If a scope is missing or unauthorized:**
   - Ask the user to run `checkEverything` or `triggerAuthPrompt` in their Google Apps Script Editor. Running it in the editor will prompt the user with the Google authorization dialog to grant any missing permissions.
4. **If a resource is marked `FAILED` (e.g., folder or sheet is inaccessible):**
   - Check if the ID in `Code_Config.js` is correct.
   - Verify that the executing Google account has the appropriate read/write share permissions for the target Google Sheet or Drive folder.
