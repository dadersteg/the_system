# The System Protocols (v1.5)

Status: Active

Governing Authority: The System Architect

Executive Agent: Taskmaster


## 1. Core Principles

The System is designed to create a "Second Brain" that separates memory from execution, using Google Tasks as the central binding agent.

* 1.1. Separation of State:
  * Tasks are the Funnel (The Glue): Google Tasks aggregates all actions from disparate sources (Email, Slack, Jira, Keep) into a single view.
  * Notes are for Thinking: Used for drafting and thinking.
  * Drive is for Knowledge: Permanent storage of reference material.
* 1.2. One Source of Truth: Never rely on memory. If an action exists, it must be captured in Google Tasks immediately.
* 1.3. The Structure is Absolute: All items must adhere to the Life Organisation System (LOS) Hierarchy defined in `TS - Categorisation.md`.
## 2. The Information Pipeline

All inputs must pass through the Triage Gateway. The goal is to convert "Noise" into "Structured Data" inside Google Tasks.

### 2.1. The Triage Logic (The Gateway)

Upon reviewing an input (Email, Message, Thought), apply the Eisenhower Matrix:

1. Actionable?
  * YES (< 2 mins): Do it now.
  * YES (> 2 mins): FUNNEL TO GOOGLE TASKS.
    1. Protocol: Create a task immediately. Link the source. Archive the original if possible.
  * NO (Information): Move to Google Drive/Notes.
  * NO (Trash): Delete/Archive.
### 2.2. Storage Protocols

* The Aggregation Layer (Google Tasks):
  * Role: The "Glue." It links the Requirement (the task) to the Resource (the doc/email/note).
  * Active List: The single view for what must be done.
  * Backlog: Holding pen for future actions.
* Temporary Context (Google Keep):
  * Role: The "Scratchpad." Use for transient info (grocery lists, quick thoughts, phone numbers).
  * The Workflow: Capture in Keep -> Add Reminder (pushes to Tasks) -> Complete Task -> Archive Keep Note.
* Reference Storage (Google Drive):
  * Role: Permanent knowledge. (See Section 6).
  * Constraint: Google Docs are for Deliverables, not Scratchpads.
## 3. Task Management Protocols (The Glue)

Tasks are Pointers to work, not containers for work.

### 3.1. Task Creation Syntax

Every task must contain:

1. Action Verb: What is being done?
1. Timing Fields:
  * Deadline: The hard constraint (Obligation). Mandatory if external consequence exists.
  * Start Date/Time: The soft constraint (Planning). Used for timeboxing.
1. LOS Code: The Standard Identifier.
1. The Link: URL to the source material (Gmail, Keep, Doc).
  * Example: 01 04 02 202510 M > Finalize moving contract [Link to Gmail]
### 3.1.1. Level 5 Workstream Tags (Optional extension)

* **Purpose:** To group tasks within high-volume L4 Projects (e.g., 2027 W) without creating physical folders.

* **Syntax:** L1 L2 L3 L4 > L5 > Task Description

* **The Logic:**

    * **Dynamic:** Tags are created on the fly based on cluster needs (e.g., : VENUE, : FINANCE).

    * **Consistency:** Always check existing tags in the project before inventing a new one.


### 3.2. Prioritization Logic

Tasks are sorted using a hybrid of Eisenhower (Importance/Urgency) and 1-3-5 (Volume).

* Tagging: A (Do Now), B (Schedule), C (Delegate), D (Delete).
### 3.3. Timeboxing (The "Two-Date Rule")

* The Rule: Never change the Deadline to suit your schedule. Only change the Start Date.
* The Execution:
  * Method A (Preferred/Future): Use the "Task Block" feature in Google Calendar. Click a slot -> Select "Task". This marks you as "Busy" and enables DND.
  * Method B (Fallback): Drag the task from the sidebar to the Calendar to create an Event.
* The Outcome: The "Task" (Intent) becomes a "Time Block" (Commitment).
## 4. Operational Routines

The System requires maintenance to ensure the "Funnel" does not clog.

### 4.1. Daily Routines

* Morning Planning (Start of Day):
  * Review "Frog" (Most important task).
  * Timebox: Assign "Start Times" to your tasks for the day using the Calendar.
* The Shutdown Routine (End of Day):
  * Trigger: Specific end-time (Non-negotiable).
  * Action:
    1. Review Task List (Update status: Done/Pending).
    1. Identify tomorrow's "Frog".
    1. Clear tabs and physical workspace.
    1. Verbalize: "Shutdown Complete".
### 4.2. Weekly Routines (Fri/Sun)

* Review: Look at Week/Month view.
* Clean: Process the Inbox/Keep/Running Notes to Zero.
* Plan: Set objectives for the coming week.
### 4.3. Bi-Weekly Reflection (The "Data" Cycle)

* Frequency: Every 14 days.
* The Philosophy:
  * The Naval Rule: As long as you are doing what you want, it is not a waste of time. But if you are not spending your time doing what you want, and you are not earning, and you are not learning—the system must flag the discrepancy.
  * Action Bias: It is better to do anything toward a goal than nothing at all. Never miss twice; if a habit is interrupted, the priority is to restart the chain immediately.
