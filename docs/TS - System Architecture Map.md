# System Architecture Map

**Status:** Active  
**Governing Authority:** The System Architect  

**Reference Master Files:**
*   **LOS:** [TS - Categorisation (Private).md](TS%20-%20Categorisation%20(Private).md) | `LOS_Taxonomy.json`
*   **PMTOS:** `TS - Categorisation (PMT).md` | `PMTOS_Taxonomy.json`

This document serves as the absolute topological blueprint of The System. It maps the physical storage layers, the knowledge overlays, and the identity boundaries spanning across local and cloud environments. It supersedes all static "actuals" tracking files.

---

## 1. The Foundational Protocols

### 1.1 The "LLM vs. Human" Duality Protocol
This protocol bridges the local operational environment and the cloud storage environment.
*   **Cloud Folders** (Google Drive) use human-readable `Title Case`.
*   **Local CLI/LLM Folders** use machine-readable `snake_case`. Agents must dynamically map between these two states when traversing between local execution and cloud storage.

There are strictly defined instances where dual folders exist between the local `AGY` environment and the Google Drive cloud:
1.  **The System:** `AGY/the_system` (Local) <-> `01 Private/05 Other/01 Projects/The System (TS)` (Cloud)
2.  **Finance:** `AGY/finance` (Local) <-> `01 Private/04 Finances` (Cloud)
3.  **The PMT Folder:** `AGY/agy_pmt` (Local) <-> `02 01 01 Playmetech` (Cloud)

---

## 2. The Storage Layer (Google Drive)

The physical storage layer is strictly bifurcated by identity (`@gmail.com` vs `@playmetech.net`), though they intersect at designated bridges.

### 2.1 The Private Operating System (LOS)
Governed by the Private Identity. This environment adheres to a strict L1-L3 hierarchical taxonomy.
*   **01 Private**
    *   01 Personal Admin
    *   02 Health
    *   03 Personal Growth
    *   04 Finances
    *   05 Other
*   **02 Work**
    *   01 Employment
        *   `02 01 01 Playmetech` *(The root node for the PMTOS within the Private Drive)*
    *   02 Career Management
*   **03 Studies**

### 2.2 The Playmetech Operating System (PMTOS)
Governed by the PMT Identity. While physically housed within the Private Drive's node (`02 01 01 Playmetech`), PMTOS operates as a standalone system with its own distinct sub-taxonomy.
*   **01 Playmetech Admin**
    *   *Bridge:* `Contract, Personal Documents` (The explicit cross-identity tunnel)
*   **02 Team & Operations**
*   **03 Professional Growth**
*   **04 Finances**
*   **05 Projects**

---

## 3. The Local Execution Layer (Mac Mini)

The physical hardware of the Mac Mini serves as the execution engine (Antigravity). Folders are routed into three distinct environments based on synchronization needs and LLM usability, adhering to the Global Workspace Routing Rules.

### 3.1 Operational / Synced Workspace (`/Users/daniel/Documents/AGY/`)
These folders are synced to Google Drive and contain active operational logic.
*   `the_system/`: The global private operational system, prompts, and global scripts.
*   `agy_pmt/`: The local bridge for PMTOS. Adheres to the `snake_case` duality rule.

### 3.2 Developer / Unsynced Workspace (`/Users/daniel/Developer/`)
Isolated environments for intensive development that should not bloat the synced Drive (e.g., heavy coding projects and local bridges like WhatsApp).

### 3.3 Multi-Agent Sandboxes (`/Users/daniel/teamwork_projects/`)
Temporary workspaces utilized for multi-agent orchestrations. Code or artifacts developed here must be formally verified and "promoted" (moved) into the operational `AGY/` environment to be recognized by the active system.

---

## 4. The Knowledge Interface Layer (Overlays)

Data is not just stored; it must be queried and coordinated. The strict physical boundaries of the Storage Layer are transcended using "Overlays."

### 4.1 The 4-Tier Project Overlay Model
A transversal project or goal exists across four distinct overlay tiers:
1.  **Strict Storage:** Physically located within a strict `05 Projects` folder in Google Drive.
2.  **AI Reasoning:** As a **NotebookLM** notebook (created on an as-needed basis).
3.  **Workspace Coordination:** As a **Google Workspace Project** (created on an as-needed basis). This Gemini-powered feature serves as the centralized hub for files, emails, and calendar events, actively eliminating the need to create messy Drive shortcuts.
4.  **Execution Environment:** As an **Antigravity Agent Project**. Antigravity projects are transversal execution environments. They can bind multiple physical local directories (e.g., `/AGY/the_system` + `/Developer/some_script`) into a single conversational agent context.

### 4.2 Base Buckets vs. Specific Overlays
To facilitate transversal access without breaking the folder taxonomy, all Overlays (Google Keep, NotebookLM, Workspace Projects, and Antigravity Projects) strictly follow the taxonomy nomenclature:
*   **Base Buckets (L2 Taxonomy Mapping):** For broad, ad-hoc capture and analysis, overlays should be created as high-level "Base Buckets" mapping directly to L2 taxonomy nodes (e.g., `01 01 00 Personal Admin` or `02 01 00 Employment`). This unified approach applies equally to Google Keep labels, NotebookLM notebooks, and Workspace Projects.
*   **Specific Overlays:** When an ad-hoc effort graduates into a specific project, its label/name across Keep, NotebookLM, and Workspace Projects must exactly match the specific project name defined in the taxonomy.

---

## 5. The Multiplicity & Cross-Linking Protocols

### 5.1 The Email Multiplicity Protocol (Gmail)
While Google Drive enforces strict "Single-Location Storage" (a physical file lives in exactly one folder), Gmail operates on "Multi-Dimensional Tagging." 
*   The `LOS_Taxonomy.json` serves as a tag library for Gmail.
*   The system (and The Clerk) is fully authorized to attach multiple cross-identity labels to a single email (e.g., both `01 Private/04 Finances` AND `01 Playmetech Admin/04 Finances` on a shared invoice) to ensure it surfaces in all relevant contexts.

### 5.2 Google Drive Shortcut Governance
With the introduction of Google Workspace Projects for coordination, the use of Google Drive Shortcuts is heavily restricted.
*   Shortcuts should **not** be used to link related project files together (use Workspace Projects for this).
*   Shortcuts are strictly reserved for establishing formal structural bridges across identity boundaries (such as the `Contract, Personal Documents` bridge). They solve strict security architecture problems, not standard organizational laziness.
