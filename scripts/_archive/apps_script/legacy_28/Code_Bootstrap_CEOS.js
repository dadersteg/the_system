/**
 * @file Code_Bootstrap_CEOS.js
 * @description Operational Maintenance & Diagnostic Utilities for The System (Humanoid).
 *
 * @version 3.0.0
 * @author System Architect & Verne
 */

/**
 * Standalone Utility: Identifies and deletes duplicate shortcuts and duplicate files
 * in 00 Inbox, Manual Review, and STND_SOURCES.
 */
function CLEAN_DUPLICATE_SHORTCUTS_INBOX() {
  console.log("=======================================================");
  console.log("🧹 CLEANING DUPLICATE SHORTCUTS & FILES IN INBOX");
  console.log("=======================================================\n");

  const foldersToClean = [];
  
  // 1. Inbox folder
  const inboxFolders = DriveApp.getFoldersByName("00 Inbox");
  while (inboxFolders.hasNext()) {
    const f = inboxFolders.next();
    if (!f.isTrashed()) foldersToClean.push(f);
  }

  // 2. Manual Review folder
  const reviewFolders = DriveApp.getFoldersByName("Manual Review");
  while (reviewFolders.hasNext()) {
    const f = reviewFolders.next();
    if (!f.isTrashed()) foldersToClean.push(f);
  }

  // 3. Fallback to STND_SOURCES if not already included
  if (SYSTEM_CONFIG.DRIVE_FOLDERS && SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES) {
    SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.forEach(id => {
      try {
        const f = DriveApp.getFolderById(id);
        if (!foldersToClean.some(existing => existing.getId() === f.getId())) {
          foldersToClean.push(f);
        }
      } catch (e) {}
    });
  }

  let totalDuplicatesRemoved = 0;

  foldersToClean.forEach(folder => {
    console.log(`📁 Scanning folder: "${folder.getName()}" (ID: ${folder.getId()})...`);
    const seenTargets = new Map(); // targetId -> first fileId
    const seenNames = new Map();   // name -> first fileId
    const items = folder.getFiles();
    const toDelete = [];

    while (items.hasNext()) {
      const file = items.next();
      if (file.isTrashed()) continue;

      const fileId = file.getId();
      const fileName = file.getName();
      const mime = file.getMimeType();
      let isDuplicate = false;
      let reason = "";

      if (mime === "application/vnd.google-apps.shortcut") {
        let targetId = null;
        try {
          targetId = file.getTargetId();
        } catch (e) {
          targetId = fileName;
        }

        if (targetId && seenTargets.has(targetId)) {
          isDuplicate = true;
          reason = `Duplicate shortcut target ID (${targetId})`;
        } else if (targetId) {
          seenTargets.set(targetId, fileId);
        }
      }

      // Also check exact duplicate filenames
      if (!isDuplicate) {
        if (seenNames.has(fileName)) {
          isDuplicate = true;
          reason = `Duplicate file/shortcut name ("${fileName}")`;
        } else {
          seenNames.set(fileName, fileId);
        }
      }

      if (isDuplicate) {
        toDelete.push({ file: file, name: fileName, reason: reason });
      }
    }

    console.log(`   Found ${toDelete.length} duplicates in "${folder.getName()}". Trashing duplicates...`);
    toDelete.forEach(item => {
      try {
        item.file.setTrashed(true);
        console.log(`   🗑️ Trashed: "${item.name}" (Reason: ${item.reason})`);
        totalDuplicatesRemoved++;
      } catch (err) {
        console.error(`   ⚠️ Failed to trash "${item.name}": ${err.message}`);
      }
    });
  });

  console.log("\n=======================================================");
  console.log(`✨ DEDUPLICATION COMPLETE: Removed ${totalDuplicatesRemoved} duplicate shortcuts/files.`);
  console.log("=======================================================\n");
}

/**
 * Diagnostic Utility: Inspects and reports existing Google Drive folders and shortcuts.
 */