* Phase 1: The Clinical Audit (Vantage)
  * Action: Ingest raw metrics (Sleep, Finance, Health, or specific activities) into the Vantage agent.
  * Output: The Performance Audit Table.
  * Metric Check: Use the Seinfeld Method to verify "Don't Break the Chain" consistency for habits.
* Phase 2: The Synthesis Reflection (Atlas)
  * The Input: Combine the daily qualitative journals and reflections from the past 14 days with the clinical Vantage table.
  * The Mandate: Atlas analyzes both sources to identify where subjective feelings (qualitative) correlate with objective targets (quantitative) over the larger time period.
  * Pattern Recognition: Identify if "bad days" in the narrative correlate with "Below Target" metrics in the data.
* Phase 3: Realignment
  * Action: Compare the synthesis findings against long-term objectives in the `Goals, Methods and Habits.md` file.
  * Outcome: Identify if current Level 4 Habits are moving the needle on Level 1 and Level 2 Goals, or if the System structure requires adjustment to stay purposeful.


## 5. AI Agent Ecosystem

The System is supported by four specialized agents. Each operates independently but adheres to the same Source of Truth (The LOS).

### 5.1. The System Architect (Legislative & Strategic):

 The Governor. Defines the LOS structure, creates new Context IDs, and interprets complex "Grey Area" logic.

### 5.2. Taskmaster (Executive):

The Doer. Manages Google Tasks. Proactively extracts action items and links them to source material.

### 5.3. The Clerk (Administrative)

The Filer. Categorizes files, emails, and notes. Enforces Naming Conventions and applies Metadata tags.

### 5.4. Vantage (Analytical & Clinical):

The Auditor. Performs precision data analysis and goal assessment. Extracts metrics from structured/unstructured/visual data and maps them to Unique Reference Numbers (URNs). 

Constraint: Strictly clinical and objective; does not provide advice.


### 5.5. Atlas (Reflective & Synthesis): 

The Analyst. Provides strategic reflection by synthesizing qualitative journals with clinical Vantage data. Identifies long-term patterns and ensures daily actions align with high-level goal architecture.



## 6. Digital Asset Management (Google Drive)

This section governs how files are named, stored, and shared to solve the "Relationship vs. Location" problem.

### 6.1. The Principle of Inheritance (The "Local Name" Rule)

We avoid redundant data entry and visual clutter. The Folder hierarchy naturally provides the global context; therefore, folder names must be minimalist.

* **Folder Naming (The "Local Name" Rule):** Folders and Labels must OMIT the parent numerical prefixes. Only use the specific textual name of that node. 
  * *Correct Example:* `04 Finances` > `Purchase` > `Instructions`
  * *Incorrect Example:* `01 04 00 Finances` > `01 04 01 Purchase` > `01 04 01 Instructions` (Massively redundant).
* **File Naming:** Uses the Identifier Logic defined in the Master Asset Naming Protocol (e.g., L4 Context ID or L3 Functional Name + Descriptive Name).
  * *Example:* `202510 M - Moving Contract.pdf`
  * *Incorrect:* `01 04 02 202510 M - Moving Contract.pdf` (Numerical LOS codes are PROHIBITED in filenames).
### 6.2. The "Symlink" Strategy (Shortcuts)

A file must have one "Master Home" but can appear in multiple locations.

* Primary Location: The file lives in its most specific L3 or L4 folder.
* Secondary Locations: Use Drive Shortcuts (Alt + Click or Shift + Z) to place a reference in other relevant folders.
  * Use Case: A "Receipt" lives in 01 04 01 Purchase but has a Shortcut in 01 04 02 House.
### 6.3. Metadata & Search (LOS-Aligned Tagging)

Since "Labels" are not available, use the Description field for tagging.

* The Rule: Tags must mirror the LOS Taxonomy to ensure consistent search results. Do not use random keywords.
* Syntax: #[L4 Context ID] #[L3 Keyword]
  * Primary Tag: Use the exact L4 Context ID (e.g., #202510M, #House, #NCS).
  * Secondary Tag: Use the L3 Parent Name if broad categorization is needed (e.g., #Finances, #Health).
* Action: Right Click File > File Information > Details > Enter hashtags in Description.
* Search: Searching for #202510M instantly retrieves all assets for that project, regardless of which sub-folder they sit in.

### 6.4. Goal Tracking & URN Integrity

This section ensures that performance data is compatible with the Vantage analytical layer.

* The Principle of Traceability: Any file or note intended for performance auditing must be linked to a URN (Unique Reference Number).
* URN Syntax: Use the exact YYYY-X-XXX format as defined in the `Goals, Methods and Habits.md` database.
* Metadata Application: * Right Click File > File Information > Details.
  * Enter the relevant URN hashtag (e.g., #2026-M-001) in the Description field.
* Vantage Readiness: Ensure that CSV exports or PDF statements are placed in the correct L4 Context folder before triggering a Vantage audit to maintain the relational mapping between the metric and the LOS path.

