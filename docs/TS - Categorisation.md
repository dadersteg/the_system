# Life Organisation System (LOS) - Taxonomy & Codes

**Status:** Active | **Version:** 2.3 | **Date:** Dec 3, 2025


This document defines the hierarchical structure and codes for the Life Organisation System (LOS), used for categorizing data, entries, goals, actions, and files across all platforms.



## 1. System Structure Overview


The LOS uses a four-level hierarchical structure: L1 > L2 > L3 > L4.


* **L1-L3:** The foundational hierarchy (defined in Section 2). These are represented by a 6-digit code.

* **L4:** The Context ID. This identifies the specific project, person, or topic.


### 1.1. The Standard Identifier

The combination of the L1-L3 Code and the L4 Context ID forms the Standard Identifier. This identifier is used as a prefix for items within the LOS. Specific applications may use different separators following the identifier.



---


## 2. The Core Hierarchy (L1 - L3)

The immutable skeleton of the system.




### 01 00 00 Private

* **01 01 00 Personal Admin**

   * 01 01 01 Task Management 

   * 01 01 02 Contracts

* **01 02 00 Health**

    * 01 02 01 Physical Health

    * 01 02 02 Mental Health

* **01 03 00 Personal Growth**

    * 01 03 00 Goals, Habits & Routines

    * 01 03 00 Reflection

    * 01 03 00 Personal Growth Theory

* **01 04 00 Finances**

    * 01 04 01 Purchase

    * 01 04 02 House

* **01 05 00 Other**

    * 01 05 01 Projects

    * 01 05 02 Relationships

    * 01 05 03 Collections (Interests & Passive Reference)


### 02 00 00 Work

* **02 01 00 [YYYYMM] [Company Name]** (Example: 202605 Playmetech / Quantum 21)

* **02 02 00 Career Management**


### 03 00 00 Studies

## 03 XX 00 Institutions

- 03 01 00 Östra Real

- 03 02 00 Uppsala University

- 03 03 00 Stockholms Nation


## 03 01 00 Uppsala University Years

- 03 01 01 År 1 | (2009-2010)

- 03 01 02 År 2 | (2010-2011)

- 03 01 03 År 3 | (2011-2012)

- 03 01 04 År 4 | (2012, 2014)

- 03 01 05 År 5 | (2014-2015) 

---


## 3. Active Contexts (L4)

**Rule:** Files generally reside in folders named simply by the Context (e.g., "75006"). The L1-L3 code is applied via **Metadata/Description** for searchability.


### 01 04 00 Finances (Standing Contexts)

| Code | Description |

| :--- | :--- |

| **Bank Statements** | Standing context for statements. |

| **Crypto** | Cryptocurrency holdings. |

| **HL** | Hargreaves Lansdown (Investments). |

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

| **Passes/Tickets** | Active travel/event documents. |


### 01 04 02 House

| Code | Description |

| :--- | :--- |

| **SW1V 4QE** | Current residence (London). |



### 01 05 01 Projects (Active)

*Includes time-bound projects AND active areas of responsibility.*

| Code | Description |

| :--- | :--- |

| **AI** | Artificial Intelligence initiatives. |

| **Clothes** | Wardrobe management. |

| **Cooking** | Recipes and meal planning. |

| **Declutter** | Physical/Digital cleanup. |

| **TS** | **The System.** LOS maintenance and optimization. |

| **2027 W** | **Project: Wedding Celebration.** Wedding party/events (2027). |

| ** 202604-202605 Staycation** | Project: Staycation/spend quality time with Carry during my gardening leave |  


### 01 05 02 Relationships

| Code | Description |

| :--- | :--- |

| **Alexander / Gabriel** | Brothers. |

| **CMA** | Carry Martens Adersteg. |

| **Mamma och Pappa** | Parents. |


### 01 05 03 Collections (Passive)

*Includes collections, fandoms, and static reference.*

| Code | Description |

| :--- | :--- |

| **Liverpool FC** | Football/Interest. |

| **Star Wars** | Collection/Interest. |

| **Useful/Helpful** | Useful information, tips and tricks 

| **History** | “...”

---


# 99 00 00 ARCHIVAL DOMAIN (THE COLD LAYER)

The `99` suffix at the L3 level designates a record as "Archived." These files are retained for historical purposes but are no longer active in the current 18-month life cycle. A file is moved to this layer if it is >18 months old, is not "Evergreen," and does not fit an active L4 Project.


## 01 XX 99 Personal Archive

- **01 01 99 Archive Admin:** Expired contracts, old ID copies, former address records.

- **01 02 99 Archive Health:** Old prescriptions, settled medical bills, completed therapy records.

- **01 03 99 Archive Wealth:** Statements from closed accounts, old tax returns (>7 years).

- **01 04 99 Archive Purchase:** Receipts for discarded items, old utility bills, expired warranties.

- **01 05 99 Archive Projects:** Documentation from completed or abandoned L4 projects.

## 02 XX 99 Work Archive

- **02 01 99 Archive Employment:** Historical records from former employers and companies (e.g., Deloitte, Revolut

## 03 00 99 Studies Archive




## 4. Archive (L4)

**Rule:** Dormant contexts. Folders are moved to `01 XX 99 Archive`.

| Parent | Code | Original Description | Status |

| :--- | :--- | :--- | :--- |

| **75006** | Residence (Paris). |

| 01 04 01 | **NCS** | Nordea Close Services. | **Closed** (Downgraded to Task) |

| 01 04 02 | **202510 M** | The Move (To Paris). | **Closed** |

| 01 04 02 | **W23DY** | London Flat (Previous). | **Closed** |

| 01 05 01 | **2025 W** | Wedding & Engagement Dinners. | **Closed** (See 2027 W) |

| 01 05 01 | **UKC** | UK Citizenship/Visa. | **Closed/Dormant** |

| **Blackjack** | Hobby/Skill development. |

| **2025 09 Visa** | Carry's Visa Application. |

| **2025 Xmas** | **Project: Christmas 2025.** Gifts, logistics, events, and food planning. |

* **02 01 00 Revolut** 


