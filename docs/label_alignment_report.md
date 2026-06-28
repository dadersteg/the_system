# Life Organisation System (LOS) - Gmail Labels Alignment Report

## Section 1: Bottom Line Up Front (BLUF)

The Gmail label system for the Life Organisation System (LOS) is currently in a hybrid/transitional state containing legacy, duplicate, and misaligned labels. To achieve complete compliance with the current LOS Taxonomy (Version 2.3), immediate action is required across **125 items**:

*   **108 Gmail labels must be renamed** to correct naming format discrepancies (primarily migrating legacy 2-digit codes to the standard 6-digit structure, correcting academic subcategories, and repairing system tag typos).
*   **12 expected taxonomy labels must be created** in Gmail to ensure complete coverage for active studies and operational categories.
*   **4 unrecognized or redundant labels must be deleted** after ensuring any active emails are migrated to their correct paths.
*   **1 operational email routing tag must be retained** (`daniel.adersteg@revolut.com`) and documented in the taxonomy rules.
*   **3 structural amendments** are proposed to align the core rules file (`TS - Categorisation (Private).md`) with active operations (adding the Revolut routing tag, standardising the `Useful` context alias, and defining a legacy purge policy).

### Summary of Remediation Actions

| Action Type | Count | Scope / Key Focus Areas |
| :--- | :---: | :--- |
| **Rename** | 108 | Migrate 97 legacy 2-digit paths to 6-digit codes; fix 9 hierarchy and academic category structures (excluding deletes); fix 2 system tag typos (`98 WhatsApp`, `99 Delete`). |
| **Create** | 12 | Establish missing L2, L3, and L4 paths in Gmail to mirror the taxonomy JSON (e.g., Östra Real, Uppsala University parent nodes, and Playmetech Admin). |
| **Delete** | 4 | Remove obsolete/unrecognised root categories (`01 Private`, `03 Studies`), redundant intermediate studies folder (`03 00 00 Studies/03 00 00`), and the combined comma-separated export artifact (`99 To be deleted, 01 Private/04 Finances/01 Purchase`). |
| **Retain** | 1 | Retain the active operational routing tag `daniel.adersteg@revolut.com` and document it in the taxonomy rules. |
| **Taxonomy Proposals** | 3 | Authorise additions/modifications to `TS - Categorisation (Private).md` to formalise active configurations. |
| **Total Actions** | **128** | **Comprehensive system alignment and cleanup.** |

---

## Section 2: Core Analysis & Key Pillars of Alignment

Supporting the bottom-line findings, the discrepancies fit into five main structural alignment pillars:

### Pillar 1: Legacy 2-Digit Hierarchy Elimination
*   **The Issue:** A parallel structure exists where 97 labels use the legacy format (e.g., `01 Private/...`, `02 Work/...`, `03 Studies/...`) instead of the standard 6-digit prefix (e.g., `01 00 00 Private/...`). This causes duplication, human error in manual tagging, and failures in automated script parsing.
*   **The Remedy:** Rename all 97 legacy labels to their 6-digit equivalents. Once emails have been migrated, delete the empty legacy root folders.

### Pillar 2: Standardisation of Academic Studies Categories
*   **The Issue:** The Studies category (`03 00 00`) contains severe naming mismatches. The institution node code `03 02 00` is missing its name segment `Uppsala University` (present in Gmail only as `03 00 00 Studies/03 02 00`), which has cascaded down to all its child academic year sublabels. Additionally, duplicate/redundant nesting exists (`03 00 00 Studies/03 00 00/03 00 99 Studies Archive`).
*   **The Remedy:** Rename the parent and child labels to correctly include the `Uppsala University` name segment, delete the redundant intermediate `03 00 00` level, and create missing parent nodes.

### Pillar 3: Typo Correcting on System & Operational Tags
*   **The Issue:** Automated channels (WhatsApp script and purge queue) reference misnamed labels (`98 WhatsApp` instead of `99 WhatsApp`, and `99 Delete` instead of `99 To be deleted`).
*   **The Remedy:** Rename these system tags to match the exact spelling defined in the operational rules.

