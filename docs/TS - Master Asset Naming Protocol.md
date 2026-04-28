# Protocol: Master Asset Naming (v2.0)

Status: Active
Governing Authority: The System Architect
Executive Agent: The Clerk

This master protocol governs the naming of all digital assets within the Life Organisation System (LOS). Because different platforms have different constraints, we divide assets into two categories: **Files** (OS-constrained) and **Containers** (Metadata-based).

## 1. The Core Syntax Rule (Files vs. Containers)

- **Google Drive (Files):** MUST use the Hyphen ` - ` separator (Space-Hyphen-Space). 
  - *Reason:* The `>` character is an illegal filename character in Windows/macOS.
- **Google Photos & Gemini (Containers):** MUST use the Greater Than ` > ` separator.
  - *Reason:* It creates a clear visual hierarchy for flat lists and aligns with the Task Syntax.

---

## Part A: Google Drive Files (The Hyphen Protocol)

### A.1. The Identifier Logic (The Prefix)
The "Identifier" is the anchor of the filename. It must be the most specific TEXTUAL value identified. It is the only part of the name that precedes the mandatory ` - ` separator.

1. **L4 Context ID (Priority):** Use if the file relates to a specific Project, Person, or Residence. (e.g., '2027 W', 'Home', 'TS').
2. **L3 Functional Name:** Use if no L4 context exists or is identifiable. (e.g., 'Health', 'Purchase', 'Insurance').
3. **Total Uncertainty:** Use the word 'Unknown'.

**CRITICAL RULE:** Numerical LOS codes (e.g., 01 02 01) and Placeholder codes (e.g., 0X 0Y ZW) are strictly PROHIBITED in filenames. They are reserved exclusively for the Drive Description/Metadata field.

### A.2. Filename Structure
`[Identifier] - [Descriptive Name].[extension]`

#### Date Placement (Identifier vs. Description)
1. **The Date-First Identifier (Event-Based):** Used for Domain 02 (Work) and 01 05 (Projects).
   - Syntax: `[Date] [Name] - [Description]`
   - Example: `201911 Revolut - Employment Contract.pdf`
2. **The Text-First Identifier (Functional-Based):** Used for all other Domains (Health, Purchase, Studies). The Identifier MUST be textual.
   - Syntax: `[Text Identifier] - [YYYYMM] [Description]`
   - Example: `Health - 202604 Dentist Receipt.pdf`

#### Date Format Protocol
- Transactions & Work: `YYYYMM` (e.g., `202405`).
- Academic/General: `YYYY` (e.g., `2009`).
- Date Source Priority: 1. Content Date (inside the file). 2. Metadata Creation Date (fallback).

### A.3. Metadata: The System String
The Drive 'Description' field must contain: `[6-Digit Code] [Context ID] #[Tags]`

#### The Dynamic Archive Protocol (18-Month Rule)
When a file is >18 months old (relative to the current date) and is not 'Evergreen' (like a Passport or Deed):
- Filename Identifier: Remains strictly textual.
- Path Code Syntax: Use the `99` suffix at the L3 level (e.g., `01 04 99`).
- Description Syntax: `[L1][L2] 99 Archive [Identifier] #Archive #[Tags]`

#### The "TBC" Uncertainty Framework
If the content cannot find a 1:1 match in the Categorisation hierarchy:
- Identified Subject, No 6-Digit Match: `[L1-L2] ZW TBC #Uncertain`
- Known Domain, Unknown Function: `[L1] 0Y ZW TBC #Uncertain`
- Total Content Ambiguity: `0X 0Y ZW TBC #Uncertain`
- Unsupported Binary Formats (.exe, .jnt): Rely exclusively on `original_filename` and use ZW logic.

---

## Part B: Google Photos & Gemini (The Container Protocol)

### B.1. Google Photos (Albums)
Albums function as Folders. They must inherit the Full LOS Code to ensure numerical sorting.
- Syntax: `[L1-L3 Code] [L4 Context] > [Description]`
- Examples: 
  - `01 05 01 2027 W > Venue Scouting`
  - `01 05 02 Friends > 2025 Events`

### B.2. Gemini (Conversations)
Conversations are Assets. They must be audited to distinguish "Signal" from "Noise."
- Syntax: `[Code] [Context] > [Topic]`
- Examples:
  - `01 05 01 TS > Naming Protocols`

#### Gemini Audit Execution (For The Clerk)
When requested, The Clerk must triage a conversation:
1. **Path A (DELETE):** Transactional queries, errors, or noise. Recommend deletion.
2. **Path B (EXTRACT & BURN):** Chat has one valuable nugget. Extract it to Memos, then recommend deletion.
3. **Path C (SAVE):** High-value project work or reference.
*Regardless of the Path, The Clerk MUST generate a System-Compliant Container Name.*
