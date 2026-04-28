# The System: Project Plan

To successfully build "The System," we must define our starting point, our destination, and the concrete steps to bridge the gap.

## 1. Current State
The project has successfully completed **Phase A (Foundation)** and is now preparing to execute **Phase B (Data Ingestion)**.
*   **Concepts & Architecture:** Highly developed. The "Second Brain" philosophy (Separation of State) and the Life Organisation System (LOS) taxonomy are fully established.
*   **Documentation:** Consolidated and unified. All overlapping protocols (e.g., Asset Naming) have been merged. The 5 Personas (System Architect, Task Master, The Clerk, Vantage, Atlas) are strictly defined and their instruction files perfectly cross-reference the exact `.md` files in the repository.
*   **Execution Mechanisms:** Functioning but transitioning. Draft Apps Scripts (`Code.js`, `Code_TheClerk.js`, `Code_Tasks.js`) exist, and we are preparing to align them with the unified local prompts (e.g., The Clerk's Email Categorizer prompt is now localized).
*   **Knowledge Base:** The `docs/` folder is now the absolute, canonical source of truth. All legacy dependencies on live Google Docs have been migrated into the local repository to ensure strict version control.

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

### Phase B: Google Tasks Reconciliation MVP (Parallel Workstream) [📍 CURRENT PHASE]
*Frontloading the ability to review, edit, and categorize existing tasks while the rest of the system is built.*
*   **[ ] Task B.1:** Refactor `Code_Tasks.js` into production-ready code (clean architecture, strict commenting, error handling).
*   **[ ] Task B.2:** Build a bi-directional spreadsheet sync (Export Google Tasks to Sheets, and Ingest manual Sheet edits back into Google Tasks).
*   **[ ] Task B.3:** Integrate the Gemini API to automatically summarize any emails linked to the tasks.
*   **[ ] Task B.4:** Integrate the Gemini API to autonomously categorize the tasks within the spreadsheet.

### Phase C: Set Up the Funnel (Data Ingestion)
*Ensuring all incoming data ends up in one place.*
*   **[ ] Task C.1:** Build the functionality to capture external messages (WhatsApp, SMS, Telegram) and route them into the system (e.g., into Gmail or Google Tasks).
*   **[ ] Task C.2:** Guarantee all incoming "noise" is funneled into a single triage gateway ready for The Clerk to process.

### Phase D: Task Analysis & Synthesis (The Doer)
*Extracting the signal from the noise (High Priority).*
*   **[ ] Task D.1:** Automate the analysis/synthesis of the data funnel to proactively identify action items.
*   **[ ] Task D.2:** Handle Google Tasks integration: Build the pipeline where Task Master proposes actions and reliably pushes the approved items into the Google Tasks API.

### Phase E: Reflection & Auditing
*Semi-automating the strategic review cycle.*
*   **[ ] Task E.1:** Build the Vantage Extraction Pipeline to read receipts/stats and produce the "Performance Audit Table."
*   **[ ] Task E.2:** Semi-automate the reflection process using Atlas to cross-reference the Audit Table with your subjective journaling to ensure alignment with your goals.

### Phase F: Autonomous Execution
*Moving beyond management to actual "doing."*
*   **[ ] Task F.1:** Automate the actual task execution. Develop an agent that can actively work through Google Tasks and perform the physical/digital work required, rather than just organizing it.