### Pillar 4: L4 Context Standardisation
*   **The Issue:** Specific L4 contexts have diverged from the taxonomy. Playmetech's admin folder is named `01 Playmetech Admin` instead of `01 Playmetech Admin`. The Collections context is named `Useful` or `Useful & Helpful` instead of `Useful/Helpful`.
*   **The Remedy:** Rename the Playmetech admin label, and standardise/rename the Useful labels to `Useful/Helpful` (pending taxonomy amendment approval).

### Pillar 5: Implementation of 12 Missing Taxonomy Nodes
*   **The Issue:** 12 taxonomy nodes defined in the JSON configuration (including `03 01 00 Östra Real`, `03 03 00 Stockholms Nation`, and several Uppsala University academic years) do not exist in Gmail.
*   **The Remedy:** Create these 12 missing paths to achieve parity between the taxonomy definitions and Gmail.

---

## Section 3: Detailed Gmail Label Remediation Recommendations

This section provides the complete, granular list of all 113 discrepant Gmail labels with objective, actionable recommendations.

### 3.1 Code/Name Mismatch (Typo/Case) (2 entries)

| Current Gmail Label | Issue / Reason | Actionable Recommendation |
| :--- | :--- | :--- |
| `98 WhatsApp` | Typo in system tag: '98' code should be '99' | **Rename** to `99 WhatsApp` |
| `99 Delete` | Typo in system tag: 'Delete' should be 'To be deleted' | **Rename** to `99 To be deleted` |

### 3.2 Hierarchy & Naming Violations (11 entries)

| Current Gmail Label | Issue / Reason | Actionable Recommendation |
| :--- | :--- | :--- |
| `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Useful` | Undocumented L4 context name; expected `Useful/Helpful` | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Useful/Helpful` |
| `02 00 00 Work/02 01 00 Employment/02 01 01 Playmetech/01 Playmetech Admin` | L4 Name mismatch: should be `01 Playmetech Admin` | **Rename** to `02 00 00 Work/02 01 00 Employment/02 01 01 Playmetech/01 Playmetech Admin` |
| `03 00 00 Studies/03 00 00` | Duplicate redundant intermediate L2 level | **Delete** label (after migrating contents, if any) |
| `03 00 00 Studies/03 00 00/03 00 99 Studies Archive` | Redundant nested path | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive` |
| `03 00 00 Studies/03 02 00` | Missing name segment `Uppsala University` for code `03 02 00` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University` |
| `03 00 00 Studies/03 02 00/03 02 01 År 1 \| (2009-2010)` | Missing parent name segment `Uppsala University` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 01 År 1 \| (2009-2010)` |
| `03 00 00 Studies/03 02 00/03 02 02 År 2 \| (2010-2011)` | Missing parent name segment `Uppsala University` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 02 År 2 \| (2010-2011)` |
| `03 00 00 Studies/03 02 00/03 02 03 År 3 \| (2011-2012)` | Missing parent name segment `Uppsala University` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 03 År 3 \| (2011-2012)` |
| `03 00 00 Studies/03 02 00/03 02 04 År 4 \| (2012, 2014)` | Missing parent name segment `Uppsala University` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 04 År 4 \| (2012, 2014)` |
| `03 00 00 Studies/03 02 00/03 02 05 År 5 \| (2014-2015)` | Missing parent name segment `Uppsala University` | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 05 År 5 \| (2014-2015)` |
| `99 To be deleted, 01 Private/04 Finances/01 Purchase` | Invalid format; comma-separated export artifact | **Delete** label (migrate active emails, if any, to correct paths) |

### 3.3 Legacy 2-Digit Format Conversion (97 entries)