function INSPECT_DRIVE_FOLDERS() {
  console.log("=======================================================");
  console.log("🔍 COMPREHENSIVE GOOGLE DRIVE FOLDER & SHORTCUT SCAN");
  console.log("=======================================================\n");

  const root = DriveApp.getRootFolder();

  function checkChild(parentFolder, name, relativePath) {
    const fullPath = relativePath ? `${relativePath}/${name}` : name;
    
    // Check direct folder
    const folderIter = parentFolder.getFoldersByName(name);
    while (folderIter.hasNext()) {
      const f = folderIter.next();
      if (!f.isTrashed()) {
        console.log(`✓ [FOLDER]   "${fullPath}" --> ID: ${f.getId()}`);
        return f;
      }
    }
    
    // Check shortcut to folder
    const fileIter = parentFolder.getFilesByName(name);
    while (fileIter.hasNext()) {
      const file = fileIter.next();
      if (!file.isTrashed() && file.getMimeType() === "application/vnd.google-apps.shortcut") {
        const targetId = file.getTargetId();
        console.log(`✓ [SHORTCUT] "${fullPath}" --> Target ID: ${targetId} (Shortcut ID: ${file.getId()})`);
        try {
          return DriveApp.getFolderById(targetId);
        } catch (e) {
          return null;
        }
      }
    }

    console.log(`❌ [MISSING]  "${fullPath}"`);
    return null;
  }

  console.log("📁 TAXONOMY HIERARCHY FOLDERS & SHORTCUTS:");
  const taxonomyPaths = [
    "01 Admin (Humanoid)",
    "01 Admin (Humanoid)/Contracts & Personal Documents",
    "01 Admin (Humanoid)/Equipment & IT",
    "01 Admin (Humanoid)/Meetings",
    "01 Admin (Humanoid)/Notes",
    "01 Admin (Humanoid)/The System",
    "01 Admin (Humanoid)/Useful",
    "02 Team & Operations",
    "02 Team & Operations/1:1s & People",
    "02 Team & Operations/Hiring & Staffing",
    "02 Team & Operations/Meetings & Cadence",
    "02 Team & Operations/Comms & Broadcasts",
    "03 Knowledge Base",
    "03 Knowledge Base/Company & Strategy",
    "03 Knowledge Base/Domain & Market",
    "03 Knowledge Base/Playbooks & SOPs",
    "03 Knowledge Base/Product & Tech Specs",
    "04 Finances",
    "04 Finances/Budget & Headcount",
    "04 Finances/Vendors & Procurement",
    "04 Finances/Expenses & Claims",
    "05 Projects",
    "05 Projects/202608 OKR",
    "05 Projects/202608 Performance Operations",
    "05 Projects/202608 Reward Program"
  ];

  taxonomyPaths.forEach(p => {
    const parts = p.split("/").map(s => s.trim()).filter(Boolean);
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join("/");
      const next = checkChild(curr, parts[i], parentPath);
      if (next) {
        curr = next;
      } else {
        break;
      }
    }
  });

  console.log("\n=======================================================");
  console.log("📊 FOLDER SCAN COMPLETE");
  console.log("=======================================================\n");
}

/**
 * Standalone Utility: Seeds the finalized Humanoid taxonomy directly into 3 Config - Workspace Taxonomy.
 */
function SEED_HUMANOID_TAXONOMY() {
  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.LOS_TAXONOMY;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error(`Error: 3 Config - Workspace Taxonomy sheet with GID ${targetGid} not found.`);
    return;
  }
  populateFullCEOSHierarchy(sheet);
  console.log("✨ Humanoid Workspace Taxonomy updated successfully!");
}

/**
 * Pre-populates the 3 Config - Workspace Taxonomy tab with the full CEOS hierarchy.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 
 */
