# System Triggers & CRON Schedule

This document outlines the automated trigger schedule for the Life Organisation System (LOS). Because Google Apps Script has a strict 6-minute execution limit per function and shared rate limits for the Gemini API, functions are decoupled and spaced out to prevent collision and lag.

## Active Automated Pipelines

### 1. The Ingestion Layer (The Clerk)
*   **Email Triage (Ongoing) (`runTheClerkEmailOngoing`)**
    *   **Schedule:** Every 10 Minutes
    *   **Purpose:** Ingests new emails from the Inbox, queries Gemini, assigns labels, and writes to the Execution Log.
    *   **Collision Risk:** High (Hits Gmail API and Gemini API). It has built-in batching and a `PROCESS_LIMIT` to prevent timeouts.

*   **Drive Triage (Ongoing) (`runTheClerkDriveOngoing`)**
    *   **Schedule:** Every 1 Minute
    *   **Purpose:** Ingests loose files from the root of Google Drive, queries Gemini, moves them to the L4 Context folder, and writes to the Execution Log.
    *   **Collision Risk:** Low. The maximum batch size is very small (1-5 files) to ensure fast, real-time sorting.

*   **Drive Triage (Retro) (`runTheClerkDriveRetro`)**
    *   **Schedule:** Every 2 Hours
    *   **Purpose:** Slowly works through the historical Drive backlog, processing files in older Archive/Retro folders and moving them to the 'Retro Review' folder or routing them correctly.
    *   **Collision Risk:** Low (spaced out to avoid Gemini API limits).

### 2. The Execution Layer (Task Master)
*   **Task Execution Pipeline (`runTaskExecutionPipeline`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Reads the Execution Log for newly extracted `actionItems`, harmonizes/deduplicates them, and pushes them to Google Tasks with encoded metadata.
    *   **Collision Risk:** Low. Only reads from the spreadsheet and writes to the Google Tasks API.

*   **Task Metadata Export (`extractTasksWithConversationDetails`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Reads Google Tasks, extracts metadata/AI summaries for new tasks, and exports them to the Master Spreadsheet for manual review.
    *   **Collision Risk:** Low. Uses delta-syncing (`existingTaskMap`) to only query Gemini for newly created tasks.

*   **Task Revisions Sync (`syncRevisionsToTasks`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Pushes manual "Revised" edits made in the Master Spreadsheet back to Google Tasks.
    *   **Collision Risk:** Low. Staggered alongside other 15-minute cron jobs.

*   **Task Master Engine (`runTaskMasterEngine`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Reads the current Tasks backlog, evaluates 30-day Calendar capacity, cross-references Personal & Work goals, updates stale task deadlines, quarantines junk to the 'Trash' list, and regenerates the Markdown Priority One-Pager in the workspace.
    *   **Collision Risk:** Low. Runs on an isolated hourly cadence.

### 3. The Maintenance Layer (System Architect)
*   **Manual Revisions Sync (`applyManualRevisionsEmail` & `applyManualRevisionsDrive`)**
    *   **Schedule:** Every 1 Hour (Staggered or sequential based on triggers)
    *   **Purpose:** Sweeps the Execution Log for any manual changes you made to "Revised Name" or "Revised Path" and executes those changes retroactively on the Email labels and Drive files.

---

## Manual Scripts (Run On-Demand)
These scripts are computationally heavy and should only be run manually by the System Architect.
*   **`syncTaxonomyToSheet()`:** Run whenever you update `TS - Categorisation.md`. Rebuilds the core JSON brain.
*   **`syncDriveFoldersFromTaxonomy()`:** Run after updating the taxonomy to ensure Drive folders exist.
*   **`runTheClerkRetro()` / `runTheClerkArchive()`:** Slow-burn historical backfills.
*   **`cleanLabelsFromSheetUrls()`:** Emergency utility to reset a batch of emails.

---

## Future Pipelines (Pending Build)
*   *(D.9)* **Hard Delete Sweeper:** Every Sunday at 02:00 (Empties the '99 To be deleted' label).
*   *(D.11)* **Unsubscribe Pipeline:** Every Day at 03:00 (Executes HTTP unsubs).