| Legacy Gmail Label | Reason | Actionable Recommendation |
| :--- | :--- | :--- |
| `01 Private/01 Personal Admin` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin` |
| `01 Private/01 Personal Admin/01 Task Management` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 01 Task Management` |
| `01 Private/01 Personal Admin/01 Task Management/Productivity Frameworks` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 01 Task Management/Productivity Frameworks` |
| `01 Private/01 Personal Admin/01 Task Management/The System (TS)` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 01 Task Management/The System (TS)` |
| `01 Private/01 Personal Admin/02 Contracts` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 02 Contracts` |
| `01 Private/01 Personal Admin/02 Contracts/Signature` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 02 Contracts/Signature` |
| `01 Private/01 Personal Admin/99 Archive` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 99 Archive` |
| `01 Private/02 Health` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 02 00 Health` |
| `01 Private/02 Health/01 Physical Health` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 02 00 Health/01 02 01 Physical Health` |
| `01 Private/02 Health/01 Physical Health/2026 Pregnancy` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 02 00 Health/01 02 01 Physical Health/2026 Pregnancy` |
| `01 Private/02 Health/01 Physical Health/Medical Appointments & Tests` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 02 00 Health/01 02 01 Physical Health/Medical Appointments & Tests` |
| `01 Private/02 Health/02 Mental Health` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 02 00 Health/01 02 02 Mental Health` |
| `01 Private/03 Personal Growth` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 03 00 Personal Growth` |
| `01 Private/03 Personal Growth/01 Principles, Goals & Methods` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 03 00 Personal Growth/01 03 01 Principles, Goals & Methods` |
| `01 Private/03 Personal Growth/02 Reflection` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 03 00 Personal Growth/01 03 02 Reflection` |
| `01 Private/03 Personal Growth/03 Personal Growth Theory` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 03 00 Personal Growth/01 03 03 Personal Growth Theory` |
| `01 Private/03 Personal Growth/99 Archive` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 03 00 Personal Growth/01 03 99 Archive` |
| `01 Private/04 Finances` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances` |
| `01 Private/04 Finances/01 Purchase` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 01 Purchase` |
| `01 Private/04 Finances/01 Purchase, 01 Private/02 Health/02 Mental Health` | Comma-separated export error; contains legacy 2-digit path | **Rename/Split** into `01 00 00 Private/01 04 00 Finances/01 04 01 Purchase` and `01 00 00 Private/01 02 00 Health/01 02 02 Mental Health` |
| `01 Private/04 Finances/01 Purchase/Instructions` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 01 Purchase/Instructions` |
| `01 Private/04 Finances/01 Purchase/Passes & Tickets` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 01 Purchase/Passes & Tickets` |
| `01 Private/04 Finances/01 Purchase/Receipts` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 01 Purchase/Receipts` |
| `01 Private/04 Finances/02 House` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 02 House` |
| `01 Private/04 Finances/02 House/SW1V 4QE` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 02 House/SW1V 4QE` |
| `01 Private/04 Finances/99 Archive` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 04 00 Finances/01 04 99 Archive` |
| `01 Private/04 Finances/Banking` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Banking` |
| `01 Private/04 Finances/Budgeting & Planning` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Budgeting & Planning` |
| `01 Private/04 Finances/Crypto` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Crypto` |
| `01 Private/04 Finances/Insurance` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Insurance` |
| `01 Private/04 Finances/Investing` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Investing` |
| `01 Private/04 Finances/Payslips` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Payslips` |
| `01 Private/04 Finances/Pension` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Pension` |
| `01 Private/04 Finances/Revolut Equity` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Revolut Equity` |
| `01 Private/04 Finances/Services & Subscriptions` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Services & Subscriptions` |
| `01 Private/04 Finances/Tax` | Legacy 2-digit L1/L2 format (skips L3) | **Rename** to `01 00 00 Private/01 04 00 Finances/Tax` |
| `01 Private/05 Other` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other` |
| `01 Private/05 Other/01 Projects` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects` |
| `01 Private/05 Other/01 Projects/202604-202605 Staycation` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/202604-202605 Staycation` |
| `01 Private/05 Other/01 Projects/20260411 Housewarming C&D` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20260411 Housewarming C&D` |
| `01 Private/05 Other/01 Projects/20260509 LFC-CFC` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/20260509 LFC-CFC` |
| `01 Private/05 Other/01 Projects/20260510-20260514 Lisbon` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/20260510-20260514 Lisbon` |
| `01 Private/05 Other/01 Projects/202606 P&E` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/202606 P&E` |
| `01 Private/05 Other/01 Projects/202606 Passport` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/202606 Passport` |
| `01 Private/05 Other/01 Projects/202608 M&N` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/202608 M&N` |
| `01 Private/05 Other/01 Projects/2027 Wedding` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/2027 Wedding` |
| `01 Private/05 Other/01 Projects/AI` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/AI` |
| `01 Private/05 Other/01 Projects/Clothes` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/Clothes` |
| `01 Private/05 Other/01 Projects/Cooking` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/Cooking` |
| `01 Private/05 Other/01 Projects/Data Analysis & Software Development` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/Data Analysis & Software Development` |
| `01 Private/05 Other/01 Projects/Declutter` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/Declutter` |
| `01 Private/05 Other/01 Projects/The System (TS)` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 01 00 Personal Admin/01 01 01 Task Management/The System (TS)` |
| `01 Private/05 Other/01 Projects/Upgrade Office` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 01 Projects/Upgrade Office` |
| `01 Private/05 Other/02 Relationships` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships` |
| `01 Private/05 Other/02 Relationships/Alexander & Gabriel` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships/Alexander & Gabriel` |
| `01 Private/05 Other/02 Relationships/CMA` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships/Carry Martens Adersteg` |
| `01 Private/05 Other/02 Relationships/Mamma & Pappa` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships/Mamma & Pappa` |
| `01 Private/05 Other/02 Relationships/Messages` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships/Messages` |
| `01 Private/05 Other/02 Relationships/Niklas Johansson` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 02 Relationships/Niklas Johansson` |
| `01 Private/05 Other/03 Collections` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections` |
| `01 Private/05 Other/03 Collections/Data` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Data` |
| `01 Private/05 Other/03 Collections/History` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/History` |
| `01 Private/05 Other/03 Collections/Liverpool FC` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Liverpool FC` |
| `01 Private/05 Other/03 Collections/Memories` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Memories` |
| `01 Private/05 Other/03 Collections/Newsletters` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Newsletters` |
| `01 Private/05 Other/03 Collections/Newsletters, 01 Private/05 Other/01 Projects/AI` | Comma-separated export error; contains legacy 2-digit path | **Rename/Split** into `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Newsletters` and `01 00 00 Private/01 05 00 Other/01 05 01 Projects/AI` |
| `01 Private/05 Other/03 Collections/Star Wars` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Star Wars` |
| `01 Private/05 Other/03 Collections/Useful & Helpful` | Legacy 2-digit L1/L2 format; uses old alias spelling | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Useful/Helpful` |
| `01 Private/05 Other/03 Collections/Useful/Helpful` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 03 Collections/Useful/Helpful` |
| `01 Private/05 Other/99 Archive` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive` |
| `01 Private/05 Other/99 Archive/20200605-20200608 Lisbon` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200605-20200608 Lisbon` |
| `01 Private/05 Other/99 Archive/20200611 Nice` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200611 Nice` |
| `01 Private/05 Other/99 Archive/20200730-20200809 Tokyo` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200730-20200809 Tokyo` |
| `01 Private/05 Other/99 Archive/20200812-20200816 - Stockholm` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200812-20200816 - Stockholm` |
| `01 Private/05 Other/99 Archive/20200829-20200902 Mykonos` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200829-20200902 Mykonos` |
| `01 Private/05 Other/99 Archive/20200925-20200927 D&L 30th` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20200925-20200927 D&L 30th` |
| `01 Private/05 Other/99 Archive/20210708 Bröllop` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20210708 Bröllop` |
| `01 Private/05 Other/99 Archive/20220610-20220610 R & H` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20220610-20220610 R & H` |
| `01 Private/05 Other/99 Archive/2025 09 Visa` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/2025 09 Visa` |
| `01 Private/05 Other/99 Archive/20260411 Housewarming C&D` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/20260411 Housewarming C&D` |
| `01 Private/05 Other/99 Archive/Alex` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/Alex` |
| `01 Private/05 Other/99 Archive/Amy` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/Amy` |
| `01 Private/05 Other/99 Archive/Daff` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/Daff` |
| `01 Private/05 Other/99 Archive/Körkort` | Legacy 2-digit L1/L2 format | **Rename** to `01 00 00 Private/01 05 00 Other/01 05 99 Archive/Körkort` |
| `02 Work/02 Career Management` | Legacy 2-digit L1/L2 format | **Rename** to `02 00 00 Work/02 02 00 Career Management` |
| `02 Work/03 Collections/Newsletters` | Legacy 2-digit L1/L2 format | **Rename** to `02 00 00 Work/02 03 00 Collections/Newsletters` |
| `03 Studies/01 År 1 \| (2009-2010)` | Legacy L1, missing university parent node | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 01 År 1 \| (2009-2010)` |
| `03 Studies/02 År 2 \| (2010-2011)` | Legacy L1, missing university parent node | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 02 År 2 \| (2010-2011)` |
| `03 Studies/03 År 3 \| (2011-2012)` | Legacy L1, missing university parent node | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 03 År 3 \| (2011-2012)` |
| `03 Studies/04 År 4 \| (2012, 2014)` | Legacy L1, missing university parent node | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 04 År 4 \| (2012, 2014)` |
| `03 Studies/05 År 5 \| (2014-2015)` | Legacy L1, missing university parent node | **Rename** to `03 00 00 Studies/03 02 00 Uppsala University/03 02 05 År 5 \| (2014-2015)` |
| `03 Studies/99 Archive` | Legacy L1, missing Studies Archive parent structure | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive` |
| `03 Studies/99 Archive/Stockholms Nation` | Legacy L1, missing Studies Archive parent structure | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive/Stockholms Nation` |
| `03 Studies/99 Archive/Uppsala University` | Legacy L1, missing Studies Archive parent structure | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive/Uppsala University` |
| `03 Studies/99 Studies Archive` | Legacy L1 format | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive` |
| `03 Studies/99 Studies Archive/Stockholms Nation` | Legacy L1 format | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive/Stockholms Nation` |
| `03 Studies/99 Studies Archive/Uppsala University` | Legacy L1 format | **Rename** to `03 00 00 Studies/03 00 99 Studies Archive/Uppsala University` |

### 3.4 Undocumented Routing Tag (1 entry)

| Current Gmail Label | Issue / Reason | Actionable Recommendation |
| :--- | :--- | :--- |
| `daniel.adersteg@revolut.com` | Active operational email address routing tag, but not documented in rules | **Retain** label; update rules to document this active address (see Section 5 Proposal 1) |

### 3.5 Unrecognized Root Labels (2 entries)

These labels represent obsolete root categories that have been replaced by 6-digit codes. They should be removed once their contents are fully migrated.

| Current Gmail Label | Issue / Reason | Actionable Recommendation |
| :--- | :--- | :--- |
| `01 Private` | Legacy root category, replaced by `01 00 00 Private` | **Delete** label (after migrating child sublabels and remaining emails) |
| `03 Studies` | Legacy root category, replaced by `03 00 00 Studies` | **Delete** label (after migrating child sublabels and remaining emails) |

---

## Section 4: Missing Taxonomy Entries to be Created in Gmail

The following 12 taxonomy nodes are specified in the system configuration JSON files or in `TS - Categorisation (Private).md` but are missing from Gmail. They must be created to ensure the automated filing systems function correctly.

### 4.1 Missing L2 Entries (3 entries)

| Target Gmail Label Path | Description / Source | Actionable Recommendation |
| :--- | :--- | :--- |
| `03 00 00 Studies/03 01 00 Östra Real` | High school institution category | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University` | University institution parent category | **Create** label |
| `03 00 00 Studies/03 03 00 Stockholms Nation` | Student nation parent category | **Create** label |