function populateFullCEOSHierarchy(sheet) {
  console.log("   └─ Populating full CEOS hierarchy in 3 Config - Workspace Taxonomy...");
  
  const taxonomyData = [
    // L1: 01 Admin (Humanoid)
    ["01", "Admin (Humanoid)", "", "", "", "", "", "", "01 Admin (Humanoid)", "01 Admin (Humanoid)", "01 Admin (Humanoid)", ""],
    ["01", "Admin (Humanoid)", "", "Contracts & Personal Documents", "", "", "", "Employment contracts, official HR paperwork, personal documents, payroll", "01 Admin (Humanoid)/Contracts & Personal Documents", "01 Admin (Humanoid)/Contracts & Personal Documents", "01 Admin (Humanoid)/Contracts & Personal Documents", ""],
    ["01", "Admin (Humanoid)", "", "Equipment & IT", "", "", "", "Hardware provisioning, credentials, software licenses, 2FA, IT support", "01 Admin (Humanoid)/Equipment & IT", "01 Admin (Humanoid)/Equipment & IT", "01 Admin (Humanoid)/Equipment & IT", ""],
    ["01", "Admin (Humanoid)", "", "Meetings", "", "", "", "Meeting notes, Google Meet recordings, audio transcripts", "01 Admin (Humanoid)/Meetings", "01 Admin (Humanoid)/Meetings", "01 Admin (Humanoid)/Meetings", ""],
    ["01", "Admin (Humanoid)", "", "Notes", "", "", "", "General rough notes, scratchpad items, raw captures", "01 Admin (Humanoid)/Notes", "01 Admin (Humanoid)/Notes", "01 Admin (Humanoid)/Notes", ""],
    ["01", "Admin (Humanoid)", "", "The System", "", "", "", "Operating system configuration, Apps Script repositories, bot configurations", "01 Admin (Humanoid)/The System", "01 Admin (Humanoid)/The System", "01 Admin (Humanoid)/The System", ""],
    ["01", "Admin (Humanoid)", "", "Useful", "", "", "", "Reference gems, prompt artifacts, useful tools", "01 Admin (Humanoid)/Useful", "01 Admin (Humanoid)/Useful", "01 Admin (Humanoid)/Useful", ""],

    // L1: 02 Team & Operations
    ["02", "Team & Operations", "", "", "", "", "", "", "02 Team & Operations", "02 Team & Operations", "02 Team & Operations", ""],
    ["02", "Team & Operations", "", "1:1s & People", "", "", "", "Direct report 1:1s, coaching, feedback, manager syncs", "02 Team & Operations/1:1s & People", "02 Team & Operations/1:1s & People", "02 Team & Operations/1:1s & People", ""],
    ["02", "Team & Operations", "", "Hiring & Staffing", "", "", "", "Recruitment pipelines, candidate screening, interview loops, job descriptions", "02 Team & Operations/Hiring & Staffing", "02 Team & Operations/Hiring & Staffing", "02 Team & Operations/Hiring & Staffing", ""],
    ["02", "Team & Operations", "", "Meetings & Cadence", "", "", "", "Recurring team syncs, daily standups, all-hands, firesides, unblocking sessions", "02 Team & Operations/Meetings & Cadence", "02 Team & Operations/Meetings & Cadence", "02 Team & Operations/Meetings & Cadence", ""],
    ["02", "Team & Operations", "", "Comms & Broadcasts", "", "", "", "Company newsletters, team announcements, executive operational memos", "02 Team & Operations/Comms & Broadcasts", "02 Team & Operations/Comms & Broadcasts", "02 Team & Operations/Comms & Broadcasts", ""],

    // L1: 03 Knowledge Base
    ["03", "Knowledge Base", "", "", "", "", "", "", "03 Knowledge Base", "03 Knowledge Base", "03 Knowledge Base", ""],
    ["03", "Knowledge Base", "", "Company & Strategy", "", "", "", "Company vision, quarterly OKRs, executive briefings, org charts, business model", "03 Knowledge Base/Company & Strategy", "03 Knowledge Base/Company & Strategy", "03 Knowledge Base/Company & Strategy", ""],
    ["03", "Knowledge Base", "", "Domain & Market", "", "", "", "Robotics industry research, competitor benchmarks, AI literature, market data", "03 Knowledge Base/Domain & Market", "03 Knowledge Base/Domain & Market", "03 Knowledge Base/Domain & Market", ""],
    ["03", "Knowledge Base", "", "Playbooks & SOPs", "", "", "", "Standard operating procedures, frameworks, guidelines, templates, how-to manuals", "03 Knowledge Base/Playbooks & SOPs", "03 Knowledge Base/Playbooks & SOPs", "03 Knowledge Base/Playbooks & SOPs", ""],
    ["03", "Knowledge Base", "", "Product & Tech Specs", "", "", "", "Technical specs, hardware/software standards, KinetIQ architecture, CE certification", "03 Knowledge Base/Product & Tech Specs", "03 Knowledge Base/Product & Tech Specs", "03 Knowledge Base/Product & Tech Specs", ""],

    // L1: 04 Finances
    ["04", "Finances", "", "", "", "", "", "", "04 Finances", "04 Finances", "04 Finances", ""],
    ["04", "Finances", "", "Budget & Headcount", "", "", "", "Financial planning, headcount cost models, department budgets, P&L targets", "04 Finances/Budget & Headcount", "04 Finances/Budget & Headcount", "04 Finances/Budget & Headcount", ""],
    ["04", "Finances", "", "Vendors & Procurement", "", "", "", "Vendor contracts, SaaS tool subscriptions, supplier invoices", "04 Finances/Vendors & Procurement", "04 Finances/Vendors & Procurement", "04 Finances/Vendors & Procurement", ""],
    ["04", "Finances", "", "Expenses & Claims", "", "", "", "Personal expense claims, travel receipts, team dinners", "04 Finances/Expenses & Claims", "04 Finances/Expenses & Claims", "04 Finances/Expenses & Claims", ""],

    // L1: 05 Projects
    ["05", "Projects", "", "", "", "", "", "", "05 Projects", "05 Projects", "05 Projects", ""],
    ["05", "Projects", "", "202608 OKR", "", "", "202608 OKR", "Company-wide OKR cycle coordination, scorecard updates, alignment reviews", "05 Projects/202608 OKR", "05 Projects/202608 OKR", "05 Projects/202608 OKR", ""],
    ["05", "Projects", "", "202608 Performance Operations", "", "", "202608 Performance Operations", "Organisation performance framework design, efficiency systems, velocity metrics", "05 Projects/202608 Performance Operations", "05 Projects/202608 Performance Operations", "05 Projects/202608 Performance Operations", ""],
    ["05", "Projects", "", "202608 Reward Program", "", "", "202608 Reward Program", "Employee incentive systems, bonus and compensation structure review", "05 Projects/202608 Reward Program", "05 Projects/202608 Reward Program", "05 Projects/202608 Reward Program", ""]
  ];

  sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), sheet.getLastColumn()).clearContent();
  sheet.getRange(2, 1, taxonomyData.length, taxonomyData[0].length).setValues(taxonomyData);
  console.log(`   └─ Successfully seeded ${taxonomyData.length} taxonomy entries into 3 Config - Workspace Taxonomy.`);
}

