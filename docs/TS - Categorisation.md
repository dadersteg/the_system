# Life Organisation System (LOS) - Taxonomy & Codes

**Status:** Active | **Version:** 2.3 | **Date:** Dec 3, 2025


This document defines the hierarchical structure and codes for the Life Organisation System (LOS), used for categorizing data, entries, goals, actions, and files across all platforms.



## 1. System Structure Overview


The LOS uses a four-level hierarchical structure: L1 > L2 > L3 > L4.


* **L1-L3:** The foundational hierarchy (defined in Section 2). These are represented by a 6-digit code.

* **L4:** The Context ID. This identifies the specific project, person, or topic.


### 1.1. The Standard Identifier
The combination of the L1-L3 Code and the L4 Context ID forms the Standard Identifier. This identifier is used as a prefix for items within the LOS. Specific applications may use different separators following the identifier.

### 1.2. Physical Storage vs. Aggregation Views (Shortcuts)
Because Google Drive enforces a single-parent hierarchy, the LOS utilizes **Shortcuts** to emulate multi-tagging. 
*   **Primary Context (Physical Storage):** A file physically lives in the folder where it is most contextually relevant for active work (e.g., a signed lease lives in `01 05 01 Projects / The Move`).
*   **Aggregation Views [AGGREGATOR]:** Folders tagged as `[AGGREGATOR]` are used for cross-cutting master lists (e.g., all contracts across all projects). The Drive Clerk will place a Google Drive *Shortcut* in these folders, pointing to the original file.

---


## 2. The Core Hierarchy (L1 - L3)

The immutable skeleton of the system.




### 01 00 00 Private

* **01 01 00 Personal Admin**

   * 01 01 01 Task Management 

   * 01 01 02 Contracts [AGGREGATOR]

* **01 02 00 Health**

    * 01 02 01 Physical Health

    * 01 02 02 Mental Health

* **01 03 00 Personal Growth**

    * 01 03 01 Principles, Goals & Methods

    * 01 03 02 Reflection

    * 01 03 03 Personal Growth Theory

* **01 04 00 Finances**

    * 01 04 01 Purchase [AGGREGATOR]

    * 01 04 02 House

* **01 05 00 Other**

    * 01 05 01 Projects

    * 01 05 02 Relationships

    * 01 05 03 Collections


### 02 00 00 Work

* **02 01 00 Employment** 

    * 02 01 01 Quantum 21

* **02 02 00 Career Management**

* **02 03 00 Collections**


### 03 00 00 Studies

## 03 XX 00 Institutions

- 03 01 00 Östra Real

- 03 02 00 Uppsala University

- 03 03 00 Stockholms Nation


## 03 02 00 Uppsala University Years

- 03 02 01 År 1 | (2009-2010)

- 03 02 02 År 2 | (2010-2011)

- 03 02 03 År 3 | (2011-2012)

- 03 02 04 År 4 | (2012, 2014)

- 03 02 05 År 5 | (2014-2015) 

---


## 3. Active Contexts (L4)

**Rule:** Files generally reside in folders named simply by the Context (e.g., "75006"). The L1-L3 code is applied via **Metadata/Description** for searchability.

### 3.1. Sub-Context Hierarchies (L5+) - "The Flesh"
While L1-L4 represent the strict, AI-navigable "Skeleton" of the system, **L5 and below represent the flexible "Flesh".**
*   **The Drop Zone:** Automated agents (The Clerk) will only ever route files to the root of an L4 context folder. 
*   **Human Flexibility:** If an L4 folder becomes cluttered, you are free to manually create L5 subfolders (e.g., `Reference Material`, `Invoices`, `Drafts`). 
*   **Rule of Thumb:** L5 folders should be generic groupings. If you need to create a highly specific L5 folder, it likely needs to be escalated to a brand new L4 project node. Never place an L4 node inside another L4 node.


### 01 01 01 Task Management (Standing Contexts)

| Code | Description |
| :--- | :--- |
| **Productivity Frameworks** | Methodologies, templates, and systems for task execution. |
| **The System (TS)** | LOS maintenance, architecture, and prompt engineering. |

### 01 01 02 Contracts (Standing Contexts)

| Code | Description |
| :--- | :--- |
| **Signature** | Active documents pending signature or recently executed. |

### 01 02 01 Physical Health (Standing Contexts)

| Code | Description |
| :--- | :--- |
| **Medical Appointments & Tests** | Ongoing medical appointments, blood tests (BT), and health tracking. |

### 01 04 00 Finances (Standing Contexts)

| Code | Description |

| :--- | :--- |

| **Banking** | Standard accounts and bank statements. |

| **Budgeting & Planning** | Financial planning, budgets, and subscriptions. |

| **Crypto** | Cryptocurrency holdings. |

| **Insurance** | Policies and claims. |