### 4.2 Missing L3 Entries (6 entries)

| Target Gmail Label Path | Description / Source | Actionable Recommendation |
| :--- | :--- | :--- |
| `03 00 00 Studies/03 00 99 Studies Archive` | Master archive directory for Studies | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University/03 02 01 År 1 \| (2009-2010)` | First year university course material | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University/03 02 02 År 2 \| (2010-2011)` | Second year university course material | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University/03 02 03 År 3 \| (2011-2012)` | Third year university course material | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University/03 02 04 År 4 \| (2012, 2014)` | Fourth year university course material | **Create** label |
| `03 00 00 Studies/03 02 00 Uppsala University/03 02 05 År 5 \| (2014-2015)` | Fifth year university course material | **Create** label |

### 4.3 Missing L4_active / L4_archive Entries (3 entries)

| Target Gmail Label Path | Description / Source | Actionable Recommendation |
| :--- | :--- | :--- |
| `02 00 00 Work/02 01 00 Employment/02 01 01 Playmetech/01 Playmetech Admin` | Active employment admin sub-context | **Create** label |
| `03 00 00 Studies/03 00 99 Studies Archive/Stockholms Nation` | Archival records for student nation activities | **Create** label |
| `03 00 00 Studies/03 00 99 Studies Archive/Uppsala University` | Archival records for university coursework | **Create** label |

