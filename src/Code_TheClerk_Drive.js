/**
 * @file Code_TheClerk_Drive.js
 * @description THE CLERK: VERSION 26.0 (THE TRUTH ENGINE). Ingests files from Google Drive, extracts content via OCR/Text conversion, categorizes them against a taxonomy using Gemini, and routes/renames files based on strict protocols or spreadsheet overrides.
 *
 * @version 26.0.1
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 26.0.1: Implemented folderCache to reduce duplicate Drive API calls for identical taxonomy contexts. Increased Gemini batching parameters to 5 files per call to maximize throughput.
 */

// --- 1. CONFIGURATION ---
const DRIVE_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
const DRIVE_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH;
const DRIVE_RETRO_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_RETRO_MODEL;

const DRIVE_MASTER_SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
const DRIVE_LOG_GID = SYSTEM_CONFIG.SHEET_GIDS.DRIVE_LOG;
const DRIVE_SESSION_LOG_GID = SYSTEM_CONFIG.SHEET_GIDS.DRIVE_SESSION_LOG;
const DRIVE_RULES_SHEET_ID = SYSTEM_CONFIG.ROOTS.DRIVE_RULES_SHEET_ID;

const DRIVE_FILENAME_RULES_GID = SYSTEM_CONFIG.SHEET_GIDS.DRIVE_FILENAME_RULES; // Filename Rules Tab
const DRIVE_FOLDER_RULES_GID = SYSTEM_CONFIG.SHEET_GIDS.DRIVE_FOLDER_RULES;   // Folder Rules Tab

const DRIVE_MAX_BATCH_SIZE = 5;
const DRIVE_TOTAL_FILES_LIMIT = 20;
const DRIVE_MAX_EXECUTION_TIME_MS = 280000;

const DRIVE_DOC_IDS = {
    INSTRUCTIONS: SYSTEM_CONFIG.DOCS.CLERK_DRIVE_INSTRUCTIONS,
    TAXONOMY_JSON: SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID, // Structured JSON
    PROTOCOL: SYSTEM_CONFIG.DOCS.CLERK_DRIVE_PROTOCOL
};

const DRIVE_ARCHIVE_ROOT = SYSTEM_CONFIG.ROOTS.DRIVE_RETRO_ROOT_ID;
if (!DRIVE_ARCHIVE_ROOT) throw new Error("Missing Script Property: DRIVE_RETRO_ROOT_ID");

const DRIVE_FOLDERS = {
    STND_SOURCES: SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES,
    STND_DEST: SYSTEM_CONFIG.DRIVE_FOLDERS.STND_DEST,
    ARCHIVE_ROOT: DRIVE_ARCHIVE_ROOT,
    REVIEW: SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW,
    REVIEW_RETRO: SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW_RETRO
};


// --- 2. ENGINES ---

function runTheClerkDriveOngoing() { 
  executeEngine("ONGOING", DRIVE_MODEL_NAME); 
}