| **Investing** | General investment documents (Broad context). |

| **Payslips** | Income records. |

| **Pension** | Long-term savings. |

| **Revolut Equity** | Revolut shareholdings. |

| **Tax** | Returns and correspondence. |


### 01 04 01 Purchase

| Code | Description |

| :--- | :--- |

| **Instructions** | Manuals and user guides. |

| **Passes & Tickets** | Active travel/event documents. |

| **Receipts** | General purchase receipts. |


### 01 04 02 House

| Code | Description |

| :--- | :--- |

| **SW1V 4QE** | Current residence (London). |

### 01 05 01 Projects (Active)

*Includes time-bound projects AND active areas of responsibility.*

| Code | Description |

| :--- | :--- |

| **AI** | Artificial Intelligence initiatives. |

| **20260509 LFC-CFC** | **Project: Trip to Liverpool.** Liverpool FC vs Chelsea FC game. |

| **20260510-20260514 Lisbon** | **Project: Trip to Lisbon.** May 10-14, 2026. |

| **202606 P&E** | **Project: Wedding for Pontus & Emilia.** June 2026. |

| **202608 M&N** | **Project: Wedding for Mimmi & Nils.** August 2026. |

| **Clothes** | Wardrobe management. |

| **Cooking** | Recipes and meal planning. |

| **Declutter** | Physical/Digital cleanup. |

| **2027 W** | **Project: Wedding Celebration.** Wedding party/events (2027). |

| **202604-202605 Staycation** | Project: Staycation/spend quality time with Carry during my gardening leave |  

| **Upgrade Office** | Project: Home office setup and improvements. |


| **Colab Notebooks** | Active coding/notebook projects. |


### 01 05 02 Relationships

| Code | Description |

| :--- | :--- |

| **Alexander & Gabriel** | Brothers. |

| **CMA** | Carry Martens Adersteg. |

| **Mamma & Pappa** | Parents. |


### 01 05 03 Collections (Passive)

*Includes collections, fandoms, and static reference.*

| Code | Description |

| :--- | :--- |

| **Liverpool FC** | Football/Interest. |

| **Star Wars** | Collection/Interest. |

| **Useful/Helpful** | Useful information, tools, software setups, tips and tricks |

| **Data** | Data exports, backups, and dumps. |

| **Memories** | Photos, keepsakes, and personal historical data. |

| **History** | Actual world history, historical events, and general reference. |

| **Newsletters** | Subscribed newsletters and general reading material. |

---

### 02 01 01 Quantum 21

*Active employment (also referred to as Playmetech). Categories mimic the 01 Private L2 structure.*

| Code | Description |
| :--- | :--- |
| **01 Professional Admin** | Work-related admin, IT setup, policies. (Cross-links to Personal Admin). |
| **02 Team & Operations** | 1-on-1s, team building, internal processes, and company culture. |
| **03 Professional Growth** | Upskilling, training, and performance reviews relevant to Q21. |
| **04 Finances** | Work-related expenses, benefits, and payslips. (Cross-links to Personal Finance). |
| **05 Projects** | Active Q21 work projects (metadata, notes, non-confidential docs). |

### 02 02 00 Career Management (Standing Contexts)

*Includes standing contexts as well as active job opportunities using the YYYYMM format.*

| Code | Description |
| :--- | :--- |
| **CVs & Cover Letters** | Active resumes and application templates. |
| **Grades & Certificates** | Proof of employment, transcripts, and certifications. |
| **202603 Airwallex** | **Active Application:** Job application and interview process. |
| **202604 Deel** | **Active Application:** Job application and interview process. |
| **202603 OLIX** | **Active Application:** Job application and interview process. |

---

### 02 03 00 Collections (Standing Contexts)

| Code | Description |
| :--- | :--- |
| **Newsletters** | Professional and work-related newsletters. |

---

## 4. Archival Domain (The Cold Layer)

The `99` suffix at the L3 level designates a record as "Archived." These files are retained for historical purposes but are no longer active in the current 18-month life cycle. A file is moved to this layer if it is >18 months old, is not "Evergreen," and does not fit an active L4 Project.


## 01 XX 99 Personal Archive

- **01 01 99 Archive:** Expired contracts, old ID copies, former address records.

- **01 02 99 Archive:** Old prescriptions, settled medical bills, completed therapy records.

- **01 03 99 Archive:** Old reflection journals, deprecated goals, past frameworks.

- **01 04 99 Archive:** Statements from closed accounts, old tax returns (>7 years), receipts for discarded items.

- **01 05 99 Archive:** Documentation from completed or abandoned L4 projects, old relationships, past interests.

## 02 XX 99 Work Archive

- **02 01 99 Archive:** Historical records from former employers and companies (e.g., Deloitte, Revolut).

### 03 00 99 Studies Archive

- **03 00 99 Archive:** Historical course materials, old notes, and past assignments.


