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

Data is not just stored; it must be queried. The strict physical boundaries of the Storage Layer are transcended using "Overlays."

### 4.1 Transversal Projects & Goals
A project or goal may physically reside in a strict location (e.g., `01 Private/05 Other/01 Projects/The System (TS)` or `02 01 01 Playmetech/05 Projects/project_ai_betting_framework`), but its knowledge implications span across the entire system. In PMTOS, Goals also function as transversal overlays, cutting across standard operational categories.

### 4.2 Unified Notebooks & Drive Projects
To facilitate transversal access without breaking folder taxonomy, a project or goal is overlaid with a Google Drive Project and a NotebookLM/Gemini Notebook.
*   **The Physical Location:** Strict L4 project folders (Storage).
*   **The Knowledge Interface:** Unified Notebooks (Retrieval).
*   **Implementation:** Every active transversal project or goal must be formally registered to a corresponding Notebook URL, providing AI agents with the precise bounded context required for execution.