function executeEngine(mode, currentModel) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;
    const sessionStart = Date.now();
    console.log(`>>> [${mode} START] v26.0 using ${currentModel}`);
    
    try {
        const ss = SpreadsheetApp.openById(DRIVE_MASTER_SHEET_ID);
        const log = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_LOG_GID);
        const sessionLog = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_SESSION_LOG_GID);
        
        if (!log) throw new Error("Execution Log sheet not found.");
        const fullRules = loadKnowledgeDocs();
        const folderCache = { byId: {}, byName: {} };
        let allFiles = [];

        // Search Phase
        DRIVE_FOLDERS.STND_SOURCES.forEach(id => {
            try {
                const folder = DriveApp.getFolderById(id);
                const folderPath = getFullFolderPath(folder);
                const files = folder.getFiles();
                while (files.hasNext() && allFiles.length < DRIVE_TOTAL_FILES_LIMIT) {
                    const f = files.next();
                    allFiles.push({ 
                        id: f.getId(), 
                        name: f.getName(), 
                        mime: f.getMimeType(), 
                        desc: f.getDescription() || "", 
                        sourceFolderId: id,
                        folderPath: folderPath,
                        dateCreated: Utilities.formatDate(f.getDateCreated(), "GMT", "yyyy-MM-dd")
                    });
                }
            } catch (e) { console.error("Error fetching files from folder " + id + ": " + e.message); }
        });

        console.log(`[FOUND] ${allFiles.length} files.`);
        if (allFiles.length === 0) return;

        const driveRules = getDriveRules();

        // Batching Logic
        let currentBatch = [];
        for (let f of allFiles) {
            if (Date.now() - sessionStart > DRIVE_MAX_EXECUTION_TIME_MS) break;

            const needsIsolation = f.mime.includes("image/") || f.mime === "application/pdf" || f.mime.includes("officedocument") || f.mime.includes("ms-");

            if (needsIsolation) {
                if (currentBatch.length > 0) { 
                    processAndLog(currentBatch, fullRules, log, mode, currentModel, driveRules, folderCache);
                    currentBatch = []; 
                }
                processAndLog([f], fullRules, log, mode, currentModel, driveRules, folderCache);
            } else {
                currentBatch.push(f);
                if (currentBatch.length >= DRIVE_MAX_BATCH_SIZE) { 
                    processAndLog(currentBatch, fullRules, log, mode, currentModel, driveRules, folderCache);
                    currentBatch = []; 
                }
            }
        }
        if (currentBatch.length > 0) processAndLog(currentBatch, fullRules, log, mode, currentModel, driveRules, folderCache);

        if (sessionLog) {
            sessionLog.appendRow([new Date(), mode, currentModel, allFiles.length, "Completed", `${((Date.now() - sessionStart) / 1000).toFixed(1)}s`]);
        }
    } catch (e) { 
        console.error("FATAL: " + e.message); 
        try {
            const ss = SpreadsheetApp.openById(DRIVE_MASTER_SHEET_ID);
            const sessionLog = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_SESSION_LOG_GID);
            if (sessionLog) sessionLog.appendRow([new Date(), mode, currentModel, 0, "Failed: " + e.message, `${((Date.now() - sessionStart) / 1000).toFixed(1)}s`]);
        } catch(e2){}
    } finally { 
        lock.releaseLock(); 
    }
}


// --- 3. UNIFIED PROCESSING & LOGGING ---

