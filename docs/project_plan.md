# The System: Project Plan

To successfully build "The System," we must define our starting point, our destination, and the concrete steps to bridge the gap.

## 1. Current State
As of June 2, 2026, the project has successfully completed Phases A, B, C, D, F, and H, and is actively executing Phase E (Reflection, Auditing & Metrics).
*   **Concepts & Architecture:** Highly developed. The "Second Brain" philosophy (Separation of State) and the Life Organisation System (LOS) taxonomy are fully established and operational.
*   **Documentation:** Consolidated and unified. All overlapping protocols (e.g., Asset Naming) have been merged. The 5 Personas (System Architect, Task Master, The Clerk, Vantage, Atlas) are strictly defined and their instruction files perfectly cross-reference the exact `.md` files in the repository.
*   **Execution Mechanisms:** Transitioned from drafts to production. The core engine runs on fully developed Google Apps Scripts (`Code_TheClerk_Email.js`, `Code_TheClerk_Drive.js`, `Code_Tasks.js`, `Code_SyncTaxonomy.js`) that are version-controlled locally and synced directly via `clasp`.
*   **Knowledge Base:** The `docs/` folder is now the absolute, canonical source of truth. The repository dynamically generates `LOS_Taxonomy.json` which is read directly by the Apps Script engines to guarantee perfect structural alignment.

## 2. End Goal
The end goal is a **Fully Unified, Semi-Autonomous "AI Executive Suite."**
*   **Standardized Knowledge Base:** A pristine set of markdown files (Categorisation, Protocols, Naming Rules, Memo, Goals) synced across the workspace, GitHub, and Google Drive. These serve as the absolute source of truth.
*   **The 5 Personas in Production:** The System Architect, Task Master, The Clerk, Vantage, and Atlas are fully defined as cognitive frameworks.
*   **Automated Background Engine:** Apps Scripts reliably handle the administrative grunt work (fetching emails, capturing and routing messages from WhatsApp/SMS/Telegram, parsing PDFs, applying LOS metadata, generating 1 day Workspace Action-Item Reports) in the background.
*   **Conversational Advisory Engine:** Gemini Gems serve as interactive consultants. You can drop a generated report into Task Master to review tasks, or upload a Vantage Audit to Atlas for your 7 day reflection, with zero hallucination because the Gems are perfectly aligned with the Knowledge Base.

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
*   **[x] Task B.2:** Build a bi-directional spreadsheet sync (Export Google Tasks to Sheets, and Ingest manual Sheet edits back into Google Tasks). *Note: The spreadsheet edit synchronization has been retired to simplify the architecture.*
*   **[x] Task B.3:** Integrate the Gemini API to automatically summarize any emails linked to the tasks.
*   **[x] Task B.4:** Integrate the Gemini API to autonomously categorize the tasks within the spreadsheet.
*   **[x] Task B.5:** Timeboxing MVP: Add functionality to the sync that allows assigning an "Estimated Duration" to a task in the spreadsheet and automatically creating a corresponding Calendar Event block.

### Phase C: Set Up the Funnel (Data Ingestion) [✅ COMPLETED]
*Ensuring all incoming data ends up in one place.*
*   **[x] Task C.1:** Build the functionality to capture external messages (WhatsApp, SMS, Telegram) and route them into the system (e.g., into Gmail or Google Tasks).
*   **[x] Task C.2:** Guarantee all incoming "noise" is funneled into a single triage gateway ready for The Clerk to process.
*   **[ ] Task C.3:** Information Curation (1 Day Brief): Develop a scalable, scheduled AI pipeline (e.g., fetching specific RSS feeds) to ingest high-volume information and synthesize it into a tailored, single "Morning Briefing" email to prevent triage fatigue.
*   **[ ] Task C.4:** Unstructured Data Parsing (MarkItDown Pipeline): Integrate Microsoft's Python `markitdown` utility as a core ingestion tool. Develop a local script or webhook that intercepts complex attachments (PDFs, PPTs, Excel sheets) identified by The Clerk, converts them into clean `.md` format, and stores them in the Second Brain for seamless LLM referencing.
*   **[ ] Task C.5:** Web Ingestion Pipeline (Bookmarks): Develop a continuous pipeline (e.g., a periodic script or browser extension) to capture newly saved Chrome bookmarks, run them through The Clerk for auto-categorization according to the LOS Taxonomy, and route them to their appropriate system folders or the triage gateway.
*   **[x] Task C.6:** Unstructured Note Ingestion (The Clerk Notes): Built a dual-mode engine (`Code_TheClerk_Notes.js`) to parse raw scratchpad notes. 'Route Mode' scans designated drop-zones (e.g. `00 Notes & Scratchpad`), extracts actionable tasks, and routes clean Markdown docs to their strict L4 context folder using absolute Taxonomy resolution. 'Clean Mode' formats running notes in-place (e.g. `_Notes`) without routing.
*   **[x] Task C.7:** Gmail Rule Consolidation: Merge Gmail sender/subject rules into a single "Email Rules" tab across both personal and work spreadsheets.

