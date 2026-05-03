# The System: Project Plan

To successfully build "The System," we must define our starting point, our destination, and the concrete steps to bridge the gap.

## 1. Current State
The project has successfully completed **Phase A (Foundation)** and is now preparing to execute **Phase B (Data Ingestion)**.
*   **Concepts & Architecture:** Highly developed. The "Second Brain" philosophy (Separation of State) and the Life Organisation System (LOS) taxonomy are fully established and operational.
*   **Documentation:** Consolidated and unified. All overlapping protocols (e.g., Asset Naming) have been merged. The 5 Personas (System Architect, Task Master, The Clerk, Vantage, Atlas) are strictly defined and their instruction files perfectly cross-reference the exact `.md` files in the repository.
*   **Execution Mechanisms:** Transitioned from drafts to production. The core engine runs on fully developed Google Apps Scripts (`Code_TheClerk_Email.js`, `Code_TheClerk_Drive.js`, `Code_Tasks.js`, `Code_SyncTaxonomy.js`) that are version-controlled locally and synced directly via `clasp`.
*   **Knowledge Base:** The `docs/` folder is now the absolute, canonical source of truth. The repository dynamically generates `LOS_Taxonomy.json` which is read directly by the Apps Script engines to guarantee perfect structural alignment.

## 2. End Goal
The end goal is a **Fully Unified, Semi-Autonomous "AI Executive Suite."**
*   **Standardized Knowledge Base:** A pristine set of markdown files (Categorisation, Protocols, Naming Rules, Memo, Goals) synced across the workspace, GitHub, and Google Drive. These serve as the absolute source of truth.
*   **The 5 Personas in Production:** The System Architect, Task Master, The Clerk, Vantage, and Atlas are fully defined as cognitive frameworks.
*   **Automated Background Engine:** Apps Scripts reliably handle the administrative grunt work (fetching emails, capturing and routing messages from WhatsApp/SMS/Telegram, parsing PDFs, applying LOS metadata, generating daily Workspace Action-Item Reports) in the background.
*   **Conversational Advisory Engine:** Gemini Gems serve as interactive consultants. You can drop a generated report into Task Master to review tasks, or upload a Vantage Audit to Atlas for your weekly reflection, with zero hallucination because the Gems are perfectly aligned with the Knowledge Base.

---

## 3. Milestones to Get There

### Phase A: Define the Foundation (Knowledge Base & Personas) [✅ COMPLETED]
*Before automating anything, the rules must be unambiguous. Note: This phase is continuous and iterative. The Knowledge Base and Personas will be revisited, refined, and updated throughout all subsequent phases as the system evolves.*
*   **[x] Task A.1:** Revise and update the `Categorisation` file so that it perfectly aligns with your existing Gmail labels and Google Drive folders.
*   **[x] Task A.2:** Consolidate redundant files. (Merged multiple naming protocols into a single `TS - Master Asset Naming Protocol.md`).
*   **[x] Task A.3:** Define the explicit workflows for each Persona. Updated the instructions and Gemini Gems to point strictly to this unified Knowledge Base with exact `.md` file paths.

### Phase B: Google Tasks Reconciliation MVP (Parallel Workstream) [✅ COMPLETED]
*Frontloading the ability to review, edit, and categorize existing tasks while the rest of the system is built.*
*   **[x] Task B.1:** Refactor `Code_Tasks.js` into production-ready code (clean architecture, strict commenting, error handling).
*   **[x] Task B.2:** Build a bi-directional spreadsheet sync (Export Google Tasks to Sheets, and Ingest manual Sheet edits back into Google Tasks).
*   **[x] Task B.3:** Integrate the Gemini API to automatically summarize any emails linked to the tasks.
*   **[x] Task B.4:** Integrate the Gemini API to autonomously categorize the tasks within the spreadsheet.
*   **[ ] Task B.5:** Timeboxing MVP: Add functionality to the sync that allows assigning an "Estimated Duration" to a task in the spreadsheet and automatically creating a corresponding Calendar Event block.