function processAndLog(batch, rules, logSheet, mode, currentModel, driveRules, folderCache) {
    console.log(`   > Extracting: ${batch.map(b => b.name).join(", ")}`);
    const batchLogs = [];
    let validFiles = [];

    // 1. EXTRACTION & DETERMINISTIC PRE-CHECK
    batch.forEach(f => {
        let match = checkDeterministicRules(f, driveRules);
        if (match) {
            // Fast-path bypass
            f.aiBypass = match;
            validFiles.push(f);
        } else {
            const extData = extractContentV3(f);
            if (extData.error) {
                console.error(`   [SKIP] Extraction error for ${f.name}: ${extData.error}`);
                batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[EXTRACTION FAILED]", "N/A", "N/A", "System Error during reading", extData.error, "N/A", 0, "EXTRACTION_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", ""]);
                moveToReview(f.id, extData.error);
            } else {
                f.parts = extData.part;
                validFiles.push(f);
            }
        }
    });

    if (validFiles.length === 0) {
        writeDriveLogBatch(logSheet, batchLogs);
        return;
    }

    // 2. AI INFERENCE (For files that missed the fast-path)
    let filesForAI = validFiles.filter(f => !f.aiBypass);
    let aiResultsData = [];
    let aiSuccess = true;
    let tpf = 0;

    if (filesForAI.length > 0) {
        const aiResult = askGeminiStable(rules, filesForAI, currentModel);
        if (aiResult.status === "SUCCESS" && aiResult.data.length === filesForAI.length) {
            aiResultsData = aiResult.data;
            tpf = Math.round(aiResult.tokens / filesForAI.length);
        } else {
            aiSuccess = false;
            // Retry logic
            if (filesForAI.length > 1) {
                if (batchLogs.length > 0) {
                    logSheet.getRange(logSheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
                    batchLogs.length = 0;
                }
                filesForAI.forEach(single => processAndLog([single], rules, logSheet, mode, currentModel, driveRules, folderCache));
                filesForAI = []; // Prevent double processing
            } else {
                const f = filesForAI[0];
                console.error(`   [API REJECTED] ${f.name}: ${aiResult.message}`);
                batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[REJECTED]", "N/A", "N/A", "API Error", aiResult.message, "Review Required", 0, "API_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", ""]);
                moveToReview(f.id, aiResult.message);
                filesForAI = [];
            }
        }
        Utilities.sleep(1500); // Rate Limit Protection
    }

    // 3. APPLY CATEGORIZATION & MOVE
    let aiIndex = 0;
    validFiles.forEach(f => {
        let data = null;
        let isBypass = false;
        
        if (f.aiBypass) {
            data = f.aiBypass;
            isBypass = true;
        } else if (aiSuccess && filesForAI.includes(f)) {
            data = aiResultsData[aiIndex++];
        } else {
            return; // Handled in error logic
        }

        try {
            // Taxonomy Path strict alignment mapping
            let path_code = "Unknown";
            let context_id = "Unknown";
            if (data.concat_path && data.concat_path !== "Unknown") {
                const parts = data.concat_path.split(">");
                path_code = parts[0].trim();
                if (parts.length > 1) {
                    context_id = parts[parts.length - 1].trim();
                } else {
                    context_id = path_code;
                }
            }
            
            data.path_code = path_code;
            data.context_id = context_id;

            const finalName = getLockedName(data, f);
            const file = DriveApp.getFileById(f.id);

            file.setName(finalName);
            file.setDescription(`${data.description}\n\nSummary: ${data.summary}`);
            
            let sourceFolderPath = f.folderPath || f.sourceFolderId;

            let moved = false;
            let targetFolderId = f.sourceFolderId; // Default to staying in place
            let targetFolderPath = sourceFolderPath;
            
            if (mode === "ONGOING") {
                targetFolderId = "Root";
                targetFolderPath = "My Drive";
                
                if (data.context_id && data.context_id !== "Unknown") {
                    let targetFolder = null;
                    if (folderCache.byName[data.context_id]) {
                        targetFolder = folderCache.byName[data.context_id];
                    } else {
                        const folders = DriveApp.getFoldersByName(data.context_id);
                        if (folders.hasNext()) {
                            targetFolder = folders.next();
                            folderCache.byName[data.context_id] = targetFolder;
                        }
                    }

                    if (targetFolder) {
                        file.moveTo(targetFolder);
                        targetFolderId = targetFolder.getId();

                        // Also cache full folder paths
                        if (!targetFolder.fullPath) {
                            targetFolder.fullPath = getFullFolderPath(targetFolder);
                        }
                        targetFolderPath = targetFolder.fullPath;
                        moved = true;
                    }
                }
                
                if (!moved) {
                    let reviewFolder = null;
                    if (folderCache.byId[DRIVE_FOLDERS.REVIEW]) {
                        reviewFolder = folderCache.byId[DRIVE_FOLDERS.REVIEW];
                    } else {
                        reviewFolder = DriveApp.getFolderById(DRIVE_FOLDERS.REVIEW);
                        folderCache.byId[DRIVE_FOLDERS.REVIEW] = reviewFolder;
                    }

                    file.moveTo(reviewFolder);
                    targetFolderId = reviewFolder.getId();

                    if (!reviewFolder.fullPath) {
                        reviewFolder.fullPath = getFullFolderPath(reviewFolder);
                    }
                    targetFolderPath = reviewFolder.fullPath;
                    console.log(`   [WARNING] Target folder '${data.context_id}' not found. Moved to Manual Review.`);
                }
            }

            // Aggregation Engine (Task D.13)
            let shortcutsCreated = [];
            let aggPaths = data.aggregator_paths || [];
            
            // Only create shortcuts in ONGOING mode if the primary routing succeeded
            if (mode === "ONGOING" && moved && Array.isArray(aggPaths)) {
                aggPaths.forEach(aggPath => {
                    if (aggPath && aggPath !== "Unknown" && aggPath !== data.concat_path) {
                        const aggParts = aggPath.split(">");
                        const aggContextId = aggParts[aggParts.length - 1].trim();
                        let targetAggFolder = null;
                        if (folderCache.byName[aggContextId]) {
                            targetAggFolder = folderCache.byName[aggContextId];
                        } else {
                            const aggFolders = DriveApp.getFoldersByName(aggContextId);
                            if (aggFolders.hasNext()) {
                                targetAggFolder = aggFolders.next();
                                folderCache.byName[aggContextId] = targetAggFolder;
                            }
                        }
                        
                        if (targetAggFolder) {
                            try {
                                const resource = {
                                    name: finalName,
                                    mimeType: "application/vnd.google-apps.shortcut",
                                    shortcutDetails: { targetId: file.getId() },
                                    parents: [targetAggFolder.getId()]
                                };
                                const shortcut = Drive.Files.create(resource);
                                shortcutsCreated.push(aggContextId);
                            } catch(e) {
                                console.error(`Failed to create shortcut in ${aggContextId}: ${e.message}`);
                            }
                        } else {
                            console.log(`   [WARNING] Aggregator folder '${aggContextId}' not found. Shortcut skipped.`);
                        }
                    }
                });
            }
            const shortcutsLog = shortcutsCreated.length > 0 ? shortcutsCreated.join(", ") : "None";

            const successMsg = isBypass ? `${mode} Success (Fast-Path)` : `${mode} Success`;
            batchLogs.push([file.getUrl(), f.name, f.desc, finalName, data.path_code, data.context_id, data.summary, data.description, data.reasoning, isBypass ? 0 : tpf, successMsg, sourceFolderPath, targetFolderId, targetFolderPath, shortcutsLog, "", "", ""]);
            console.log(`   [OK] Processed: ${finalName}`);
        } catch (e) {
            batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[SYSTEM ERROR]", "N/A", "N/A", "Update Failed", e.message, "N/A", 0, "SYSTEM_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", ""]);
            moveToReview(f.id, e.message);
        }
    });

    writeDriveLogBatch(logSheet, batchLogs);
}

function writeDriveLogBatch(sheet, batchLogs) {
    if (batchLogs.length === 0) return;
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["URL", "Original Name", "Description", "Final Name", "Path Code", "Context ID", "Summary", "Metadata Description", "Reasoning", "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path", "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status"]);
        sheet.getRange("A1:R1").setFontWeight("bold").setBackground("#cfe2f3");
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
}