### Phase D: Task Analysis & Synthesis (The Doer) [✅ COMPLETED]
*Extracting the signal from the noise (High Priority).*
*   **[x] Task D.1:** Incoming Triage (The Clerk): Automate The Clerk to actively categorize, label, and intelligently rename all *new* incoming emails and files to match the LOS Taxonomy. *(Completed: Code_TheClerk_Email.js and Code_TheClerk_Drive.js are live and using the strict JSON Taxonomy array).*
*   **[x] Task D.2:** Historical Backfill Audit: Build a slow-burn background script to retroactively scan, label, and rename the existing bloated inbox and Drive files to align with the new taxonomy without hitting API rate limits. *(Completed: runTheClerkRetro and runTheClerkArchive handle this with batching).*
*   **[x] Task D.3:** Action Identification: Automate the analysis of the categorized data funnel to proactively identify and extract action items. *(Completed: The Clerk extracts 'actionItems' into the granular execution log).*
*   **[x] Task D.4:** Task Execution Pipeline (15-Min Sync): Build the core Google Tasks integration that runs immediately after The Clerk (every 15 mins) to push newly extracted actions into your Google Tasks Inbox so you are always up to date. *(Completed: Harmonizer engine strictly enforces formatting).*
*   **[x] Task D.5:** Task Master (Hourly Check-In): Build a high-frequency automation to dynamically refresh priorities. System automation (Task Master Engine) now triggers daily planning execution at 07:00 AM, replacing redundant manual routines.
*   **[x] Task D.6:** Task Master (1 Day Plan & 7 day Lookahead): Finalized the systemic architecture for "One-Pager" execution plans. The AI-generated morning overview is ready for immediate consumption during the user's morning flow.
*   **[x] Task D.7:** Task Master (7 Day Backlog Sweep & Strategic Reflection): Established 28-day and 84-day strategic review infrastructure to accurately manage, prune, and prioritize the task backlog.
*   **[x] Task D.8:** Capacity Context (Calendar): Finalized the Timeboxing Architecture to ensure daily tasks are automatically and accurately synchronized with the Google Calendar.
*   **[ ] Task D.9:** Continuous Inbox Pruning & Hard Deletion: The LLM currently routes junk to the '99 To be deleted' label. We must now create the chron-based garbage collection script that runs 7 day to physically empty this label (moving items to Trash) to maintain inbox health and respect the 18-month grace period limit.
*   **[/] Task D.10:** The 1 Day Context Report: An automated script that aggregates all processed communications (Gmail, Telegram, WhatsApp) and recently modified files into a single master summary at the end of the day to feed the reflection engines.
*   **[ ] Task D.11:** Automated Unsubscribe Pipeline: Build a background script that intercepts emails flagged with a '00 Unsubscribe' label, automatically parses the 'List-Unsubscribe' metadata header, and fires the HTTP/mailto unsubscription protocol silently before trashing the thread.
*   **[x] Task D.12:** Task Metadata Encoding (Deadline Workaround): Develop a syntax protocol to bypass the Google Tasks API limitation (which only supports a "notification" due date). The pipeline will encode the true "Deadline Date," "Estimated Duration," and "Goals Mapping" directly into the Task's `notes` field (e.g., `[DEADLINE: 2026-06-01]`) so Task Master can parse it for accurate prioritization. *(Completed: Encoded via Harmonizer Pipeline).*
*   **[x] Task D.13:** Drive Aggregation Engine & L4 Routing: Updated the Drive Clerk to natively route files to their specific L4 context folders. Implemented the `resolveFolderFromTaxonomy` utility to eliminate name-collision ambiguity by natively traversing Google Drive from the root folder. Files are accurately mapped, shortcuts generated across `aggregator_paths`, and all movement is perfectly captured in the Execution Log.
*   **[x] Task D.14:** Historical Bookmark Audit & Pruning: Build a one-off or slow-burn script to ingest the existing, massive `Bookmarks.json` export. The script must parse the links, categorize them against the existing LOS Taxonomy, route valuable reference material into the Second Brain (`docs/` or Drive), and permanently purge dead or irrelevant links.
*   **[ ] Task D.15:** The Clerk (Multimodal File Processing): Upgrade The Clerk to utilize Gemini's Multimodal capabilities via the Inline Data (Base64) protocol. This will allow the Apps Script engine to automatically parse receipt images, attached invoices, and standard PDFs (<20MB) to extract transaction values and merchants natively without relying on external OCR bridges.
*   **[x] Task D.16:** Performance Refactoring: Optimize batch writing in Code_Tasks.js, Code_TheClerk_Email.js, and Code_TheClerk_Drive.js.