/**
 * Standalone Utility: Seeds the 4 High-Level Humanoid Strategic Goals into the dedicated
 * Goals sheet and exports them to markdown.
 */
function SEED_HUMANOID_GOALS() {
  console.log("=======================================================");
  console.log("🎯 SEEDING HUMANOID STRATEGIC GOALS & EXPORTING CONTEXT");
  console.log("=======================================================\n");

  const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
  if (!ssId) {
    console.error("Error: HABITS_SHEET_ID is not defined in SYSTEM_CONFIG.ROOTS.");
    return;
  }

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheets()[0];

  const headers = ["Goal ID", "Category", "Goal Name", "Strategic Objective", "Related Projects", "Active"];
  const goalsData = [
    [
      "OPS-1.1",
      "03 Knowledge Base/Company & Strategy",
      "Measurable Performance & OKR Framework",
      "Make performance measurable at every level so the company can drive it. Ratify and embed the company-wide OKR framework ensuring all team and individual goals directly ladder to executive objectives.",
      "05 Projects/202608 OKR",
      true
    ],
    [
      "OPS-1.2",
      "02 Team & Operations",
      "Evidence-Based Performance Assessments",
      "Assess individual performance on evidence rather than impression. Establish a fair, objective assessment framework across all functions to maximize systemic efficiency and execution speed.",
      "05 Projects/202608 Performance Operations",
      true
    ],
    [
      "OPS-1.3",
      "02 Team & Operations/Hiring & Staffing",
      "Performance-Driven Reward & Incentive Architecture",
      "Make reward follow performance rather than tenure or negotiation. Establish a high-performance reward and LTIP framework that drives high talent density and retains top performers.",
      "05 Projects/202608 Reward Program",
      true
    ],
    [
      "OPS-1.4",
      "01 Admin (Humanoid)/The System",
      "Autonomous Executive Systems & Workspace Operations",
      "Maintain zero-friction executive operating systems (The Clerk automated triage, Task Master execution cadence) to eliminate manual overhead and ensure zero task leakage.",
      "01 Admin (Humanoid)/The System",
      true
    ]
  ];

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  sheet.getRange(2, 1, goalsData.length, headers.length).setValues(goalsData);
  sheet.autoResizeColumns(1, headers.length);
  console.log(`✨ Successfully seeded ${goalsData.length} strategic goals into Habits & Goals sheet.`);

  exportWorkGoalsToMarkdown();
}

/**
 * Run from PRIVATE environment: Grants Viewer/Read access on all existing System Prompt docs
 * to the Humanoid Work Account (daniel.adersteg@thehumanoid.ai).
 */
function GRANT_ACCESS_TO_WORK_ACCOUNT() {
  console.log("=======================================================");
  console.log("🔑 GRANTING WORK ACCOUNT ACCESS TO MASTER SYSTEM DOCS");
  console.log("=======================================================\n");

  const workEmail = "daniel.adersteg@thehumanoid.ai";
  const fileIds = [
    "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar", // TASK_MASTER_PROMPT_ID
    "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW", // TASK_MASTER_DAILY_PROMPT_ID
    "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb", // TASK_MASTER_WEEKLY_PROMPT_ID
    "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf", // TASK_MASTER_MONTHLY_PROMPT_ID
    "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2", // TASK_MASTER_QUARTERLY_PROMPT_ID
    "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U", // CLERK_DRIVE_INSTRUCTIONS
    "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk", // CLERK_DRIVE_PROTOCOL
    "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ", // CLERK_EMAIL_PROMPT_ID
    "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn", // MASTER_ASSET_NAMING_PROTOCOL
    "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm", // AGENT_PROTOCOL_TIME_FRAMEWORKS
    "1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8", // SYSTEM_ARCHITECTURE_OVERVIEW_ID
    "18-wxQHsaN-T7vcVSFo3e5TKFisrx8Tf-", // GEMINI_MODELS_MD_ID
    "1adWYc1Rpoh4W5IBHVY3CfNg3KzzmEOeL", // GEMINI_MODELS_JSON_ID
    "135iOBA-LQbm5Tv6VMaB-XUTa6Iwpkb_-UHsziXlDhYg"  // BLUF_SUMMARY_PROMPT_ID
  ];

  let successCount = 0;
  fileIds.forEach(id => {
    try {
      const file = DriveApp.getFileById(id);
      file.addViewer(workEmail);
      console.log(`✓ Granted Viewer access to: "${file.getName()}" (${id})`);
      successCount++;
    } catch(e) {
      console.error(`⚠️ Failed on File ID ${id}: ${e.message}`);
    }
  });

  console.log("\n=======================================================");
  console.log(`✅ ACCESS GRANTED ON ${successCount}/${fileIds.length} SYSTEM DOCS TO ${workEmail}`);
  console.log("=======================================================");
}

