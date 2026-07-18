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

*   **Notes Triage (`runTheClerkNotes`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Ingests and processes notes.

*   **Drive Archaeologist (`runDriveArchaeologist`)**
    *   **Schedule:** Every Day at 02:00
    *   **Purpose:** Deep historical file triage.

### 2. The Execution Layer (Task Master)
*   **Task Master Engine (Micro-Batch Polisher) (`runTaskMasterEngine`)**
    *   **Schedule:** Every 15 Minutes
    *   **Purpose:** Uses Delta-Sync to detect new/modified tasks. Routes them via Gemini for immediate categorization and deadline assignment.

### 3. Review & Reflection Wrappers (Task Master)
*These wrappers trigger every 1 hour to check the clock, but only consume Gemini tokens at the precise configured times:*
*   **1-Day Priority Overview (`hourlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every day at 06:00, 08:00, 12:00, 16:00, and 20:00.
    *   **Purpose:** Generates the '1 Day Execution Plan.md' Priority Dashboard.
*   **7-Day Weekly Roadmap (`weeklyReviewTriggerWrapper`)**
    *   **Execution Time:** Every Sunday at 09:00.
    *   **Purpose:** Sweeps backlog and aligns with 7-day calendar capacity.
*   **28-Day Strategic Pruning (`monthlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every 28 days at 09:00.
    *   **Purpose:** Prunes the backlog and aligns tasks with overarching goals.
*   **84-Day Quarterly Reflection (`quarterlyReviewTriggerWrapper`)**
    *   **Execution Time:** Every 84 days at 09:00.
    *   **Purpose:** Generates a macro-trajectory and goal alignment report.

### 4. Hourly Reference Syncs
*   **Taxonomy Sync (`syncTaxonomyToSheet`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Rebuilds the LOS_Taxonomy JSON and updates the Master Spreadsheet from the markdown categorisation file.
*   **Export Trackers (`exportTrackers`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Exports tracker data.

### 5. Daily Reference Syncs
*   **Schedule:** Every Day at 02:00
    *   `updateModelList()`: Exports active Gemini Models to Google Drive JSON and Sheets.
    *   `updateLabelList()`: Exports Gmail Labels to Google Drive JSON and Sheets.
    *   `updateTaskList()`: Exports Google Task List IDs to Google Drive JSON.

---

## Private Reflection Pipelines (External Codebase)
The following scripts belong to "The System Private Reflection" codebase (`~/Documents/AGY/reflection`) and run externally to the main Task Master engine. Their triggers are provisioned by `setupReflectionTriggers()`:
*   **Vantage Reflection AI (`runDailyMaintenance`)**
    *   **Schedule:** Every 1 Hour
    *   **Purpose:** Re-generates the daily Vantage Log reflecting on system outputs and daily habits.
*   **14-Day Vantage Audit (`runVantage14DayAudit`)**
    *   **Schedule:** Every Sunday at 06:00 (on even weeks)
    *   **Purpose:** AI-enriched 14-day audit.
*   **Export Goals (`runGoalsExport`)**
    *   **Schedule:** Every Day at 02:00
    *   **Purpose:** Exports active Goals, Methods, and Habits to markdown files for agent context.
*   **Export Reflections (`runReflectionsExport`)**
    *   **Schedule:** Every Day at 02:00
    *   **Purpose:** Compiles the last 90 days of reflections into a markdown repository.

---

## Excluded Pipelines (Managed by Python / User)
The following scripts are explicitly idled in GAS because the local MacMini Python script (`sync_tasks_combined.py`) manages the markdown generation and bi-directional cross-LOS routing autonomously, or they are run manually:
*   `extractTasksWithConversationDetails`
*   `run1DayTaskMaintenance`
*   `runTheClerkDriveRetro`