// --- 4. DETERMINISTIC OVERRIDE LOGIC ---

function getDriveRules() {
    let filenameRules = {};
    let folderRules = {};
    try {
        const ss = SpreadsheetApp.openById(DRIVE_RULES_SHEET_ID);
        const fnSheet = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_FILENAME_RULES_GID);
        if (!fnSheet) {
            console.error(`ERROR: Filename Rules tab with GID ${DRIVE_FILENAME_RULES_GID} not found!`);
        } else {
            const data = fnSheet.getDataRange().getValues();
            data.forEach((row, i) => {
                if (i > 0 && row[0]) {
                    filenameRules[row[0].toString().trim().toLowerCase()] = {
                        concat_path: row[1] ? row[1].toString().trim() : "Unknown",
                        summary: row[2] ? row[2].toString().trim() : "Auto-categorized via Filename Rule",
                        description: row[3] ? row[3].toString().trim() : "0X 0Y ZW",
                        filename: row[4] ? row[4].toString().trim() : null,
                        aggregator_paths: row[5] ? row[5].toString().split(",").map(s => s.trim()) : []
                    };
                }
            });
        }
        const fdSheet = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_FOLDER_RULES_GID);
        if (!fdSheet) {
            console.error(`ERROR: Folder Rules tab with GID ${DRIVE_FOLDER_RULES_GID} not found!`);
        } else {
            const data = fdSheet.getDataRange().getValues();
            data.forEach((row, i) => {
                if (i > 0 && row[0]) {
                    folderRules[row[0].toString().trim()] = {
                        concat_path: row[1] ? row[1].toString().trim() : "Unknown",
                        summary: row[2] ? row[2].toString().trim() : "Auto-categorized via Folder Rule",
                        description: row[3] ? row[3].toString().trim() : "0X 0Y ZW",
                        filename: row[4] ? row[4].toString().trim() : null,
                        aggregator_paths: row[5] ? row[5].toString().split(",").map(s => s.trim()) : []
                    };
                }
            });
        }
    } catch(e) {
        // Silently fail if sheets don't exist yet
    }
    return { filenameRules, folderRules };
}