### Phase E: Reflection, Auditing & Metrics (Active Work Streams) [📍 CURRENT PHASE]
*Semi-automating the strategic review cycle.*

#### Stream 1: Photo Archiving & Timeline Integration
*   **[x] Task E.1:** Photo Archiver Pipeline: Local metadata processing active on scripts/categorize_photos_local.py for ~38k takeout photos.
*   **[x] Task E.2:** Unified Historic Timeline & Persona Building: Develop a comprehensive data-fusion pipeline (combining exports from Email, Drive, Photos, and other sources) to construct a massive, searchable JSON timeline. This timeline will feed directly into Atlas and Vantage to build an objective, omni-channel "persona" of your life history.

#### Stream 2: Work/Personal Task Sync Consolidation
*   **[x] Task E.3:** Deploy work-specific instance of The System using clasp and separate GCP credentials.
*   **[x] Task E.4:** Build and run local task aggregator script sync_tasks_combined.py.

#### Stream 3: Dashboard Metrics & Reflection
*   **[ ] Task E.5:** Vantage Extraction Pipeline: Build the Vantage Extraction Pipeline to read receipts/stats and produce the "Performance Audit Table."
*   **[ ] Task E.6:** Time Auditing (Calendar): Develop a script to extract historical Calendar events, calculate total hours spent per "Category" (based on LOS Taxonomy), and feed this objective data into the Vantage Audit.
*   **[ ] Task E.7:** Biological & Digital Metrics Extraction: Build pipelines to automatically pull data from Fitbit and Apple Screen Time to add objective biological/digital metrics to the Vantage Audit.
*   **[ ] Task E.8:** Semi-automate reflection: Semi-automate the reflection process using Atlas to cross-reference the Audit Table with your subjective journaling to ensure alignment with your goals.
*   **[x] Task E.9:** Dashboard Design Polish: Polish interactive buttons, navigation items, and dropdown menus with custom transition animations and direct state binding fixes.
*   **[x] Task E.10:** Taxonomy Omni-Sync: Bidirectional Maintenance: Categorization processes are established. Financial taxonomy and recurring service utilities have been synchronized across the LOS documentation and Google Drive infrastructure.
*   **[x] Task E.11:** Antigravity Skills: Define and verify native Antigravity skills for Socratic planning (/planning_review) and reflection (/reflection_review) reviews.

### Phase F: Conversational Personas (Gemini Gems Setup) [✅ COMPLETED]
*Bringing the static personas to life as interactive consultants.*
*   **[x] Task F.1:** The System Architect Gem: Configured the master builder persona to maintain and evolve the architecture.
*   **[x] Task F.2:** Task Master Gem: Configured the workflow manager persona with direct links to the latest categorisation and rules.
*   **[x] Task F.3:** Vantage Gem: Populated and stabilized reflection infrastructure (`Vantage_Log_1-Day.md` and `Recent_Reflections_90_Days.md`) to enable high-fidelity automated auditing.
*   **[x] Task F.4:** Atlas Gem: Operationalized the Prism/Atlas agent persona within the reflection pipeline to facilitate Socratic decision-making and strategic goal alignment.

