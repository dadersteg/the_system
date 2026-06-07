# System Triggers & CRON Schedule

This document outlines the automated trigger schedule for the Life Organisation System (LOS). Because Google Apps Script has a strict 6-minute execution limit per function and shared rate limits for the Gemini API, functions are decoupled and spaced out to prevent collision and lag.

## Active Automated Pipelines (Ministry of Workflows)

### 1. The Ingestion Layer (The Clerk)
*   **Email Triage (Ongoing) (`runTheClerkEmailOngoing`)**
    *   **Schedule:** Every 10 Minutes
    *   **Purpose:** Ingests new emails from the Inbox, queries Gemini, assigns labels, and writes to the Execution Log.

*   **Drive Triage (Ongoing) (`runTheClerkDriveOngoing`)**
    *   **Schedule:** Every 1 Minute
    *   **Purpose:** Ingests loose files from the root of Google Drive, queries Gemini, moves them to the L4 Context folder, and writes to the Execution Log.

*   *(PAUSED)* **Drive Triage (Retro) (`runTheClerkDriveRetro`)**
    *   *Currently paused pending review of batch scripts.*

### 2. The Execution Layer (Task Master)
*   **Task Execution Pipeline (`runTaskExecutionPipeline`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Reads the Execution Log for newly extracted action items and pushes them to Google Tasks.

*   **Task Metadata Export (`extractTasksWithConversationDetails`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Reads Google Tasks, extracts metadata/AI summaries, and exports them to the Master Spreadsheet.

*   **Task Master Engine (Micro-Batch Polisher) (`runTaskMasterEngine`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Uses Delta-Sync to detect new/modified tasks. Routes them via Gemini for immediate categorization and deadline assignment.

### 3. Review & Reflection Wrappers (Task Master)
*These wrappers trigger every 1 hour to check the clock, but only consume Gemini tokens at the precise configured times:*
*   **1-Day Priority Overview (`hourlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every day at 08:00, 12:00, 16:00, and 20:00.
    *   **Purpose:** Generates the '1 Day Execution Plan.md' Priority Dashboard.
*   **7-Day Weekly Roadmap (`weeklyReviewTriggerWrapper`)**
    *   **Execution Time:** Every Sunday at 18:00.
    *   **Purpose:** Sweeps backlog and aligns with 7-day calendar capacity.
*   **28-Day Strategic Pruning (`monthlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every 28 days (starting May 10, 2026) at 18:00.
    *   **Purpose:** Prunes the backlog and aligns tasks with overarching goals.
*   **84-Day Quarterly Reflection (`quarterlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every 84 days (starting May 10, 2026) at 18:00.
    *   **Purpose:** Generates a macro-trajectory and goal alignment report.


### 4. Hourly Reference Syncs (System Architect)
*   **Taxonomy Sync (`syncTaxonomyToSheet`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Rebuilds the LOS_Taxonomy JSON and updates the Master Spreadsheet from the markdown categorisation file.

### 5. Daily Reference Syncs (System Architect)
*   **Schedule:** Every Day at 02:00 AM
    *   `updateModelList()`: Exports active Gemini Models to Google Drive JSON and Sheets.
    *   `updateLabelList()`: Exports Gmail Labels to Google Drive JSON and Sheets.
    *   `updateTaskList()`: Exports Google Task List IDs to Google Drive JSON.
    *   `exportTriageTasksToDrive()`: Exports tasks with missing metadata or placeholder goals to a JSON file for agent analysis.

*   **Vantage Reflection AI (`runDailyMaintenance`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Re-generates the daily Vantage Log reflecting on system outputs and daily habits.
*   **Export Goals (`exportAllGoalsToMD`)**
    *   **Schedule:** Every Day at 02:00 AM
    *   **Purpose:** Exports active Goals, Methods, and Habits to markdown files for agent context.
*   **Export Reflections (`exportRecentReflectionsToMD`)**
    *   **Schedule:** Every Day at 02:00 AM
    *   **Purpose:** Compiles the last 90 days of reflections into a markdown repository.

---

## Manual Scripts (Run On-Demand)
These scripts are computationally heavy or require human oversight and are executed manually:
*   **`syncDriveFoldersFromTaxonomy()`:** Run after updating the taxonomy to ensure Drive folders exist.
*   **`runTheClerkRetro()` / `runTheClerkArchive()`:** Slow-burn historical backfills.