function checkDeterministicRules(f, driveRules) {
    const fNameLower = f.name.toLowerCase();
    
    if (driveRules.folderRules[f.sourceFolderId]) {
        let rule = driveRules.folderRules[f.sourceFolderId];
        return {
            filename: rule.filename ? rule.filename : f.name,
            concat_path: rule.concat_path,
            aggregator_paths: rule.aggregator_paths,
            summary: rule.summary,
            description: rule.description,
            reasoning: "Deterministic Override (Folder Rule)"
        };
    }

    for (let keyword in driveRules.filenameRules) {
        if (fNameLower.includes(keyword)) {
            let rule = driveRules.filenameRules[keyword];
            return {
                filename: rule.filename ? rule.filename : f.name,
                concat_path: rule.concat_path,
                aggregator_paths: rule.aggregator_paths,
                summary: rule.summary,
                description: rule.description,
                reasoning: `Deterministic Override (Filename Keyword: ${keyword})`
            };
        }
    }
    return null;
}


// --- 5. THE V3 CONTENT EXTRACTOR ---

function extractContentV3(fileObj) {
    const { id, mime, name } = fileObj;
    try {
        const file = DriveApp.getFileById(id);
        const blob = file.getBlob();

        // 1. Vision
        if (mime.includes("image/")) {
            const bytes = blob.getBytes();
            if (bytes.length > 5000000) return { error: "Image too large" };
            return { part: { inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } } };
        }

        // 2. OCR/Office Conversion
        if (mime === "application/pdf" || mime.includes("officedocument") || mime.includes("ms-word") || mime.includes("ms-excel")) {
            const target = (mime.includes("sheet") || mime.includes("excel")) ? MimeType.GOOGLE_SHEETS : MimeType.GOOGLE_DOCS;
            const resource = { name: "TEMP_EXTRACT_" + id, mimeType: target };
            const temp = Drive.Files.create(resource, blob, { ocr: (mime === "application/pdf") });

            let txt = "";
            if (target === MimeType.GOOGLE_DOCS) {
                txt = DocumentApp.openById(temp.id).getBody().getText();
            } else {
                txt = SpreadsheetApp.openById(temp.id).getSheets()[0].getDataRange().getValues().slice(0, 50).map(r => r.join(" | ")).join("\n");
            }
            Drive.Files.remove(temp.id);
            return { part: { text: `CONTENT:\n${txt.substring(0, 8000)}` } };
        }

        // 3. Native & Text
        if (mime === MimeType.GOOGLE_DOCS) return { part: { text: DocumentApp.openById(id).getBody().getText().substring(0, 8000) } };
        return { part: { text: blob.getDataAsString().substring(0, 8000) } };

    } catch (e) { return { error: e.message }; }
}


