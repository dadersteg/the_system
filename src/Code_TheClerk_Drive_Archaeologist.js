/**
 * @file Code_TheClerk_Drive_Archaeologist.js
 * @description The Drive Archaeologist. Scans for files older than 18 months, uses AI to recommend archival vs "Always On", and executes approved bulk archives.
 */

const ARCHAEOLOGIST_BATCH_SIZE = 5; 
const ARCHAEOLOGIST_MONTHS_THRESHOLD = 18;

function runDriveArchaeologist() {
    console.log(">>> [ARCHAEOLOGIST START] Executing Drive Archaeologist module...");
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
        console.warn("Could not acquire script lock.");
        return;
    }

    try {
        const ss = getMasterSpreadsheet();
        const archSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.DRIVE_ARCHAEOLOGIST);
        if (!archSheet) throw new Error("Drive Archaeologist sheet not found.");

        // Ensure headers exist
        if (archSheet.getLastRow() === 0) {
            archSheet.appendRow(["Action", "File Name", "Last Modified", "Original Folder Path", "File Link", "AI Reasoning", "Status", "File ID"]);
            archSheet.getRange("A1:H1").setFontWeight("bold").setBackground("#d9ead3");
            const rule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Archive", "Keep"], true).build();
            archSheet.getRange("A2:A1000").setDataValidation(rule);
        }

        // --- PHASE 1: EXECUTE APPROVALS ---
        console.log("--- PHASE 1: Executing Approvals ---");
        executeApprovals(archSheet);

        // --- PHASE 2: DISCOVERY & AI ANALYSIS ---
        console.log("--- PHASE 2: Discovery & Analysis ---");
        discoverAndAnalyze(archSheet);

    } catch (e) {
        console.error("ARCHAEOLOGIST FATAL ERROR: " + e.message + "\n" + e.stack);
    } finally {
        lock.releaseLock();
    }
}

function executeApprovals(sheet) {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    let taxonomyJson = "";
    try {
        if (SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID) {
            taxonomyJson = DriveApp.getFileById(SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID).getBlob().getDataAsString();
        }
    } catch(e) {
        console.warn("Failed to load TAXONOMY_JSON for routing: " + e.message);
    }
    let parsedTaxonomy = [];
    if (taxonomyJson) {
        try { parsedTaxonomy = JSON.parse(taxonomyJson); } catch(e){}
    }

    const todayStr = Utilities.formatDate(new Date(), "GMT", "yyyyMMdd");

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const action = row[0]; // Now a string: "Pending", "Archive", or "Keep"
        const status = row[6];
        const fileId = row[7];

        if (action === "Keep" && status !== "Reviewed - Kept") {
            sheet.getRange(i + 1, 7).setValue("Reviewed - Kept");
            console.log(`Marked as Kept: ${row[1]}`);
            continue;
        }

        if (action === "Archive" && status !== "Archived" && fileId) {
            console.log(`Executing archival for: ${row[1]}`);
            try {
                const file = DriveApp.getFileById(fileId);
                const originalPath = row[3] || "Unknown";
                
                let targetFolder = resolveArchiveFolder(file, parsedTaxonomy, originalPath);

                if (targetFolder) {
                    // 1. Try to update Description
                    try {
                        const currentDesc = file.getDescription() || "";
                        const newDesc = `Archived ${todayStr}. Previous folder path: ${originalPath}\n\n${currentDesc}`;
                        file.setDescription(newDesc.trim());
                    } catch (descErr) {
                        console.warn(`[WARNING] Could not update description for ${row[1]} (might be read-only or shared): ${descErr.message}`);
                    }

                    // 2. Try to move File
                    try {
                        file.moveTo(targetFolder);
                        sheet.getRange(i + 1, 7).setValue("Archived");
                        console.log(`[OK] Archived successfully to ${targetFolder.getName()}`);
                    } catch (moveErr) {
                        console.error(`[ERROR] moveTo failed for ${row[1]}: ${moveErr.message}`);
                        
                        // Fallback: Use Drive API if available (Advanced Service)
                        try {
                            if (typeof Drive !== 'undefined') {
                                console.log(`Attempting Advanced Drive Service fallback...`);
                                const parents = file.getParents();
                                let oldParentId = parents.hasNext() ? parents.next().getId() : null;
                                if (oldParentId) {
                                    Drive.Files.update({}, fileId, null, {
                                        addParents: targetFolder.getId(),
                                        removeParents: oldParentId,
                                        supportsAllDrives: true
                                    });
                                    sheet.getRange(i + 1, 7).setValue("Archived (via Fallback)");
                                    console.log(`[OK] Archived successfully via Advanced Service.`);
                                } else {
                                    throw new Error("No parent folder found to remove.");
                                }
                            } else {
                                throw new Error("Advanced Drive Service not enabled.");
                            }
                        } catch (fallbackErr) {
                            sheet.getRange(i + 1, 7).setValue("Move Failed: " + moveErr.message);
                            console.log(`[FAILED] All move attempts failed for ${row[1]}: ${fallbackErr.message}`);
                        }
                    }
                } else {
                    sheet.getRange(i + 1, 7).setValue("Failed: No Archive Route");
                    console.log(`[FAILED] No archive route for ${row[1]}`);
                }

            } catch (e) {
                console.error(`Failed to process file ${row[1]} entirely: ${e.message}`);
                sheet.getRange(i + 1, 7).setValue("Error: " + e.message);
            }
        }
    }
}

