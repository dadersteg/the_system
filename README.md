# The System

> **Architectural Note:** For global topological layout, identity boundaries, and folder routing rules, refer to the [TS - System Architecture Map.md](../../../../the_system/docs/TS%20-%20System%20Architecture%20Map.md) (or equivalent path in `docs/`).


## 1. Purpose
"The System" is an AI-powered Executive Suite functioning as a comprehensive "Second Brain." Its primary goal is to unburden the mind by managing the administrative friction of 1 day life—triage, file categorization, task processing, and reflective planning. By handling the noise, The System allows the user to focus purely on meaningful execution and strategic growth.

## 2. Core Philosophy: Separation of State
The System enforces a strict boundary between different types of information to prevent clutter and ensure clarity:
*   **The Execution Funnel (Google Tasks):** Holds *only* actionable items with clear next steps.
*   **The Scratchpad (Google Keep / Notes):** Holds transient thoughts and temporary context.
*   **The Knowledge Base (Google Drive):** Holds permanent, structured reference material.
*   **The Backbone (LOS):** Everything is anchored by the **Life Organisation System (LOS)**, a strict 4-level taxonomy (Domain > Category > Sub-Category > Context) that ensures all data is categorized uniformly.

---

## 3. The Persona Ecosystem
The System is powered by a team of specialized AI "Personas." Rather than being monolithic scripts or static prompts, these Personas are cognitive frameworks. To prevent hallucination and ensure high-fidelity outputs, each Persona has a strictly defined scope.

A Persona can exist in two forms, depending on the need:
1.  **Automated Workflows:** Background processes running asynchronously (e.g., scanning emails, categorizing files, generating 1 day action reports).
2.  **Conversational Workflows:** Interactive chat sessions (e.g., via Gemini Gems) for complex problem-solving, 1 day review, or strategic reflection.

### The 5 Personas

#### 1. System Architect (The Governor / Legislative)
*   **Role:** Maintains the rules and structure.
*   **Focus:** It governs the LOS taxonomy. When new projects arise or the system feels cluttered, the Architect is consulted to create new categories, update the protocols, and define structural plans. 

#### 2. Taskmaster (The Doer / Executive)
*   **Role:** Manages the task funnel.
*   **Focus:** It extracts actionable items from the noise (emails, docs, notes) and structures them. Using frameworks like the Eisenhower Matrix, Taskmaster ensures that nothing falls through the cracks and that intent is converted into scheduled execution.

#### 3. The Clerk (The Filer / Administrative)
*   **Role:** Enforces the physical organization of the digital workspace.
*   **Focus:** It categorizes files, applies strict naming conventions, and generates machine-readable metadata. It ensures that the permanent Knowledge Base remains pristine and easily searchable.

#### 4. Vantage (The Auditor / Analytical)
*   **Role:** Clinical data extraction and performance auditing.
*   **Focus:** It ingests raw data (financial statements, health metrics, chat logs) and maps those metrics objectively against defined target identifiers (URNs). Vantage is entirely clinical and logic-driven.

#### 5. Atlas (The Analyst / Reflective)
*   **Role:** Strategic goal alignment and journaling.
*   **Focus:** It guides subjective 1 day/7 day reflection frameworks. By synthesizing qualitative journaling with Vantage’s objective audit data, Atlas ensures that 1 day habits are actually moving the needle on long-term goals.

---

## 4. Architecture & The Knowledge Base
The Personas draw their intelligence and context from a centralized, living Knowledge Base. These are dynamic Markdown files maintained in the workspace, version-controlled via GitHub, and synced with Google Drive so that both automated scripts and conversational Gems have access to the exact same "Source of Truth."

**Key Knowledge Files:**
*   **Categorisation:** The master LOS taxonomy.
*   **The System Protocols:** The procedural laws, logic, and operational frameworks.
*   **Master Asset Naming Protocol:** The definitive rules for file naming and retention.
*   **Memo:** Dynamic logistical context, relationships, and operational cheat sheets.
*   **Goals, Methods and Habits:** The highly personal, dynamic goal architecture for The System.

---

## 5. Future Project Roadmap
*   **Workspace Studios Integration:** Investigate deprecating paid custom API scripts for email/calendar routing and migrating "The Clerk" and "Relational Tally" engines entirely into Google Workspace Studios. This leverages native event-driven triggers and conserves API quota.

---

## 6. Development Setup
The `node_modules` directory for this project is typically located externally in a cache directory (e.g., `~/Developer/AGY_caches/the_system/node_modules`) to avoid syncing heavy module folders. Scripts and the process manager are configured to look for dependencies via the `NODE_PATH` environment variable. Python dependencies are managed similarly via a virtual environment whose path can be overridden with `VENV_PATH`.