### Phase G: Knowledge Synthesis (Notebook LM Pipelines)
*Creating distinct, conversational knowledge bases from static files.*
*   **[ ] Task G.1:** "The System" Notebook: Set up a continuous sync between the `docs/` folder and Notebook LM so that deliverables, manuals, and artifacts can be generated about the system architecture itself.
*   **[ ] Task G.2:** "The Deliverables" Notebook: Set up a continuous sync between the outputs of the system (1 day context summaries, to-do lists, audit tables) and a separate Notebook LM to analyze behavioral attributes and output strategic insights.

### Phase H: Autonomous Execution [✅ COMPLETED]
*Moving beyond management to actual "doing."*
*   **[x] Task H.1:** Build the Generalist Executor Persona (MacGyver). Create the system instructions (`macgyver.md`) and Gem Wrapper to establish an orchestration protocol where MacGyver acts as the doer, tagging in James (Strategy) and Penny (Copywriting) to execute tasks. *(Completed: Aliased into the_system workspace).*
*   **[x] Task H.2:** Manual Execution Pipeline. Since MacGyver can be run locally via Antigravity or via the Gemini App, we will forgo automated Apps Script triggers for now. MacGyver will read the live `Google Tasks (Private).md` or `Google Task (Work).md` file to understand the active queue.
*   **[x] Task H.3:** Task Status Updates (Skill/Workflow). Built the `edit_task.md` skill utilizing `Code_Tasks.js` (updateAdHocTaskFromCLI) to allow MacGyver to natively patch task statuses and append execution notes directly to the cloud without editing local read-only exports.
*   **[x] Task H.4:** Full Autonomy Pipeline: Transitioned MacGyver from a human-triggered tool to a proactive agent capable of digital proxy execution for physical errands via native Apps Script `clasp` calls.
*   **[x] Task H.5:** Rule Refinement & Edge Case Handling (Continuous): Implemented mandatory rules in `macgyver.md` requiring Calendar/Task pre-flight checks and prohibiting browser-based manual data gathering.

## Deferred / Under Review

### Phase I: Multi-Tenant & Family Expansion (Future Scope)
*Scaling The System from a personal Second Brain to a Family Hub & Work Environment.*
*   **[ ] Task I.1:** Deploy decentralized instances of The Clerk to secondary Google Accounts (e.g., Wife's accounts) using custom, tailored taxonomies.
*   **[ ] Task I.2:** Build an aggregation bridge that routes 'need to know' action items and calendar logistics from secondary accounts into a centralized family dashboard on the Master Spreadsheet.

### Phase J: Event-Driven Webhook Architecture (Future Scope)
*Transitioning from polling to real-time event-driven updates using Gemini API Webhooks.*
*   **[ ] Task J.1:** Deploy a centralized Webhook Listener (e.g., Flask/Express) to serve as the Antigravity system's event receiver.
*   **[ ] Task J.2:** Refactor Batch Processing (e.g., The Clerk Retro Audit) to use static webhooks (`batch.succeeded`) instead of active polling, instantly triggering spreadsheet ingestion.
*   **[ ] Task J.3:** Implement a Push-to-Agent architecture using dynamic webhooks. Tag Jules sessions and long-running tasks with metadata to instantly awaken MacGyver or update `Google Tasks (Private/Work).md` upon completion without constant status checking.

### Phase K: Gemini Spark & Antigravity 2.0 Background Task Integration (Future / UK Availability)
*Transitioning background engines to native 24/7 background tasks once Gemini Spark is available in the UK.*
*   **[ ] Task K.1:** Monitor Gemini Spark UK availability and investigate how to map direct Gemini API quotas/thresholds in Spark to prevent rate limiting.
*   **[ ] Task K.2:** Design a parallel execution framework in Antigravity 2.0 to mirror the core Google Apps Scripts (Clerk/Taskmaster) using background agents.
*   **[ ] Task K.3:** Migrate background workflows from GAS to Antigravity 2.0 once UK restrictions are lifted.

### Phase L: Google Chat Workspace Integration & Sync (Future Scope)
*Integrating Google Chat as a consolidated messaging workspace.*
*   **[ ] Task L.1:** Set up one-way ingestion routing from WhatsApp/Telegram/Messenger bridges to dedicated Google Chat spaces (utilizing webhook endpoints on a Business Standard Google Workspace account).
*   **[ ] Task L.2:** Build a bidirectional sync daemon that polls the Apps Script outbound queue and dispatches replies written inside Google Chat back to the messaging bridges.