### Phase C: Set Up the Funnel (Data Ingestion)
*Ensuring all incoming data ends up in one place.*
*   **[x] Task C.1:** Build the functionality to capture external messages (WhatsApp, SMS, Telegram) and route them into the system (e.g., into Gmail or Google Tasks).
*   **[x] Task C.2:** Guarantee all incoming "noise" is funneled into a single triage gateway ready for The Clerk to process.
*   **[ ] Task C.3:** Information Curation (Daily Brief): Develop a scalable, scheduled AI pipeline (e.g., fetching specific RSS feeds) to ingest high-volume information and synthesize it into a tailored, single "Morning Briefing" email to prevent triage fatigue.

### Phase D: Task Analysis & Synthesis (The Doer) [📍 CURRENT PHASE]
*Extracting the signal from the noise (High Priority).*
*   **[x] Task D.1:** Incoming Triage (The Clerk): Automate The Clerk to actively categorize, label, and intelligently rename all *new* incoming emails and files to match the LOS Taxonomy. *(Completed: Code_TheClerk_Email.js and Code_TheClerk_Drive.js are live and using the strict JSON Taxonomy array).*
*   **[x] Task D.2:** Historical Backfill Audit: Build a slow-burn background script to retroactively scan, label, and rename the existing bloated inbox and Drive files to align with the new taxonomy without hitting API rate limits. *(Completed: runTheClerkRetro and runTheClerkArchive handle this with batching).*
*   **[x] Task D.3:** Action Identification: Automate the analysis of the categorized data funnel to proactively identify and extract action items. *(Completed: The Clerk extracts 'actionItems' into the granular execution log).*
*   **[x] Task D.4:** Task Execution Pipeline (15-Min Sync): Build the core Google Tasks integration that runs immediately after The Clerk (every 15 mins) to push newly extracted actions into your Google Tasks Inbox so you are always up to date. *(Completed: Harmonizer engine strictly enforces formatting).*
*   **[ ] Task D.5:** Task Master (Hourly Check-In): Build a high-frequency automation to dynamically refresh priorities every hour using the Eisenhower Matrix and Timeboxing frameworks. It must identify the single most important task to execute at any given moment.
*   **[ ] Task D.6:** Task Master (Daily Plan & 7-Day Lookahead): Develop an automated daily script that plans the current day and continuously updates the 7-day roadmap. This script **must** cross-reference both the "Personal Goals" and "Work Goals" documents to ensure daily actions align with overarching strategic objectives.
*   **[ ] Task D.7:** Task Master (Weekly Backlog Sweep): Create a weekly automated sweep of the entire backlog using the established Backlog framework. It must actively prune, reprioritize, or delete stale tasks to prevent list bloat, ensuring all surviving tasks map back to the Goals documents.
*   **[ ] Task D.8:** Capacity Context (Calendar): Build a pipeline allowing Task Master to read upcoming Calendar events to calculate "Free Capacity" before assigning tasks to prevent over-scheduling.
*   **[ ] Task D.9:** Continuous Inbox Pruning & Hard Deletion: The LLM currently routes junk to the '99 To be deleted' label. We must now create the chron-based garbage collection script that runs weekly to physically empty this label (moving items to Trash) to maintain inbox health and respect the 18-month grace period limit.
*   **[ ] Task D.10:** The Daily Context Report: An automated script that aggregates all processed communications (Gmail, Telegram, WhatsApp) and recently modified files into a single master summary at the end of the day to feed the reflection engines.
*   **[ ] Task D.11:** Automated Unsubscribe Pipeline: Build a background script that intercepts emails flagged with a '00 Unsubscribe' label, automatically parses the 'List-Unsubscribe' metadata header, and fires the HTTP/mailto unsubscription protocol silently before trashing the thread.
*   **[x] Task D.12:** Task Metadata Encoding (Deadline Workaround): Develop a syntax protocol to bypass the Google Tasks API limitation (which only supports a "notification" due date). The pipeline will encode the true "Deadline Date," "Estimated Duration," and "Goals Mapping" directly into the Task's `notes` field (e.g., `[DEADLINE: 2026-06-01]`) so Task Master can parse it for accurate prioritization. *(Completed: Encoded via Harmonizer Pipeline).*
*   **[x] Task D.13:** Drive Aggregation Engine & L4 Routing: Updated the Drive Clerk to natively route files to their specific L4 context folders. The 'Cross-Cutting' shortcut logic (for Contracts/Receipts) has been natively implemented. Files are correctly mapped, shortcuts generated across `aggregator_paths`, and all movement is perfectly captured in the Execution Log.
### Phase E: Reflection & Auditing
*Semi-automating the strategic review cycle.*
*   **[ ] Task E.1:** Build the Vantage Extraction Pipeline to read receipts/stats and produce the "Performance Audit Table."
*   **[ ] Task E.2:** Semi-automate the reflection process using Atlas to cross-reference the Audit Table with your subjective journaling to ensure alignment with your goals.
*   **[ ] Task E.3:** Time Auditing (Calendar): Develop a script to extract historical Calendar events, calculate total hours spent per "Category" (based on LOS Taxonomy), and feed this objective data into the Vantage Audit.
*   **[ ] Task E.4:** Taxonomy Omni-Sync (Bidirectional Maintenance): Build an automated synchronization pipeline to ensure absolute alignment across the ecosystem. If a new project is added to `TS - Categorisation.md`, the script must automatically provision the corresponding Google Drive folders and Gmail labels. Conversely, if ad-hoc projects are created in Google Tasks, the System Architect must detect them and sync them back to the master Categorisation doc, ensuring active/inactive statuses propagate globally.
*   **[ ] Task E.5:** Biological & Digital Metrics Extraction (Future): Build pipelines to automatically pull data from Fitbit and Apple Screen Time to add objective biological/digital metrics to the Vantage Audit.
### Phase F: Conversational Personas (Gemini Gems Setup)
*Bringing the static personas to life as interactive consultants.*
*   **[ ] Task F.1:** The System Architect Gem: Configure the master builder persona to maintain and evolve the architecture.
*   **[ ] Task F.2:** Task Master Gem: Configure the workflow manager persona with direct links to the latest categorisation and rules.
*   **[ ] Task F.3:** Vantage Gem: Configure the auditor persona to reflect on extracted performance tables.
*   **[ ] Task F.4:** Atlas Gem: Configure the strategic persona for long-term goal alignment.

