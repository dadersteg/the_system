# The System: Project Plan

To successfully build "The System," we must define our starting point, our destination, and the concrete steps to bridge the gap.

## 1. Current State
The project is currently in the **"Organized Ideation"** phase.
*   **Concepts & Architecture:** Highly developed. The "Second Brain" philosophy (Separation of State) and the Life Organisation System (LOS) taxonomy are well thought out.
*   **Documentation:** Exists but is fragmented. There are overlapping protocols (e.g., multiple Asset Naming docs) and mixed definitions of the Personas (e.g., Trinity vs. 5 Personas) scattered across various markdown drafts.
*   **Execution Mechanisms:** Functioning but messy. There are draft Apps Scripts (`Code.js`, `Code_TheClerk.js`, `Code_Tasks.js`) and conversational prompts for Gemini Gems, but the strict boundary between the automated scripts and the conversational Gems is not fully standardized.
*   **Knowledge Base:** Spread across local Markdown files, with some Apps Scripts pointing to live Google Docs. The canonical source of truth for the Personas is not yet fully unified.

## 2. End Goal
The end goal is a **Fully Unified, Semi-Autonomous "AI Executive Suite."**
*   **Standardized Knowledge Base:** A pristine set of markdown files (Categorisation, Protocols, Naming Rules, Memo, Goals) synced across the workspace, GitHub, and Google Drive. These serve as the absolute source of truth.
*   **The 5 Personas in Production:** The System Architect, Taskmaster, The Clerk, Vantage, and Atlas are fully defined as cognitive frameworks.
*   **Automated Background Engine:** Apps Scripts reliably handle the administrative grunt work (fetching emails, capturing and routing messages from WhatsApp/SMS/Telegram, parsing PDFs, applying LOS metadata, generating daily Workspace Action-Item Reports) in the background.
*   **Conversational Advisory Engine:** Gemini Gems serve as interactive consultants. You can drop a generated report into Taskmaster to review tasks, or upload a Vantage Audit to Atlas for your weekly reflection, with zero hallucination because the Gems are perfectly aligned with the Knowledge Base.

---

## 3. Milestones to Get There

### Phase A: Define the Foundation (Knowledge Base & Personas)
*Before automating anything, the rules must be unambiguous. Note: This phase is continuous and iterative. The Knowledge Base and Personas will be revisited, refined, and updated throughout all subsequent phases as the system evolves.*
*   **Task A.1:** Revise and update the `Categorisation` file so that it perfectly aligns with your existing Gmail labels and Google Drive folders.
*   **Task A.2:** Consolidate redundant files. (e.g., Merge multiple naming protocols into a single `Master Asset Naming Protocol.md`).
*   **Task A.3:** Define the explicit workflows for each Persona. Update the instructions and Gemini Gems to point to this unified Knowledge Base.

### Phase B: Set Up the Funnel (Data Ingestion)
*Ensuring all incoming data ends up in one place.*
*   **Task B.1:** Build the functionality to capture external messages (WhatsApp, SMS, Telegram) and route them into the system (e.g., into Gmail).
*   **Task B.2:** Guarantee all incoming "noise" is funneled into a single triage gateway ready for The Clerk to process.

### Phase C: Task Analysis & Synthesis (The Doer)
*Extracting the signal from the noise (High Priority).*
*   **Task C.1:** Automate the analysis/synthesis of the data funnel to proactively identify action items.
*   **Task C.2:** Handle Google Tasks integration: Build the pipeline where Taskmaster proposes actions and reliably pushes the approved items into the Google Tasks API.

### Phase D: Reflection & Auditing
*Semi-automating the strategic review cycle.*
*   **Task D.1:** Build the Vantage Extraction Pipeline to read receipts/stats and produce the "Performance Audit Table."
*   **Task D.2:** Semi-automate the reflection process using Atlas to cross-reference the Audit Table with your subjective journaling to ensure alignment with your goals.

### Phase E: Autonomous Execution
*Moving beyond management to actual "doing."*
*   **Task E.1:** Automate the actual task execution. Develop an agent that can actively work through Google Tasks and perform the physical/digital work required, rather than just organizing it.