---

## Section 5: Proposed Structural Taxonomy Amendments

To keep the Life Organisation System MECE and fully aligned with operational realities, we propose the following structural amendments as System Architect and Clerk. *Note: Core taxonomy files in `docs/` have not been edited directly. These proposals require user authorization prior to implementation.*

### Proposal 1: Formalise the `daniel.adersteg@revolut.com` Routing Tag
*   **Context:** An active Gmail label exists for `daniel.adersteg@revolut.com`. This represents historical and forwarded professional communications from the user's corporate tenure at Revolut. It is functionally a "Secondary/Alias Email" routing tag, but it is currently undocumented under Section 5 'Routing Tags' in `TS - Categorisation (Private).md`.
*   **Proposal:** Add `- daniel.adersteg@revolut.com` to the list of Routing Tags in Section 5 of `TS - Categorisation (Private).md` to formalise it as an active system routing tag.

### Proposal 2: Resolve the `Useful` Context / `Useful/Helpful` Naming Alias
*   **Context:** The physical Gmail label path has been set up as `Useful` under the Collections structure. However, the system taxonomy defines the standard category as `Useful/Helpful`. This creates a mismatch for automated parsing scripts which expect strict character matches.
*   **Proposal:** Formalise one of two paths:
    1.  **Strict Match:** Rename the physical Gmail label to `Useful/Helpful` (recommended for taxonomy strictness).
    2.  **Alias Mapping:** Add `Useful` as an official documented alias for the `Useful/Helpful` category in Section 3 of `TS - Categorisation (Private).md`.