function resolveArchiveFolder(file, parsedTaxonomy, originalPath) {
    // Attempt to locate a generic or localized "Archive" folder.
    // If the file's parent folder shares a parent with a "99 Archive" folder, use that.
    const parents = file.getParents();
    if (parents.hasNext()) {
        const parent = parents.next();
        const grandParents = parent.getParents();
        if (grandParents.hasNext()) {
            const grandParent = grandParents.next();
            const siblings = grandParent.getFolders();
            while (siblings.hasNext()) {
                const sibling = siblings.next();
                if (sibling.getName().toLowerCase().includes("archive")) {
                    return sibling;
                }
            }
        }
    }
    
    // Fallback: search globally for top-level 01 Private / 02 00 00 Work archive roots
    const rootSearch = DriveApp.searchFolders("title contains 'Archive'");
    if (rootSearch.hasNext()) return rootSearch.next();
    
    return DriveApp.getFolderById(DRIVE_FOLDERS.REVIEW);
}

function discoverAndAnalyze(sheet) {
    const data = sheet.getDataRange().getValues();
    const existingIds = new Set();
    for (let i = 1; i < data.length; i++) {
        if (data[i][7]) existingIds.add(data[i][7].toString());
    }

    const d = new Date();
    d.setMonth(d.getMonth() - ARCHAEOLOGIST_MONTHS_THRESHOLD);
    const cutoffStr = Utilities.formatDate(d, "GMT", "yyyy-MM-dd");

    // Search query: modified before 18 months ago, not in trash, not a folder
    const query = `modifiedDate < '${cutoffStr}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    console.log(`Search Query: ${query}`);
    
    const filesIter = DriveApp.searchFiles(query);
    const candidates = [];

    while (filesIter.hasNext() && candidates.length < ARCHAEOLOGIST_BATCH_SIZE) {
        const f = filesIter.next();
        const id = f.getId();
        
        if (existingIds.has(id)) continue;
        
        const fName = f.getName();
        // Skip obvious system/always-on structures
        if (fName.includes("Archived") || fName.includes("System") || fName.includes("Template")) continue;

        candidates.push({
            id: id,
            name: fName,
            mime: f.getMimeType(),
            desc: f.getDescription() || "",
            lastMod: Utilities.formatDate(f.getLastUpdated(), "GMT", "yyyy-MM-dd"),
            url: f.getUrl(),
            folderPath: typeof getFullFolderPath === "function" ? getFullFolderPath(f) : "Unknown Path"
        });
    }

    if (candidates.length === 0) {
        console.log("No new old files found.");
        return;
    }

    console.log(`Analyzing ${candidates.length} candidates using AI...`);
    
    const systemPrompt = `
You are the Drive Archaeologist. You evaluate Google Drive files that are older than 18 months to determine if they should be archived.
The sole purpose of the Archive is to remove files that we DO NOT need quick access to from our active workspace.
Whether a file is available online elsewhere is IRRELEVANT. The only question is: "Is this file actively needed in the operational structure?"

Rules for ARCHIVE ("ARCHIVE"):
- Old project work, rough drafts, scratchpads.
- Reading materials, articles, research papers, books.
- One-time use checklists or old notes.
- General media (random photos, old screenshots).

Rules for ALWAYS ON ("KEEP"):
- Foundational Assets: Legal docs, IDs, active contracts, living strategy docs, quant models, system architecture diagrams.
- Infrastructure: Code, automation scripts, .js/.json/.py/.md system configurations, active prompts.
- Master Templates: Blank forms, baseline systems, anything used as a base to create copies.

For each file, output JSON strictly in this format:
[
  { "decision": "KEEP" or "ARCHIVE", "reasoning": "Brief 1-sentence reason why." }
]
`;

    // Process each individually or as a small batch
    const model = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY}`;

    const parts = [{ text: systemPrompt }];
    candidates.forEach((c, i) => {
        parts.push({ text: `--- FILE [${i}] ---\nName: ${c.name}\nPath: ${c.folderPath}\nDesc: ${c.desc}` });
    });

    const payload = {
        contents: [{ role: "user", parts: parts }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const resp = UrlFetchApp.fetch(url, options);
        if (resp.getResponseCode() === 200) {
            const resData = JSON.parse(resp.getContentText());
            const rawText = resData.candidates[0].content.parts[0].text;
            const match = rawText.match(/\[[\s\S]*\]/);
            if (match) {
                const aiDecisions = JSON.parse(match[0]);
                const newRows = [];
                aiDecisions.forEach((dec, i) => {
                    if (dec.decision === "ARCHIVE") {
                        const c = candidates[i];
                        newRows.push([
                            "Pending", // Dropdown initially Pending
                            c.name,
                            c.lastMod,
                            c.folderPath,
                            c.url,
                            dec.reasoning,
                            "Pending Review",
                            c.id
                        ]);
                    } else {
                        console.log(`[${candidates[i].name}] AI decided to KEEP: ${dec.reasoning}`);
                        const c = candidates[i];
                        newRows.push([
                            "Keep", // Auto-mark as Keep
                            c.name,
                            c.lastMod,
                            c.folderPath,
                            c.url,
                            dec.reasoning,
                            "Always On (AI Approved)",
                            c.id
                        ]);
                    }
                });
                
                if (newRows.length > 0) {
                    // Find the true last row by looking at Column B (File Name) instead of Column A
                    const bVals = sheet.getRange("B:B").getValues();
                    let trueLastRow = 1;
                    for (let r = bVals.length - 1; r >= 0; r--) {
                        if (bVals[r][0] !== "") {
                            trueLastRow = r + 1;
                            break;
                        }
                    }

                    sheet.getRange(trueLastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
                    
                    // Add Data Validation Dropdown for Column A
                    const rule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Archive", "Keep"], true).build();
                    sheet.getRange(trueLastRow + 1, 1, newRows.length, 1).setDataValidation(rule);
                    
                    console.log(`Appended ${newRows.length} files to spreadsheet starting at row ${trueLastRow + 1}.`);
                }

            }
        } else {
            console.error("Gemini API Error: " + resp.getContentText());
        }
    } catch(e) {
        console.error("Failed to query Gemini: " + e.message);
    }
}