/**
 * Standalone Utility: Immediately writes the clean 21-column header row to 5 Import - Drive Files Log.
 */
function FIX_DRIVE_LOG_HEADERS() {
  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.DRIVE_LOG;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error("Drive Log sheet not found!");
    return;
  }
  const driveHeaders = [
    "Timestamp", "URL", "Original Name", "Description", "Final Name",
    "Path Code", "Context ID", "BLUF Summary", "Metadata Description", "Reasoning",
    "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path",
    "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status",
    "Mapped Task", "Tasks Extracted"
  ];
  sheet.getRange(1, 1, 1, driveHeaders.length).setValues([driveHeaders]).setFontWeight("bold").setBackground("#cfe2f3");
  sheet.setFrozenRows(1);
  console.log("✓ Successfully updated row 1 headers in 5 Import - Drive Files Log!");
}

/**
 * Standalone Utility: Retroactively regenerates BLUF summaries for existing rows in 5 Import - Drive Files Log
 * using the dynamic Google Doc prompt.
 */
function RETRO_UPDATE_BLUF_SUMMARIES() {
  console.log("=======================================================");
  console.log("🔄 RETRO-UPDATING BLUF SUMMARIES IN DRIVE FILES LOG");
  console.log("=======================================================\n");

  const ss = getMasterSpreadsheet();
  const targetGid = SYSTEM_CONFIG.SHEETS.DRIVE_LOG;
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) {
    console.error("Drive Log sheet not found!");
    return;
  }

  FIX_DRIVE_LOG_HEADERS();

  const blufDocId = SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID;
  let blufPrompt = "";
  if (blufDocId) {
    try {
      blufPrompt = getSafeDocText(blufDocId);
    } catch(e) {
      console.warn("Could not read BLUF Doc: " + e.message);
    }
  }
  if (!blufPrompt) {
    blufPrompt = `Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary for the document. Extract the core message, key decisions, and critical deadlines. Maintain a highly efficient, punchy tone. Remove all filler. Pure plain text only.`;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.log("No data rows found to update.");
    return;
  }

  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const url = data[i][1] ? data[i][1].toString() : "";
    const originalName = data[i][2] ? data[i][2].toString() : "";
    const finalName = data[i][4] ? data[i][4].toString() : "";

    let fileId = null;
    const match = url.match(/[-\w]{25,}/);
    if (match) {
      fileId = match[0];
    }

    if (!fileId) {
      console.log(`Skipping Row ${i+1}: No valid file ID found in URL "${url}".`);
      continue;
    }

    try {
      let fileText = "";
      const file = DriveApp.getFileById(fileId);
      const mime = file.getMimeType();
      
      if (mime === "application/vnd.google-apps.document") {
        fileText = DocumentApp.openById(fileId).getBody().getText().substring(0, 6000);
      } else if (mime === "application/vnd.google-apps.spreadsheet") {
        fileText = SpreadsheetApp.openById(fileId).getSheets()[0].getDataRange().getValues().slice(0, 30).map(r => r.join(" | ")).join("\n");
      } else {
        try {
          fileText = file.getBlob().getDataAsString().substring(0, 6000);
        } catch(e) {
          fileText = "";
        }
      }

      if (!fileText || fileText.length < 20) {
        fileText = `File Name: ${finalName || originalName} | Description: ${data[i][3] || ""} | Context: ${data[i][5] || ""}`;
      }

      const promptText = `${blufPrompt}\n\nDOCUMENT TITLE: ${finalName || originalName}\n\nDOCUMENT CONTENT:\n${fileText}\n\nOUTPUT: Output ONLY the plain text BLUF summary. Maximum 500 characters.`;
      const aiResponse = callGemini([{ text: promptText }], "gemini-2.5-flash", null, null, false);

      if (aiResponse && aiResponse.text) {
        let cleanSummary = aiResponse.text.trim().replace(/^["']|["']$/g, '');
        if (cleanSummary.length > 500) cleanSummary = cleanSummary.substring(0, 497) + "...";
        sheet.getRange(i + 1, 8).setValue(cleanSummary);
        console.log(`✓ Row ${i+1} [${finalName || originalName}]: Updated BLUF Summary`);
        updatedCount++;
      }
      Utilities.sleep(500);
    } catch(err) {
      console.warn(`⚠️ Row ${i+1} [${originalName}]: ${err.message}`);
    }
  }

  console.log("\n=======================================================");
  console.log(`✅ RETRO UPDATE COMPLETE: Updated ${updatedCount} rows with new BLUF summaries!`);
  console.log("=======================================================");
}