### Phase G: Knowledge Synthesis (Notebook LM Pipelines)
*Creating distinct, conversational knowledge bases from static files.*
*   **[ ] Task G.1:** "The System" Notebook: Set up a continuous sync between the `docs/` folder and Notebook LM so that deliverables, manuals, and artifacts can be generated about the system architecture itself.
*   **[ ] Task G.2:** "The Deliverables" Notebook: Set up a continuous sync between the outputs of the system (daily context summaries, to-do lists, audit tables) and a separate Notebook LM to analyze behavioral attributes and output strategic insights.

### Phase H: Autonomous Execution
*Moving beyond management to actual "doing."*
*   **[ ] Task H.1:** Automate the actual task execution. Develop an agent that can actively work through Google Tasks and perform the physical/digital work required, rather than just organizing it.

### Phase I: Multi-Tenant & Family Expansion (Future Scope)
*Scaling The System from a personal Second Brain to a Family Hub.*
*   **[ ] Task I.1:** Deploy decentralized instances of The Clerk to secondary Google Accounts (e.g., Wife's accounts) using custom, tailored taxonomies.
*   **[ ] Task I.2:** Build an aggregation bridge that routes 'need to know' action items and calendar logistics from secondary accounts into a centralized family dashboard on the Master Spreadsheet.