### 4.1. Archive (L4)

**Rule:** Dormant contexts. Folders are moved to `01 XX 99 Archive`.

| Parent | Code | Original Description | Status |
| :--- | :--- | :--- | :--- |
| 01 04 02 | **75006** | Residence (Paris). | **Closed** |
| 01 04 01 | **NCS** | Nordea Close Services. | **Closed** (Downgraded to Task) |
| 01 04 02 | **202510 M** | The Move (To Paris). | **Closed** |
| 01 04 02 | **W23DY** | London Flat (Previous). | **Closed** |
| 01 05 01 | **2025 W** | Wedding & Engagement Dinners. | **Closed** (See 2027 W) |
| 01 05 01 | **UKC** | UK Citizenship/Visa. | **Closed/Dormant** |
| 01 05 01 | **Blackjack** | Hobby/Skill development. | **Closed** |
| 01 05 01 | **2025 09 Visa** | Carry's Visa Application. | **Closed** |
| 01 05 01 | **2025 Xmas** | **Project: Christmas 2025.** Gifts, logistics, events, and food planning. | **Closed** |
| 01 05 01 | **202601 M** | The Move (Jan 2026 - Project view). | **Closed** |
| 01 05 01 | **20260411 Housewarming C&D** | Project: Housewarming event planning. | **Closed** |
| 02 01 99 | **201102 S&P** | Historical Employment | **Closed** |
| 02 01 99 | **201108 Sveriges Ingenjörer** | Historical Employment | **Closed** |
| 02 01 99 | **201312 Nova 100** | Historical Employment | **Closed** |
| 02 01 99 | **201406 Brooklyn OpCo** | Historical Employment | **Closed** |
| 03 00 99 | **Stockholms Nation** | Historical Studies | **Closed** |
| 03 00 99 | **Uppsala University** | Historical Studies | **Closed** |
| 02 01 99 | **201508 Deloitte** | Historical Employment | **Closed** |
| 02 01 99 | **201611 Efficio** | Historical Employment | **Closed** |
| 02 01 99 | **201908 Inverto** | Historical Employment | **Closed** |
| 02 01 99 | **201911 Revolut** | Historical Employment | **Closed** |
| 01 05 99 | **20200605-20200608 Lisbon** | Historical Project | **Closed** |
| 01 05 99 | **20200611 Nice** | Historical Project | **Closed** |
| 01 05 99 | **20200730-20200809 Tokyo** | Historical Project | **Closed** |
| 01 05 99 | **20200812-20200816 - Stockholm** | Historical Project | **Closed** |
| 01 05 99 | **20200829-20200902 Mykonos** | Historical Project | **Closed** |
| 01 05 99 | **20200925-20200927 D&L 30th** | Historical Project | **Closed** |
| 01 05 99 | **20210708 Bröllop** | Historical Project | **Closed** |
| 01 05 99 | **20220610-20220610 R & H** | Historical Project | **Closed** |
| 01 05 99 | **Alex** | Historical Project | **Closed** |
| 01 05 99 | **Amy** | Historical Project | **Closed** |
| 01 05 99 | **Daff** | Historical Project | **Closed** |
| 01 05 99 | **Körkort** | Historical Project | **Closed** |

## 5. System & Operational Tags

These tags are used strictly for triage, automation pipelines, and system maintenance. They do not represent permanent knowledge categories.

### 00 System Triage (Incoming/Rules)
* **00 Manual Review:** Items that the automated pipelines could not confidently categorize and require human intervention.
* **00 No Filter:** Raw incoming items that intentionally bypass standard automated filtering rules.
* **00 Test:** Safe sandbox label used for testing automations, scripts, and Gem workflows without affecting real data.

### 99 System Operational (Processing & Deletion)
* **99 Google Comments:** Automated notifications from Google Docs/Drive that require a quick read but no permanent storage.
* **99 Label_Reviewed:** A vital system flag applied by the Apps Scripts to indicate an item has been successfully processed and should not be analyzed again in the next batch.
* **99 SMS:** Funnel endpoint for incoming routed SMS messages awaiting processing or task extraction.
* **99 Telegram:** Funnel endpoint for incoming routed Telegram messages awaiting processing or task extraction.
* **99 WhatsApp:** Funnel endpoint for incoming routed WhatsApp messages awaiting processing or task extraction.
* **99 To be deleted:** Temporary storage and the purge queue. Items that are needed briefly or marked for the next automated/manual trash cycle.

### Routing Tags (Legacy & Alias Emails)
Operational tags applied to emails forwarded or routed from secondary addresses to ensure source traceability.
* **danieladersteg@hotmail.com**
* **danieladerstegov@hotmail.com**
* **daniel@martens-adersteg.com**
* **d.a.xov@live.se**
* **erik.patrik555@gmail.com**