### Proposal 3: Adopt a Systematic Purge/Migration Plan for Legacy 2-Digit Labels
*   **Context:** The existence of 98 legacy 2-digit labels (e.g. `01 Private`) alongside 6-digit paths creates duplication and potential sorting errors.
*   **Proposal:** Implement an automated cleanup script to run a one-time migration that:
    1.  Identifies all emails tagged with a legacy 2-digit label.
    2.  Applies the correct 6-digit equivalent label to those emails.
    3.  Removes the legacy 2-digit label from the email and deletes the legacy label from Gmail.

---

## Section 6: Google Apps Script Code Conflicts (Critical Regression Warning)

During audit verification, we identified critical code conflicts in the active Google Apps Script environment that must be resolved prior to renaming Gmail labels. If left unaddressed, these scripts will revert structural label changes and cause operational failures.

### 6.1 Infinite Regression Loop in `Code_ListLabels.js`
*   **Location:** `/Users/daniel/Documents/AGY/the_system/src/Code_ListLabels.js` (lines 147–198)
*   **The Issue:** The function `migrateDuplicateGmailLabels()` actively scans all user labels. If it encounters a label with a 6-digit prefix structure (e.g., starting with `"01 00 00 Private"`), it treats it as a duplicate path, migrates any associated email threads back to the legacy 2-digit label (e.g., `"01 Private"`), and deletes the 6-digit label.
*   **The Danger:** Running the proposed Gmail label alignment to rename labels to their correct 6-digit paths while this script is active will trigger an infinite regression loop. The renaming tool or user will create/rename labels to 6-digit codes, and this script will promptly revert them to legacy 2-digit labels and delete the 6-digit ones.
*   **Actionable Recommendation:** Refactor or completely disable/remove `migrateDuplicateGmailLabels()` in `Code_ListLabels.js` before executing any label renaming activities.

### 6.2 Hardcoded Legacy Default in `Code_TheClerk_Photo_Sync.js`
*   **Location:** `/Users/daniel/Documents/AGY/the_system/src/Code_TheClerk_Photo_Sync.js` (line 90)
*   **The Issue:** The script hardcodes a fallback category `"01 Private/05 Other"` when appending photo metadata rows to the Photo Register if no category is resolved from the analysis:
    ```javascript
    img.analysis.category || "01 Private/05 Other",
    ```
*   **The Danger:** If the Gmail labels are renamed, the legacy `"01 Private/05 Other"` label will no longer exist (or will be obsolete), leading to data inconsistency in the Photo Register or failures in downstream sorting automation.
*   **Actionable Recommendation:** Update line 90 in `Code_TheClerk_Photo_Sync.js` to reference the aligned 6-digit folder path:
    ```javascript
    img.analysis.category || "01 00 00 Private/01 05 00 Other",
    ```
