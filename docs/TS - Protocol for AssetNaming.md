# PROTOCOL: ASSET NAMING (v1.9 - AUTOMATIC FILE SPECIFICATION)


# 1. THE MANDATORY SYNTAX (DRIVE COMPATIBILITY)

This protocol is strictly for Google Drive Files. It adheres to the "Hyphen Rule" from the Master AssetNaming Protocol to ensure OS compatibility.

- **Mandatory Separator:** " - " (Space-Hyphen-Space).

- **Illegal Character:** NEVER use the ">" (Greater Than) symbol. It will break the file system.


# 2. THE IDENTIFIER LOGIC (THE PREFIX)

The "Identifier" is the anchor of the filename. It must be the most specific TEXTUAL value identified. It is the only part of the name that precedes the mandatory " - " separator.


1. **L4 Context ID (Priority):** Use if the file relates to a specific Project, Person, or Residence. (e.g., '2027 W', 'Home', 'TS').

2. **L3 Functional Name:** Use if no L4 context exists or is identifiable. (e.g., 'Health', 'Purchase', 'Insurance', 'Mechanics II').

3. **Total Uncertainty**: Use the word 'Unknown'. Numerical codes and 0X 0Y ZW placeholders are for Metadata only. The word 'Unknown' is the ONLY permitted fallback for filename prefixes.


**CRITICAL RULE:** Numerical LOS codes (e.g., 01 02 01) and Placeholder codes (e.g., 0X 0Y ZW) are strictly PROHIBITED in filenames. They are reserved exclusively for the Drive Description/Metadata field.


# 3. FILENAME STRUCTURE

`[Identifier] - [Descriptive Name].[extension]`

- **Descriptive Name:** Title Case. For transactions: `[Entity] [Date YYYYMM]`.


# 3.1. THE DATE PRIORITY PROTOCOL

When determining the [Date YYYYMM] for filenames or calculating the 18-Month Archive Rule:

1. Primary (Content Date): Use the date found explicitly within the file text (e.g., invoice date, letter date).

2. Secondary (Metadata Fallback): If NO date is found in the content, you MUST use the `date_created` provided in the METADATA block.

3. Archive Calculation: Always compare the chosen date (Primary or Secondary) against the current date to determine if the 18-month threshold has been passed.


# 3.2. DATE SYNTAX BY CATEGORY (FORMAT)

- **Transactions & Work:** Use `YYYYMM` (e.g., `202405`).

- **Academic/General:** Use only `YYYY` (e.g., `2009`).

- **Standard Letters/Reports:** Use `YYYYMM` if a month is clear; otherwise `YYYY`.


# 3.3. DATE PLACEMENT (IDENTIFIER VS. DESCRIPTION)

This determines if the date is the structural anchor (Prefix) or a descriptive detail.


1. **The Date-First Identifier (Event-Based):** Used for Domain 02 (Work) and 01.05 (Projects).

   - Syntax: `[Date] [Name] - [Description]`

   - Example: `201911 Revolut - Employment Contract.pdf`


2. **The Text-First Identifier (Functional-Based):** Used for all other Domains (Health, Purchase, Studies). The Identifier MUST be textual.

   - Syntax: `[Text Identifier] - [YYYYMM] [Description]`

   - Example: `Health - 202604 Dentist Receipt.pdf`

   - Example: `Mechanics II - 2009 Exam.pdf`



# 4. METADATA: THE SYSTEM STRING

The script writes the following string to the Drive 'Description' field. The AI must provide this in the JSON `description` key:

`[6-Digit Code] [Context ID] #[Tags]`


# 4.1. ARCHIVE METADATA RULES (18-MONTH TRIGGER)

When a file is >18 months old (relative to the current date) and is not 'Evergreen':

- **Filename Identifier:** Remains strictly textual (e.g., 'Purchase', 'Mechanics II').

- **Path Code Syntax:** Use the `99` suffix at the L3 level (e.g., `01 04 99`).

- **Description Syntax:** `[L1][L2] 99 Archive [Identifier] #Archive #[Tags]`

- **Project Exception:** If it matches a project (e.g., 2027 W), use the project code with the archive suffix: `01 05 99`.


# 5. THE "TBC" UNCERTAINTY FRAMEWORK

If you identify the content but cannot find a 1:1 match in the 'Categorisation' hierarchy, you must name the file accurately but flag the metadata as **TBC (To Be Categorized)**.


| Scenario | Identifier (Prefix) | Description (Metadata) |

| :--- | :--- | :--- |

| **Identified Subject, No 6-Digit Match** | **Identified Subject** (Verify this is strictly text) | `[L1-L2] ZW TBC #Uncertain` |

| **Known Domain, Unknown Function** | **Domain Name** | `[L1] 0Y ZW TBC #Uncertain` |

| **Total Content Ambiguity** | `Unknown` | `0X 0Y ZW TBC #Uncertain` |


# 5.1. UNSUPPORTED FORMAT PROTOCOL (.jnt, .exe, etc.) - If the content is "ERROR_AI_CONTEXT: Unsupported binary format", you MUST NOT attempt to describe the content. - Rely EXCLUSIVELY on `original_filename` and `folder_context`. - Use the **Uncertainty Protocol** (ZW) if the folder/filename context is insufficient.


# 6. SYSTEM-WIDE EXEMPLARS (THE TRUTH TABLE)

| Input Content | Date | Logic | Filename | Description |

| :--- | :--- | :--- | :--- | :--- |

| **Old Gym Receipt** | 24m ago | >18m / Generic | `Purchase - Gym Receipt 2022.pdf` | `01 04 99 Archive Purchase #Archive` |

| **Old Project Plan** | 1.5y ago | Inactive Project | `Engagement dinner - Floorplan.pdf` | `01 05 99 Archive 2025 W #Archive #Wedding` |

| **Identity Doc** | 10y ago | Evergreen | `Identity - NIN Letter.pdf` | `01 01 01 Personal Admin #Identity` |

| **Mekanik Exam** | 2009 | Archive Study | `Mechanics II - Exam 2009.pdf` | `03 00 99 Archive Mechanics II #Archive #Exam` |


# 7. LOGIC FLOW (GRAVITY CHECK)

1. **Is it a Project or specific Residence (L4)?** -> Use L4 ID.

2. **Is it Finance, Health, or Property (L3)?** -> Use L3 Name.

3. **Is it a commercial receipt/invoice (L3)?** -> Use 'Purchase'.

4. **Is it unidentifiable?** -> Use `0X 0Y ZW` and flag `TBC`.