/**
 * Standalone Utility: Inspects the workspace and outputs the exact URLs and file IDs
 * for all system prompts, master files, and generated output plans.
 */
function GET_ALL_SYSTEM_DOC_LINKS() {
  console.log("=======================================================");
  console.log("📑 THE SYSTEM (HUMANOID): MASTER & GENERATED DOC LINKS");
  console.log("=======================================================\n");

  const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(workspaceFolderId);
  console.log(`📂 Workspace Folder: "${folder.getName()}"\n   URL: ${folder.getUrl()}\n`);

  console.log("--- 1. MASTER SPREADSHEET & HABITS ---");
  try {
    const ss = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
    console.log(`📊 Master Spreadsheet: ${ss.getUrl()}`);
  } catch(e) { console.log(`📊 Master Spreadsheet: Error: ${e.message}`); }

  console.log("\n--- 2. GENERATED ONE-PAGERS & EXECUTION PLANS (IN WORKSPACE) ---");
  const files = folder.getFiles();
  let fileCount = 0;
  while (files.hasNext()) {
    const f = files.next();
    console.log(`📄 "${f.getName()}" --> ID: ${f.getId()}\n   URL: ${f.getUrl()}`);
    fileCount++;
  }
  if (fileCount === 0) {
    console.log("No generated output files found in workspace folder yet.");
  }

  console.log("\n--- 3. SYSTEM PROMPT DOCUMENTS ---");
  const promptDocs = [
    { name: "BLUF Summary Prompt", id: SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID },
    { name: "Task Master Global Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_PROMPT_ID },
    { name: "1-Day Daily Operations Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID },
    { name: "7-Day Weekly Roadmap Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_WEEKLY_PROMPT_ID },
    { name: "28-Day Monthly Strategy Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_MONTHLY_PROMPT_ID },
    { name: "84-Day Quarterly Strategic Prompt", id: SYSTEM_CONFIG.DOCS.TASK_MASTER_QUARTERLY_PROMPT_ID }
  ];
  promptDocs.forEach(d => {
    if (d.id) {
      try {
        const pf = DriveApp.getFileById(d.id);
        console.log(`📝 ${d.name}: "${pf.getName()}" --> ID: ${d.id}\n   URL: ${pf.getUrl()}`);
      } catch(e) {
        console.log(`📝 ${d.name} (ID: ${d.id}): ${e.message}`);
      }
    }
  });
  console.log("\n=======================================================");
}

/**
 * Standalone Utility: Creates or updates the BLUF summary prompt document directly in the workspace folder.
 */
function SEED_BLUF_PROMPT_DOC() {
  const workspaceFolderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const folder = DriveApp.getFolderById(workspaceFolderId);
  const fileName = "202608 - The Clerk BLUF Summary System Prompt.md";
  const files = folder.getFilesByName(fileName);
  const content = `## BOTTOM LINE UP FRONT (BLUF) SUMMARY INSTRUCTIONS
For the summary field of each document/file:
1. Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary.
2. Extract the core message, key decisions, and any critical deadlines or requirements.
3. Maintain a highly efficient, punchy tone. Remove all filler and corporate pleasantries.
4. CRITICAL: Do NOT output any URLs, web links, or markdown link formatting. Output pure plain text only.`;

  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(content);
    console.log(`✓ Updated existing BLUF Prompt doc: "${fileName}" (ID: ${file.getId()})`);
  } else {
    file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    console.log(`✨ Created new BLUF Prompt doc in workspace: "${fileName}" (ID: ${file.getId()})`);
  }
  console.log(`   URL: ${file.getUrl()}`);
  return file.getId();
}

// Prompt documents are managed directly by the user on filesystem / Google Drive.

/**
 * Standalone Utility: Configures the exact layout, formulas, search boxes, and formatting
 * for "10 Drive Tracker" and "10 Email Tracker" in the Master Spreadsheet.
 */
function SYNC_TRACKERS_FROM_PRIVATE() {
  console.log("=======================================================");
  console.log("📊 CONFIGURING DRIVE & EMAIL TRACKERS IN MASTER SPREADSHEET");
  console.log("=======================================================\n");

  const ss = getMasterSpreadsheet();

  // 1. Configure 10 Drive Tracker
  const driveTrackerGid = SYSTEM_CONFIG.SHEETS.DRIVE_TRACKER;
  const driveTrackerSheet = ss.getSheets().find(s => s.getSheetId().toString() === driveTrackerGid);
  if (driveTrackerSheet) {
    driveTrackerSheet.clear();
    
    // Title
    driveTrackerSheet.getRange("A1").setValue("DRIVE FILES AUDITOR & SEARCH TRACKER").setFontWeight("bold").setFontSize(14);
    driveTrackerSheet.getRange("A3").setValue("Search Files:").setFontWeight("bold");
    driveTrackerSheet.getRange("B3").setValue("").setBackground("#fff2cc"); // Yellow input cell

    // Column Headers
    const driveHeaders = ["Original Name", "Final Name", "Target Folder Path", "BLUF Summary", "Mapped Task", "Tasks Extracted"];
    driveTrackerSheet.getRange(5, 1, 1, driveHeaders.length).setValues([driveHeaders]).setFontWeight("bold").setBackground("#cfe2f3");

    // Dynamic Filter Query Formula for Row 6
    const driveFormula = `=IFERROR(QUERY('5 Import - Drive Files Log'!A2:U, "SELECT C, E, O, H, T, U WHERE C IS NOT NULL AND (LOWER(C) CONTAINS LOWER('"&B3&"') OR LOWER(E) CONTAINS LOWER('"&B3&"') OR LOWER(H) CONTAINS LOWER('"&B3&"') OR LOWER(O) CONTAINS LOWER('"&B3&"') OR '"&B3&"' = '') ORDER BY A DESC LIMIT 500", 0), "No matching files found")`;
    driveTrackerSheet.getRange("A6").setFormula(driveFormula);
    driveTrackerSheet.setFrozenRows(5);
    console.log("✓ Successfully configured 10 Drive Tracker!");
  } else {
    console.error("10 Drive Tracker sheet not found!");
  }

  // 2. Configure 10 Email Tracker
  const emailTrackerGid = SYSTEM_CONFIG.SHEETS.EMAIL_TRACKER;
  const emailTrackerSheet = ss.getSheets().find(s => s.getSheetId().toString() === emailTrackerGid);
  if (emailTrackerSheet) {
    emailTrackerSheet.clear();

    // Title
    emailTrackerSheet.getRange("A1").setValue("EMAIL AUDITOR & SEARCH TRACKER").setFontWeight("bold").setFontSize(14);
    emailTrackerSheet.getRange("A3").setValue("Search Emails:").setFontWeight("bold");
    emailTrackerSheet.getRange("B3").setValue("").setBackground("#fff2cc"); // Yellow input cell

    // Column Headers
    const emailHeaders = ["Timestamp", "Subject", "Sender", "Final Labels", "BLUF Summary", "Action Items", "Link", "Inbox Status"];
    emailTrackerSheet.getRange(5, 1, 1, emailHeaders.length).setValues([emailHeaders]).setFontWeight("bold").setBackground("#cfe2f3");

    // Dynamic Filter Query Formula for Row 6
    const emailFormula = `=IFERROR(QUERY('5 Import - Email Triage Log'!A2:Q, "SELECT A, D, L, H, M, N, I, J WHERE A IS NOT NULL AND (LOWER(D) CONTAINS LOWER('"&B3&"') OR LOWER(L) CONTAINS LOWER('"&B3&"') OR LOWER(M) CONTAINS LOWER('"&B3&"') OR LOWER(H) CONTAINS LOWER('"&B3&"') OR '"&B3&"' = '') ORDER BY A DESC LIMIT 500", 0), "No matching emails found")`;
    emailTrackerSheet.getRange("A6").setFormula(emailFormula);
    emailTrackerSheet.setFrozenRows(5);
    console.log("✓ Successfully configured 10 Email Tracker!");
  } else {
    console.error("10 Email Tracker sheet not found!");
  }

  console.log("\n=======================================================");
  console.log("✅ TRACKER TABS FULLY CONFIGURED & LINKED TO IMPORT LOGS");
  console.log("=======================================================");
}

/**
 * Standalone Utility: Verifies read/write access to the dedicated Timeboxing calendar.
 */
function VERIFY_TIMEBOXING_CALENDAR() {
  console.log("=======================================================");
  console.log("📅 VERIFYING DEDICATED TIMEBOXING CALENDAR ACCESS");
  console.log("=======================================================\n");

  const calId = SYSTEM_CONFIG.CALENDARS.TIMEBOXING_ID;
  console.log(`Target Calendar ID: ${calId}`);

  try {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) {
      console.error("❌ CalendarApp.getCalendarById returned null. Ensure this calendar is added/shared to this Google Account.");
      return;
    }

    console.log(`✓ Calendar Name: "${cal.getName()}"`);
    console.log(`✓ Calendar TimeZone: ${cal.getTimeZone()}`);
    
    // Check events for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const events = cal.getEvents(startOfDay, endOfDay);
    console.log(`✓ Found ${events.length} events scheduled on this calendar for today.`);
    events.forEach(e => {
      console.log(`   - [${Utilities.formatDate(e.getStartTime(), "Europe/London", "HH:mm")} - ${Utilities.formatDate(e.getEndTime(), "Europe/London", "HH:mm")}] ${e.getTitle()}`);
    });

    console.log("\n=======================================================");
    console.log("✅ DEDICATED TIMEBOXING CALENDAR ACCESSIBLE & VERIFIED!");
    console.log("=======================================================");
  } catch (e) {
    console.error(`❌ Verification failed: ${e.message}`);
  }
}

/**
 * Standalone Utility: Inspects Google Tasks across all lists to see their titles,
 * parent/subtask relationships, notes, and milestones.
 */
function INSPECT_GOOGLE_TASKS_MILESTONES() {
  console.log("=======================================================");
  console.log("📋 INSPECTING GOOGLE TASKS & MILESTONES");
  console.log("=======================================================\n");

  const lists = [
    { name: "00 Inbox", id: SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID },
    { name: "00 Todo", id: SYSTEM_CONFIG.TASKS.TODO_LIST_ID },
    { name: "00 AI Review", id: SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID },
    { name: "00 Recurring", id: SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID }
  ];

  lists.forEach(l => {
    console.log(`\n--- LIST: ${l.name} (${l.id}) ---`);
    let pageToken;
    let count = 0;
    do {
      try {
        const res = Tasks.Tasks.list(l.id, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
        const items = res.items || [];
        items.forEach(t => {
          count++;
          const isMilestone = t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title));
          const hasParent = !!t.parent;
          const milestoneNoteMatch = (t.notes || "").match(/^Milestone:\s*(.*)$/m);
          console.log(`[${count}] "${t.title}" (ID: ${t.id})`);
          if (hasParent) console.log(`    ↳ Subtask of Parent ID: ${t.parent}`);
          if (isMilestone) console.log(`    ★ Identified as MILESTONE EPIC`);
          if (milestoneNoteMatch) console.log(`    ↳ Note Milestone: "${milestoneNoteMatch[1]}"`);
        });
        pageToken = res.nextPageToken;
      } catch(e) {
        console.error(`Error reading ${l.name}: ${e.message}`);
        pageToken = undefined;
      }
    } while (pageToken);
    console.log(`Total in ${l.name}: ${count}`);
  });
  console.log("\n=======================================================");
}

/**
 * Standalone Test Utility: Tests and verifies the Milestone attribution and parenting pipeline.
 * Evaluates active tasks, runs Gemini classification with milestone grouping, and verifies the exact
 * decisions, parent-child linkages, and Google Tasks updates.
 */
function TEST_TASK_MASTER_MILESTONES() {
  console.log("=======================================================");
  console.log("🧪 TESTING TASK MASTER MILESTONE ATTRIBUTION & PARENTING");
  console.log("=======================================================\n");

  // 1. Inspect current active milestones
  const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
  const rawTasks = [];
  let pageToken;
  do {
    const res = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
    if (res.items) rawTasks.push(...res.items);
    pageToken = res.nextPageToken;
  } while (pageToken);

  const activeMilestones = rawTasks
    .filter(t => t.title && (/^\[milestone\]/i.test(t.title) || /^milestone:/i.test(t.title)))
    .map(t => ({ id: t.id, title: t.title }));

  console.log(`Found ${activeMilestones.length} existing Milestone Epics in 00 Todo:`);
  activeMilestones.forEach(m => console.log(`  ★ "${m.title}" (ID: ${m.id})`));

  // 3. Run the actual pipeline sweep (force reviewing all tasks for testing)
  console.log("\nExecuting Task Master Review Pipeline to verify AI Milestone grouping (forceReviewAll = true)...");
  const result = runTaskMasterEngine(true);
  console.log("Pipeline result:", result);

  // 4. Inspect final result in Google Tasks
  console.log("\nVerifying parent-child hierarchy in Google Tasks:");
  INSPECT_GOOGLE_TASKS_MILESTONES();
}