// --- 6. STABLE API CALL ---

function askGeminiStable(rules, batch, currentModel) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${DRIVE_KEY}`;
    const parts = [{ text: rules }, { text: `Analyze ${batch.length} files. Return JSON ARRAY.` }];
    batch.forEach((f, i) => { 
        parts.push({ text: `--- FILE [${i}] ---\nFilename: ${f.name}\nMETADATA_CONTEXT:\n- dateCreated: ${f.dateCreated || "Unknown"}\n- folder_context: ${f.folderPath || "Unknown"}` }); 
        parts.push(f.parts); 
    });

    const options = { 
        method: "post", 
        contentType: "application/json", 
        payload: JSON.stringify({ 
            contents: [{ role: "user", parts: parts }], 
            generationConfig: { response_mime_type: "application/json", temperature: 0.1 } 
        }), 
        muteHttpExceptions: true 
    };

    let retries = 3; 
    let wait = 2000;
    while (retries > 0) {
        try {
            const resp = UrlFetchApp.fetch(url, options);
            const code = resp.getResponseCode();
            if (code === 200) {
                const res = JSON.parse(resp.getContentText());
                const raw = res.candidates[0].content.parts[0].text;
                const match = raw.match(/\[[\s\S]*\]/);
                if (!match) throw new Error("No JSON array found in response");
                return { status: "SUCCESS", data: JSON.parse(match[0]), tokens: res.usageMetadata.totalTokenCount };
            }
            if (code === 503 || code === 429) { 
                Utilities.sleep(wait); 
                wait *= 2; 
                retries--; 
                continue; 
            }
            return { status: "ERROR", message: `HTTP ${code} - ${resp.getContentText()}` };
        } catch (e) { 
            if (retries > 1) {
                Utilities.sleep(wait);
                wait *= 2;
                retries--;
                continue;
            }
            return { status: "ERROR", message: e.message }; 
        }
    }
    return { status: "ERROR", message: "Timeout/Rate Limit Exhausted" };
}


// --- 7. HELPERS ---

function getArchiveFilesRecursive(folderId, processedSet, limit) {
    const list = []; 
    let rootPath = "Archive";
    try { rootPath = DriveApp.getFolderById(folderId).getName(); } catch(e) {}
    const stack = [{id: folderId, path: rootPath}];
    
    while (stack.length > 0 && list.length < limit) {
        const current = stack.pop();
        try {
            const folder = DriveApp.getFolderById(current.id);
            const files = folder.getFiles();
            while (files.hasNext() && list.length < limit) {
                const f = files.next();
                if (!processedSet.has(f.getId())) {
                    list.push({ 
                        id: f.getId(), 
                        name: f.getName(), 
                        mime: f.getMimeType(), 
                        desc: f.getDescription() || "", 
                        sourceFolderId: current.id,
                        folderPath: current.path,
                        dateCreated: Utilities.formatDate(f.getDateCreated(), "GMT", "yyyy-MM-dd")
                    });
                }
            }
            const subs = folder.getFolders();
            while (subs.hasNext()) {
                const s = subs.next();
                if (s.getName() !== "[File Review]") stack.push({id: s.getId(), path: current.path + "/" + s.getName()});
            }
        } catch (e) { console.error("Error in getArchiveFilesRecursive for folder " + current.id + ": " + e.message); }
    }
    return list;
}

function getLockedName(ai, f) {
    const extMatch = f.name.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0] : "";
    let cleanName = String(ai.filename || f.name).replace(/\.[0-9a-z]+$/i, "");
    cleanName = cleanName.replace(/^([0-9XOYZW]{2}\s[0-9XOYZW]{2}\s[0-9XOYZW]{2}\s*-\s*)/i, "");
    
    return cleanName.endsWith(ext) ? cleanName : cleanName + ext;
}

function getFullFolderPath(folder) {
    let path = folder.getName();
    let parent = folder.getParents();
    while (parent.hasNext()) {
        const p = parent.next();
        path = p.getName() + "/" + path;
        parent = p.getParents();
    }
    return path;
}

function loadKnowledgeDocs() { 
    let instructions = "";
    try {
        const iter1 = DriveApp.getFilesByName("TS - Clerk > System Instructions.md");
        if (iter1.hasNext()) instructions = iter1.next().getBlob().getDataAsString();
    } catch(e){}
    
    let protocol = "";
    try {
        const iter2 = DriveApp.getFilesByName("TS - Master Asset Naming Protocol.md");
        if (iter2.hasNext()) protocol = iter2.next().getBlob().getDataAsString();
    } catch(e){}
    
    if (!instructions) {
        instructions = DocumentApp.openById(DRIVE_DOC_IDS.INSTRUCTIONS).getBody().getText();
    }
    if (!protocol) {
        protocol = DocumentApp.openById(DRIVE_DOC_IDS.PROTOCOL).getBody().getText();
    }

    const taxonomyJson = DriveApp.getFileById(DRIVE_DOC_IDS.TAXONOMY_JSON).getBlob().getDataAsString();
    
    return [instructions, "--- VALID TAXONOMY CATEGORIES (Use 'Concat' logic) ---", taxonomyJson, protocol].join("\n\n"); 
}

function moveToReview(id, msg) { 
    try { 
        const f = DriveApp.getFileById(id); 
        f.setDescription("FAILED: " + msg); 
        f.moveTo(DriveApp.getFolderById(DRIVE_FOLDERS.REVIEW)); 
    } catch (e) { 
        console.error("Error in moveToReview for ID " + id + ": " + e.message); 
    } 
}

// =============================================================================
// 8. MANUAL OVERRIDE ENGINE
// =============================================================================

/**
 * Scans the Execution Log for manual label corrections in the 'Revised Name' or 'Revised Path' columns,
 * applies them to the original Drive file, and marks them as synced.
 */
function applyManualRevisionsDrive() {
    const ss = SpreadsheetApp.openById(DRIVE_MASTER_SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_LOG_GID);
    
    if (!sheet) {
        console.log("Drive Execution Log sheet not found.");
        return;
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const headers = data[0];
    
    const urlCol = headers.indexOf("URL");
    const revisedPathCol = headers.indexOf("Revised Path (Override)");
    const revisedNameCol = headers.indexOf("Revised Name (Override)");
    const statusCol = headers.indexOf("Override Status");
    
    if (urlCol === -1 || revisedPathCol === -1 || revisedNameCol === -1 || statusCol === -1) {
        console.log("Required columns not found in the Drive Execution Log.");
        return;
    }
    
    let updates = 0;
    
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const url = row[urlCol];
        const revisedPath = row[revisedPathCol];
        const revisedName = row[revisedNameCol];
        const status = row[statusCol];
        
        if ((revisedPath || revisedName) && status !== "SYNCED") {
            const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
            if (!idMatch) {
                 sheet.getRange(i + 1, statusCol + 1).setValue("ERROR: Invalid Link");
                 continue;
            }
            const fileId = idMatch[1];
            
            try {
                const file = DriveApp.getFileById(fileId);
                
                if (revisedName) {
                    file.setName(revisedName.toString().trim());
                }
                
                if (revisedPath && revisedPath.toString().length > 15) { 
                    try {
                        const newFolder = DriveApp.getFolderById(revisedPath.toString().trim());
                        file.moveTo(newFolder);
                    } catch(e) {
                        console.log("Revised Path is not a valid Folder ID, skipping folder move.");
                    }
                }
                
                sheet.getRange(i + 1, statusCol + 1).setValue("SYNCED");
                updates++;
                console.log(`Applied manual override to file ${fileId}`);
                
            } catch (e) {
                sheet.getRange(i + 1, statusCol + 1).setValue(`ERROR: ${e.message}`);
            }
        }
    }
    
    console.log(`Manual Revisions Complete. Updated ${updates} files.`);
}
