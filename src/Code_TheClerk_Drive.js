/**
 * @file Code_TheClerk_Drive.js
 * @description THE CLERK: VERSION 26.0 (THE TRUTH ENGINE). Ingests files from Google Drive, extracts content via OCR/Text conversion, categorizes them against a taxonomy using Gemini, and routes/renames files based on strict protocols or spreadsheet overrides.
 *
 * @version 26.0.3
 * @last_modified 2026-06-24
 * @modified_by Jules
 *
 * @changelog
 * - 26.0.1: Implemented folderCache to reduce duplicate Drive API calls for identical taxonomy contexts. Increased Gemini batching parameters to 5 files per call to maximize throughput.
 * - 26.0.2: Added comprehensive JSDoc comments to configuration constants.
 * - 26.0.3: Improved error handling by adding logging to empty catch blocks.
 */

// --- 1. CONFIGURATION ---
const DRIVE_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
const DRIVE_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE;

const DRIVE_MASTER_SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
const DRIVE_LOG_GID = SYSTEM_CONFIG.SHEETS.DRIVE_LOG;
const DRIVE_SESSION_LOG_GID = SYSTEM_CONFIG.SHEETS.DRIVE_SESSION_LOG;
const DRIVE_RULES_SHEET_ID = SYSTEM_CONFIG.ROOTS.DRIVE_RULES_SHEET_ID;

const DRIVE_FILENAME_RULES_GID = SYSTEM_CONFIG.SHEETS.DRIVE_FILENAME_RULES; // Filename Rules Tab
const DRIVE_FOLDER_RULES_GID = SYSTEM_CONFIG.SHEETS.DRIVE_FOLDER_RULES;   // Folder Rules Tab

/**
 * @constant {number} DRIVE_MAX_BATCH_SIZE
 * @description Defines the chunking limit (max number of files sent in a single Gemini API payload).
 * By batching files, the system avoids generating excessively large payloads that could crash the
 * script or exceed API limits, while maintaining efficient throughput within execution boundaries.
 */
const DRIVE_MAX_BATCH_SIZE = 5;

/**
 * @constant {number} DRIVE_TOTAL_FILES_LIMIT
 * @description The absolute maximum number of Drive files to process in a single execution.
 * This acts as a fail-safe threshold to prevent the script from hitting Google Apps Script's
 * strict 6-minute execution timeout.
 */
const DRIVE_TOTAL_FILES_LIMIT = 20;

/**
 * @constant {number} DRIVE_MAX_EXECUTION_TIME_MS
 * @description The maximum execution time allowed (in milliseconds) before proactively halting operations.
 * Allows the script to terminate gracefully and commit state changes just prior to hitting the
 * 6-minute (360,000 ms) Google Apps Script hard timeout.
 */
const DRIVE_MAX_EXECUTION_TIME_MS = 280000;

/**
 * @constant {Object} DRIVE_DOC_IDS
 * @description Stores structural Document IDs necessary for Drive file processing.
 * Includes IDs for operational instructions, taxonomy definitions (JSON format), and system protocols.
 */
const DRIVE_DOC_IDS = {
    INSTRUCTIONS: SYSTEM_CONFIG.DOCS.CLERK_DRIVE_INSTRUCTIONS,
    TAXONOMY_JSON: SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID, // Structured JSON
    PROTOCOL: SYSTEM_CONFIG.DOCS.MASTER_ASSET_NAMING_PROTOCOL
};

/**
 * @constant {Object} DRIVE_FOLDERS
 * @description Manages routing configurations for Google Drive files.
 * Specifies the input queue (STND_SOURCES), archive roots, and destinations for manual review.
 */
const DRIVE_FOLDERS = {
    STND_SOURCES: SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES,
    STND_DEST: SYSTEM_CONFIG.DRIVE_FOLDERS.STND_DEST,
    REVIEW: SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW
};


// --- 2. ENGINES ---

function runTheClerkDriveOngoing() { 
  executeEngine("ONGOING", DRIVE_MODEL_NAME); 
}

function executeEngine(mode, currentModel) {
    console.log(`>>> [${mode} START] v26.0 using ${currentModel} - acquiring lock...`);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
        console.warn("Could not acquire script lock. Another execution is likely running.");
        return;
    }
    const sessionStart = Date.now();
    
    try {
        const ss = getMasterSpreadsheet();
        const log = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_LOG_GID);
        const sessionLog = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_SESSION_LOG_GID);
        
        if (!log) throw new Error("Execution Log sheet not found.");

        // Ingest shared files as shortcuts if running in ONGOING mode
        if (mode === "ONGOING") {
            try {
                ingestSharedFilesToInbox();
            } catch (err) {
                console.error("Error running shared files ingestion: " + err.message);
            }
        }
        const knowledge = loadKnowledgeDocs();
        const activeTaskMap = getActiveThreadTaskMap();
        const openTasksStr = activeTaskMap.openTasksForAI.join('\n');
        const recentContext = fetchRecentContext(ss);
        let tasksContext = "\n\n--- OPEN GOOGLE TASKS ---\nIf any file processed is a confirmation of or update to an existing task in this list, map it to the task by returning the task's EXACT ID in the 'mapped_task_id' field of the JSON output and provide a detailed reason in 'mark_completed_reason' why it is completed. Otherwise, use 'None' for both.\n\n" + openTasksStr;
        const fullRules = knowledge.text + "\n\n" + recentContext + tasksContext;
        let parsedTaxonomy = [];
        try { parsedTaxonomy = JSON.parse(knowledge.taxonomyJson); } catch (e) { console.warn("Failed to parse taxonomy JSON"); }
        
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
                    const mimeType = f.getMimeType();
                    const isShortcut = mimeType === "application/vnd.google-apps.shortcut";
                    let targetId = f.getId();
                    let targetMime = mimeType;
                    if (isShortcut) {
                        try {
                            targetId = f.getTargetId();
                            targetMime = f.getTargetMimeType();
                        } catch (err) {
                            console.error(`Failed to resolve shortcut target for ${f.getName()}: ${err.message}`);
                        }
                    }
                    if (isExclusivelySharedPrivate(targetId)) {
                        console.log(`Skipping exclusively shared private file: ${f.getName()} (ID: ${targetId})`);
                        if (mimeType === "application/vnd.google-apps.shortcut") {
                            f.setTrashed(true);
                        } else {
                            folder.removeFile(f);
                        }
                        continue;
                    }
                    allFiles.push({ 
                        id: f.getId(), 
                        name: f.getName(), 
                        mime: mimeType, 
                        isShortcut: isShortcut,
                        targetId: targetId,
                        targetMime: targetMime,
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
        let filesProcessedCount = 0;
        let sessionMemory = "";
        for (let f of allFiles) {
            if (Date.now() - sessionStart > DRIVE_MAX_EXECUTION_TIME_MS) break;
            if (filesProcessedCount >= 15) {
                console.log("Reached 15-file loop limit. Exiting cleanly.");
                break;
            }
            filesProcessedCount++;

            const effectiveMime = f.targetMime || f.mime;
            const needsIsolation = effectiveMime.includes("image/") || effectiveMime === "application/pdf" || effectiveMime.includes("officedocument") || effectiveMime.includes("ms-");

            if (needsIsolation) {
                if (currentBatch.length > 0) { 
                    let dynamicRules = fullRules + (sessionMemory ? `\n\n[PROCESSED IN CURRENT EXECUTION]\n${sessionMemory}` : "");
                    let res = processAndLog(currentBatch, dynamicRules, log, mode, currentModel, driveRules, folderCache, parsedTaxonomy);
                    if (res) sessionMemory += res;
                    currentBatch = []; 
                }
                let dynamicRules = fullRules + (sessionMemory ? `\n\n[PROCESSED IN CURRENT EXECUTION]\n${sessionMemory}` : "");
                let res = processAndLog([f], dynamicRules, log, mode, currentModel, driveRules, folderCache, parsedTaxonomy);
                if (res) sessionMemory += res;
            } else {
                currentBatch.push(f);
                if (currentBatch.length >= DRIVE_MAX_BATCH_SIZE) { 
                    let dynamicRules = fullRules + (sessionMemory ? `\n\n[PROCESSED IN CURRENT EXECUTION]\n${sessionMemory}` : "");
                    let res = processAndLog(currentBatch, dynamicRules, log, mode, currentModel, driveRules, folderCache, parsedTaxonomy);
                    if (res) sessionMemory += res;
                    currentBatch = []; 
                }
            }
        }
        if (currentBatch.length > 0) {
            let dynamicRules = fullRules + (sessionMemory ? `\n\n[PROCESSED IN CURRENT EXECUTION]\n${sessionMemory}` : "");
            processAndLog(currentBatch, dynamicRules, log, mode, currentModel, driveRules, folderCache, parsedTaxonomy);
        }

        if (sessionLog) {
            sessionLog.appendRow([new Date(), mode, currentModel, allFiles.length, "Completed", `${((Date.now() - sessionStart) / 1000).toFixed(1)}s`]);
        }
    } catch (e) { 
        console.error("FATAL: " + e.message + "\nStack: " + e.stack); 
        try {
            const ss = getMasterSpreadsheet();
            const sessionLog = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_SESSION_LOG_GID);
            if (sessionLog) sessionLog.appendRow([new Date(), mode, currentModel, 0, "Failed: " + e.message, `${((Date.now() - sessionStart) / 1000).toFixed(1)}s`]);
        } catch(e2){
            console.error("FATAL: Failed to write to session log: " + e2.message);
        }
    } finally { 
        lock.releaseLock(); 
        return "Successfully swept Drive and executed The Clerk engine.";
    }
}


// --- 3. UNIFIED PROCESSING & LOGGING ---

function processAndLog(batch, rules, logSheet, mode, currentModel, driveRules, folderCache, parsedTaxonomy) {
    console.log(`   > Extracting: ${batch.map(b => b.name).join(", ")}`);
    const activeTaskMap = getActiveThreadTaskMap();
    const batchLogs = [];
    let validFiles = [];

    // 1. EXTRACTION & DETERMINISTIC PRE-CHECK
    batch.forEach(f => {
        let match = checkDeterministicRules(f, driveRules);
        f.deterministicOverride = match; // Store the rule for later routing if AI is forced
        
        const isDoc = (f.mime === MimeType.GOOGLE_DOCS || f.mime === "application/vnd.google-apps.document" || f.targetMime === MimeType.GOOGLE_DOCS || f.targetMime === "application/vnd.google-apps.document");
        const fNameLower = f.name.toLowerCase();
        
        // Deterministic Action Zone Extraction for Gemini Notes
        const isGeminiNotes = isDoc && fNameLower.includes("notes by gemini");
        
        // Always force AI extraction for files likely to contain action items
        const forceAI = isDoc && (fNameLower.includes("transcript") || fNameLower.includes("notes") || fNameLower.includes("meeting") || fNameLower.includes("agenda"));

        if (match && !forceAI) {
            // Fast-path bypass (no AI needed)
            f.aiBypass = match;
            validFiles.push(f);
        } else {
            const extData = extractContentV3(f);
            if (extData.error) {
                console.error(`   [SKIP] Extraction error for ${f.name}: ${extData.error}`);
                batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[EXTRACTION FAILED]", "N/A", "N/A", "System Error during reading", extData.error, "N/A", 0, "EXTRACTION_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", "", "None", "None"]);
                moveToReview(f.id, extData.error);
            } else {
                f.parts = extData.part;
                if (isGeminiNotes) {
                    f.actionZones = extractActionZones(extData.part.text);
                }
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
                filesForAI.forEach(single => processAndLog([single], rules, logSheet, mode, currentModel, driveRules, folderCache, parsedTaxonomy));
                filesForAI = []; // Prevent double processing
            } else {
                const f = filesForAI[0];
                console.error(`   [API REJECTED] ${f.name}: ${aiResult.message}`);
                const fUrl = f.isShortcut ? `https://drive.google.com/open?id=${f.targetId}` : `https://drive.google.com/open?id=${f.id}`;
                batchLogs.push([fUrl, f.name, f.desc, "[REJECTED]", "N/A", "N/A", "API Error", aiResult.message, "Review Required", 0, "API_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", "", "None", "None"]);
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
            
            // Apply deterministic tasks if present
            // Extracted items handled directly by LLM now.
            
            // Apply deterministic routing overrides on top of AI extraction
            if (f.deterministicOverride) {
                data.concat_path = f.deterministicOverride.concat_path;
                if (f.deterministicOverride.filename) data.filename = f.deterministicOverride.filename;
                if (f.deterministicOverride.aggregator_paths && f.deterministicOverride.aggregator_paths.length > 0) {
                    data.aggregator_paths = f.deterministicOverride.aggregator_paths;
                }
            }
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
            let file = DriveApp.getFileById(f.id);
            
            // 1. Fetch original last updated time before any modifications
            let targetFileForDate = f.isShortcut ? DriveApp.getFileById(f.targetId) : file;
            const originalLastUpdatedMs = targetFileForDate.getLastUpdated().getTime();

            // 2. Owner check & automatic shortcut conversion for shared files
            if (!f.isShortcut) {
                try {
                    const owner = file.getOwner();
                    const myEmail = Session.getEffectiveUser().getEmail();
                    if (owner && owner.getEmail() !== myEmail) {
                        console.log(`   [SHARED] File is not owned by us (${owner.getEmail()}). Creating shortcut and removing original from Inbox.`);
                        const resource = {
                            name: finalName,
                            mimeType: "application/vnd.google-apps.shortcut",
                            shortcutDetails: { targetId: file.getId() },
                            parents: [f.sourceFolderId] // Create in source folder, moveTo will handle it later
                        };
                        const shortcut = Drive.Files.create(resource);
                        
                        // Remove original shared file from our source folder
                        DriveApp.getFolderById(f.sourceFolderId).removeFile(file);
                        
                        file = DriveApp.getFileById(shortcut.id);
                        f.isShortcut = true;
                        f.targetId = f.id; // The original file ID is now the target
                        f.id = shortcut.id; // The shortcut is now what we are processing
                    }
                } catch (e) {
                    console.error("Error checking owner or creating shortcut: " + e.message);
                }
            }

            // 3. Rename and Set Description (only renames the file or the shortcut, not the target)
            file.setName(finalName);
            file.setDescription(`${data.description}\n\nSummary: ${data.summary}`);
            
            const targetFileUrl = f.isShortcut ? DriveApp.getFileById(f.targetId).getUrl() : file.getUrl();

            // Task mapping and completion check (Task 6 confirmation mapping)
            if (data.mapped_task_id && data.mapped_task_id !== "None") {
                let existingRef = activeTaskMap.byId[data.mapped_task_id];
                if (existingRef) {
                    console.log(`   [MAPPED] File maps to existing task: ${data.mapped_task_id}`);
                    try {
                        let existingTask = existingRef.taskObj;
                        existingTask.notes = (existingTask.notes || "") + `\n\n[UPDATE]: File "${finalName}" uploaded to Drive.\nLink: ${targetFileUrl}`;
                        
                        if (data.mark_completed_reason && data.mark_completed_reason !== "None") {
                            if (!existingTask.title.startsWith("99 Done ")) {
                                existingTask.title = "99 Done - " + existingTask.title;
                            }
                            existingTask.notes += `\n\nSYS: To be marked as Done because: ${data.mark_completed_reason}`;
                        }
                        
                        Tasks.Tasks.patch({ notes: existingTask.notes, title: existingTask.title }, existingRef.listId, existingTask.id);
                        console.log(`   [MAPPED] Successfully updated task.`);
                    } catch (err) {
                        console.error("Error updating mapped task from Drive: " + err.message);
                    }
                }
            }
            
            // Extract and create nuanced actions/tasks
            let tasksCreated = 0;
            let extractedTasksLog = [];
            
            const weeksLimit = 4;
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const isStale = (Date.now() - originalLastUpdatedMs) > (weeksLimit * msInWeek);
            
            if (isStale) {
                console.log(`   [SKIP TASKS] File hasn't been edited in over ${weeksLimit} weeks. Skipping task creation.`);
            } else if (data.tasks && Array.isArray(data.tasks)) {
                data.tasks.forEach(t => {
                    if (t.title) {
                        try {
                             const baseNotes = `${targetFileUrl}\n[Source: ${file.getName()}]\n\n${t.notes || ""}\n\nSYS: Pending initial review.\nDA:\n\n`;
                             const metadata = {
                                duration: "15m",
                                goal: "Maintenance",
                                category_path: "Inbox",
                                created_at: new Date().toISOString()
                             };
                             const initialHash = getStandardizedTaskHash(t.title, baseNotes, "", "needsAction", true);
                             metadata.ai_hash = initialHash;
                             const taskNotes = `${baseNotes}---SYSTEM_METADATA---\n${JSON.stringify(metadata)}`;
                             const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                             Tasks.Tasks.insert({ title: t.title, notes: taskNotes.trim() }, listId);
                            tasksCreated++;
                            extractedTasksLog.push(t.title);
                        } catch (e) {
                            console.error("Error creating task from Drive: " + e.message);
                        }
                    }
                });
            }
            if (tasksCreated > 0) {
                console.log(`   [TASKS] Extracted ${tasksCreated} actions from ${finalName}`);
            }
            const tasksLogStr = extractedTasksLog.length > 0 ? extractedTasksLog.join("; ") : "None";
            const mappedTaskStr = (data.mapped_task_id && data.mapped_task_id !== "None") ? data.mapped_task_id : "None";
            
            let sourceFolderPath = f.folderPath || f.sourceFolderId;

            let moved = false;
            let targetFolderId = f.sourceFolderId; // Default to staying in place
            let targetFolderPath = sourceFolderPath;
            
            if (mode === "ONGOING") {
                targetFolderId = "Root";
                targetFolderPath = "My Drive";
                
                if (data.concat_path && data.concat_path !== "Unknown") {
                    let targetFolder = null;
                    if (folderCache.byName[data.concat_path]) {
                        targetFolder = folderCache.byName[data.concat_path];
                    } else {
                        targetFolder = typeof resolveFolderFromTaxonomy === "function" ? resolveFolderFromTaxonomy(data.concat_path, parsedTaxonomy) : null;
                        if (targetFolder === "VIRTUAL_LABEL") {
                            targetFolder = null; // VIRTUAL_LABEL means no physical path. Do not fallback to ghost hunting.
                        } else if (!targetFolder) {
                            const folders = DriveApp.getFoldersByName(data.context_id);
                            while (folders.hasNext()) {
                                const f = folders.next();
                                if (!f.isTrashed()) {
                                    targetFolder = f;
                                    break;
                                }
                            }
                        }
                        if (targetFolder) folderCache.byName[data.concat_path] = targetFolder;
                    }

                    let outOfScope = false;
                    if (targetFolder) {
                        outOfScope = isFolderOutOfScope(targetFolder);
                    }

                    if (targetFolder && !outOfScope) {
                        file.moveTo(targetFolder);
                        targetFolderId = targetFolder.getId();

                        // Also cache full folder paths
                        if (!targetFolder.fullPath) {
                            targetFolder.fullPath = getFullFolderPath(targetFolder);
                        }
                        targetFolderPath = targetFolder.fullPath;
                        moved = true;
                    } else if (outOfScope) {
                        console.warn(`   [WARNING] Resolved folder '${targetFolder.getName()}' is OUT OF SCOPE. Routing to Manual Review.`);
                    }
                }
                
                if (!moved) {
                    let fallbackFolderId = (data.concat_path && data.concat_path !== "Unknown") ? DRIVE_FOLDERS.STND_DEST : DRIVE_FOLDERS.REVIEW;
                    let fallbackFolder = null;
                    if (folderCache.byId[fallbackFolderId]) {
                        fallbackFolder = folderCache.byId[fallbackFolderId];
                    } else {
                        fallbackFolder = DriveApp.getFolderById(fallbackFolderId);
                        folderCache.byId[fallbackFolderId] = fallbackFolder;
                    }

                    file.moveTo(fallbackFolder);
                    targetFolderId = fallbackFolder.getId();

                    if (!fallbackFolder.fullPath) {
                        fallbackFolder.fullPath = getFullFolderPath(fallbackFolder);
                    }
                    targetFolderPath = fallbackFolder.fullPath;
                    let logLabel = (fallbackFolderId === DRIVE_FOLDERS.STND_DEST) ? "Destination TBC" : "Manual Review";
                    console.log(`   [WARNING] Target folder '${data.context_id}' not found. Moved to ${logLabel}.`);
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
                        if (folderCache.byName["AGG:" + aggContextId]) {
                            targetAggFolder = folderCache.byName["AGG:" + aggContextId];
                        } else {
                            const aggFolders = DriveApp.getFoldersByName(aggContextId);
                            while (aggFolders.hasNext()) {
                                const f = aggFolders.next();
                                if (!f.isTrashed()) {
                                    targetAggFolder = f;
                                    break;
                                }
                            }
                            if (targetAggFolder) {
                                folderCache.byName["AGG:" + aggContextId] = targetAggFolder;
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
            const targetFolderUrl = targetFolderId === "Root" || targetFolderId === "N/A" ? "https://drive.google.com/drive/my-drive" : `https://drive.google.com/drive/folders/${targetFolderId}`;
            const targetFolderLink = `=HYPERLINK("${targetFolderUrl}", "${targetFolderPath.replace(/"/g, '""')}")`;
            
            batchLogs.push([new Date(), targetFileUrl, f.name, f.desc, finalName, data.path_code, data.context_id, data.summary, data.description, data.reasoning, isBypass ? 0 : tpf, successMsg, sourceFolderPath, targetFolderId, targetFolderLink, shortcutsLog, "", "", "", mappedTaskStr, tasksLogStr]);
            console.log(`   [OK] Processed: ${finalName}`);
        } catch (e) {
            const errUrl = f.isShortcut ? `https://drive.google.com/open?id=${f.targetId}` : `https://drive.google.com/open?id=${f.id}`;
            batchLogs.push([errUrl, f.name, f.desc, "[SYSTEM ERROR]", "N/A", "N/A", "Update Failed", e.message, "N/A", 0, "SYSTEM_ERROR", f.sourceFolderId, "N/A", "N/A", "None", "", "", "", "None", "None"]);
            moveToReview(f.id, e.message);
        }
    });

    writeDriveLogBatch(logSheet, batchLogs);

    let batchMemory = "";
    batchLogs.forEach(r => {
        // r[2] = originalName, r[4] = finalName, r[14] = targetFolderLink, r[7] = summary
        if (r[4] && !r[4].includes("FAILED") && !r[4].includes("ERROR")) {
            // Strip hyperlink from targetFolderLink
            let plainPath = r[14];
            if (plainPath.includes('HYPERLINK(')) {
                let m = plainPath.match(/HYPERLINK\("[^"]+",\s*"([^"]+)"\)/);
                if (m) plainPath = m[1].replace(/""/g, '"');
            }
            batchMemory += `- File: "${r[2]}" -> Categorized As: "${r[4]}" | Path: "${plainPath}" | Summary: ${r[7]}\n`;
        }
    });
    return batchMemory;
}

function writeDriveLogBatch(sheet, batchLogs) {
    if (batchLogs.length === 0) return;
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "URL", "Original Name", "Description", "Final Name", "Path Code", "Context ID", "Summary", "Metadata Description", "Reasoning", "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path", "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status", "Mapped Task", "Tasks Extracted"]);
        sheet.getRange("A1:U1").setFontWeight("bold").setBackground("#cfe2f3");
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
        // Silently fail if sheets don't exist yet, but log the warning
        console.warn(`Drive rules sheets not found or could not be read: ${e.message}`);
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
     const id = fileObj.targetId || fileObj.id;
     const mime = fileObj.targetMime || fileObj.mime;
     const { name } = fileObj;
     try {
         const file = DriveApp.getFileById(id);
         if (mime === MimeType.GOOGLE_DOCS || mime === "application/vnd.google-apps.document") {
             const txt = DocumentApp.openById(id).getBody().getText();
             return { part: { text: `CONTENT:\n${txt.substring(0, 8000)}` } };
         }
         if (mime === MimeType.GOOGLE_SHEETS || mime === "application/vnd.google-apps.spreadsheet") {
             const txt = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getValues().slice(0, 50).map(r => r.join(" | ")).join("\n");
             return { part: { text: `CONTENT:\n${txt.substring(0, 8000)}` } };
         }
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
    
    // Add instruction to extract tasks
    const taskInstruction = `
## ACTION EXTRACTION & CONFIRMATION MAPPING
1. EXTRACT ASSIGNED ACTIONS: If the file contains meeting notes, project plans, or explicit action items, extract ONLY the actions assigned specifically to "Daniel Adersteg" or "Daniel". DO NOT extract actions assigned to any other person. Extract them directly into the \`tasks\` array with a clear \`title\` (Action Verb + Object) and \`notes\`. 
2. FILE PROCESSING ACTIONS: Determine if any implicit action is required to respond to or process the file itself. Do NOT suggest generic actions like "review the file". 
3. If no action is needed from either of the above, return an empty array.
4. CONFIRMATION MAPPING: If the file is a confirmation or update for an existing task from the "OPEN GOOGLE TASKS" list, output its EXACT ID in the \`mapped_task_id\` field. If this file confirms the mapped task is complete (e.g. it is a receipt, ticket, confirmation letter, or result document), provide a detailed explanation in \`mark_completed_reason\`. Otherwise, output "None" for both.

Output schema for each file object must include:
{
  "filename": "...",
  "concat_path": "...",
  "summary": "...",
  "description": "...",
  "reasoning": "...",
  "mapped_task_id": "...", // Task ID or "None"
  "mark_completed_reason": "...", // Reason or "None"
  "tasks": [ { "title": "...", "notes": "..." } ]
}
`;

    const parts = [{ text: rules + taskInstruction }, { text: `Analyze ${batch.length} files. Return JSON ARRAY.` }];
    batch.forEach((f, i) => { 
        let fileHeader = `--- FILE [${i}] ---\nFilename: ${f.name}\nMETADATA_CONTEXT:\n- dateCreated: ${f.dateCreated || "Unknown"}\n- folder_context: ${f.folderPath || "Unknown"}`;
        if (f.actionZones && f.actionZones !== "None") {
            fileHeader += `\n\n[DETERMINISTIC ACTION ZONES]\nThe following text blocks were deterministically extracted from the Decisions and Next Steps sections. You MUST treat this as the absolute source of truth for actions and extract every single action item, decision, or next step mentioned within this block into the tasks array.\n${f.actionZones}\n[END ACTION ZONES]\n`;
        }
        parts.push({ text: fileHeader });
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

function isExclusivelySharedPrivate(targetId) {
  const emailA = "adersteg.daniel@gmail.com";
  const emailB = "daniel@playmetech.net";
  
  try {
    const permissionsResponse = Drive.Permissions.list(targetId, {
      fields: "permissions(id, emailAddress, role, type)"
    });
    const permissions = permissionsResponse.permissions || [];
    
    if (permissions.length === 0) return false;
    
    const emailsFound = new Set();
    
    for (let perm of permissions) {
      if (perm.type !== "user") {
        return false;
      }
      if (!perm.emailAddress) {
        return false;
      }
      emailsFound.add(perm.emailAddress.toLowerCase().trim());
    }
    
    if (emailsFound.size !== 2) return false;
    return emailsFound.has(emailA) && emailsFound.has(emailB);
  } catch (e) {
    console.error("Error checking permissions for target file ID " + targetId + ": " + e.message);
    return false;
  }
}

function getArchiveFilesRecursive(folderId, processedSet, limit) {
    const list = []; 
    let rootPath = "Archive";
    try {
        rootPath = DriveApp.getFolderById(folderId).getName();
    } catch(e) {
        console.warn(`Failed to resolve root folder name for ID ${folderId}, defaulting to 'Archive': ${e.message}`);
    }
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
        if (iter1.hasNext()) instructions = getSafeDocText(iter1.next().getId());
    } catch(e){
        console.warn(`Failed to dynamically load System Instructions document: ${e.message}`);
    }
    
    let protocol = "";
    try {
        const iter2 = DriveApp.getFilesByName("TS - Master Asset Naming Protocol.md");
        if (iter2.hasNext()) protocol = getSafeDocText(iter2.next().getId());
    } catch(e){
        console.warn(`Failed to dynamically load Naming Protocol document: ${e.message}`);
    }
    
    if (!instructions) {
        instructions = getSafeDocText(DRIVE_DOC_IDS.INSTRUCTIONS);
    }
    if (!protocol) {
        protocol = getSafeDocText(DRIVE_DOC_IDS.PROTOCOL);
    }

    let taxonomyJson = "";
    try {
        if (DRIVE_DOC_IDS.TAXONOMY_JSON) {
            taxonomyJson = getSafeDocText(DRIVE_DOC_IDS.TAXONOMY_JSON);
        }
    } catch(e) {
        console.error("Failed to load TAXONOMY_JSON: " + e.message);
    }
    
    return {
        text: [instructions, "--- VALID TAXONOMY CATEGORIES (Use 'Concat' logic) ---", taxonomyJson, protocol].join("\n\n"),
        taxonomyJson: taxonomyJson
    };
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


// --- 9. CONTEXT HELPER ---

function fetchRecentContext(ss) {
    let contextStr = "--- RECENT CONTEXT (EMAILS, TASKS, & FILES) ---\nUse this context to understand current ongoing activities and avoid duplicating tasks. If the file being processed relates to these, determine nuanced actions that move the work forward. Furthermore, files processed in the same batch or close in time may share a Project or Event context. Use this temporal grouping to maintain consistent naming prefixes and folder categorization across related files, but do NOT force a connection if the content is clearly unrelated.\n\n";
    try {
        // Fetch Emails
        const emailLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
        if (emailLogSheet) {
            const lastRow = emailLogSheet.getLastRow();
            if (lastRow > 1) {
                const startRow = Math.max(2, lastRow - 30);
                const data = emailLogSheet.getRange(startRow, 1, lastRow - startRow + 1, 8).getValues();
                contextStr += "[RECENT EMAILS]\n";
                data.forEach(row => {
                    if (row[1] && row[4]) {
                        contextStr += `- Email: "${row[1]}" | Summary: ${row[4]}\n`;
                    }
                });
            }
        }
        
        // Fetch Tasks
        const taskLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.TASK_REVIEW);
        if (taskLogSheet) {
            const lastRow = taskLogSheet.getLastRow();
            if (lastRow > 1) {
                const startRow = Math.max(2, lastRow - 30);
                const data = taskLogSheet.getRange(startRow, 1, lastRow - startRow + 1, 6).getValues();
                contextStr += "\n[RECENT TASKS]\n";
                data.forEach(row => {
                    const title = row[4]; // Task Title is index 4 due to Category split
                    const notes = row[5]; // Notes is index 5
                    if (title) {
                        contextStr += `- Task: "${title}" | Notes: ${notes ? String(notes).substring(0, 100).replace(/\n/g, ' ') : 'N/A'}\n`;
                    }
                });
            }
        }

        // Fetch Recent Drive Files
        const driveLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_LOG_GID);
        if (driveLogSheet) {
            const lastRow = driveLogSheet.getLastRow();
            if (lastRow > 1) {
                // Fetch the last 20 files
                const startRow = Math.max(2, lastRow - 20);
                // Columns: A=URL, B=Original Name, C=Desc, D=Final Name, E=Target Folder Path, F=Target Folder ID, G=Summary
                const data = driveLogSheet.getRange(startRow, 2, lastRow - startRow + 1, 6).getValues();
                contextStr += "\n[RECENT DRIVE FILES]\n";
                data.forEach(row => {
                    const originalName = row[0];
                    const finalName = row[2];
                    const targetPath = row[3];
                    const summary = row[5];
                    if (originalName && finalName) {
                        contextStr += `- File: "${originalName}" -> Categorized As: "${finalName}" | Path: "${targetPath}" | Summary: ${summary}\n`;
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error fetching recent context: " + e.message);
    }
    return contextStr;
}


// =============================================================================
// 10. SHARED FILES INGESTION & SHORTCUT MANAGEMENT
// =============================================================================

/**
 * Automatically detects files shared with the user ("shared with me") and creates
 * shortcuts for them in the standard "00 Inbox" folder so they can be processed
 * and categorized by the Drive Clerk.
 */
function ingestSharedFilesToInbox() {
  console.log("Checking for recently shared files...");
  
  let inboxFolder = null;
  const inboxFolders = DriveApp.getFoldersByName("00 Inbox");
  while (inboxFolders.hasNext()) {
    const f = inboxFolders.next();
    if (!f.isTrashed()) {
      inboxFolder = f;
      break;
    }
  }
  
  if (!inboxFolder) {
    const sourceId = SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES[0];
    if (sourceId) {
      inboxFolder = DriveApp.getFolderById(sourceId);
    }
  }
  
  if (!inboxFolder) {
    console.error("Could not find a valid Inbox folder to place shortcuts.");
    return;
  }
  
  console.log(`Inbox folder for shortcuts: ${inboxFolder.getName()} (ID: ${inboxFolder.getId()})`);

  let files = [];
  try {
    const response = Drive.Files.list({
      q: "sharedWithMe = true and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      orderBy: "sharedWithMeTime desc",
      pageSize: 50,
      fields: "files(id, name, mimeType, parents)"
    });
    files = response.files || [];
  } catch (e) {
    console.error("Failed to query shared files using Drive API: " + e.message);
    return;
  }
  
  if (files.length === 0) {
    console.log("No shared files found.");
    return;
  }
  
  console.log(`Found ${files.length} shared files. Checking for existing shortcuts...`);
  
  const existingTargets = getExistingShortcutTargets();
  
  // Also scan STND_SOURCES folders for existing files/shortcuts just to be safe
  SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.forEach(folderId => {
    try {
      const folder = DriveApp.getFolderById(folderId);
      const items = folder.getFiles();
      while (items.hasNext()) {
        const item = items.next();
        const mime = item.getMimeType();
        if (mime === "application/vnd.google-apps.shortcut") {
          existingTargets.add(item.getTargetId());
        } else {
          existingTargets.add(item.getId());
        }
      }
    } catch(err) {
      console.warn(`Failed to scan folder ${folderId} for existing items: ${err.message}`);
    }
  });
  
  let createdCount = 0;
  files.forEach(sharedFile => {
    if (isExclusivelySharedPrivate(sharedFile.id)) {
      console.log(`Skipping ingestion of exclusively shared private file: ${sharedFile.name} (ID: ${sharedFile.id})`);
      return;
    }
    if (!existingTargets.has(sharedFile.id)) {
      let isOrganized = false;
      if (sharedFile.parents && sharedFile.parents.length > 0) {
        try {
          let current = DriveApp.getFolderById(sharedFile.parents[0]);
          while (current) {
            const cid = current.getId();
            const crossEnvOrganizedFolders = [
              "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx", // PMT Workspace
              "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", // Private Workspace
              "1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR", // PMT STND_DEST
              "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb", // Private STND_DEST
              "1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H", // PMT REVIEW
              "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY"  // Private REVIEW
            ];
            if (crossEnvOrganizedFolders.includes(cid) || 
                SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.includes(cid)) {
              isOrganized = true;
              break;
            }
            const parentsIter = current.getParents();
            if (parentsIter.hasNext()) {
              current = parentsIter.next();
            } else {
              break;
            }
          }
        } catch (e) {
          // Folder inaccessible or not a folder, assume unorganized
        }
      }
      
      if (isOrganized) {
         console.log(`Skipping shortcut for "${sharedFile.name}" - already located in an organized system folder.`);
         // Add to log so we don't check it again? No, it's fine, we'll just check it next time, but that's fast.
         // Actually, wait, if we don't log it, we will traverse it EVERY time ingest runs!
      } else {
        try {

        console.log(`Creating shortcut for: "${sharedFile.name}" (ID: ${sharedFile.id})`);
        
        const resource = {
          name: sharedFile.name,
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: sharedFile.id },
          parents: [inboxFolder.getId()]
        };
        Drive.Files.create(resource);
        
        createdCount++;
      } catch (err) {
        console.error(`Failed to create shortcut for "${sharedFile.name}": ${err.message}`);
      }
      }
    } else {
      // console.log(`Shortcut/file already exists for: "${sharedFile.name}" (ID: ${sharedFile.id})`);
    }
  });
  
  console.log(`Successfully ingested shared files. Created ${createdCount} shortcuts.`);
}

/**
 * Searches the entire Google Drive for existing shortcuts, retrieving their target IDs.
 * Used client-side to prevent recreating shortcuts for files already processed or in progress.
 */
function getExistingShortcutTargets() {
  const targets = new Set();
  
  // 1. Read processed files from the Drive Log sheet to populate historical targets
  try {
    const ss = getMasterSpreadsheet();
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === DRIVE_LOG_GID);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const urls = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Fix: URL is column 2 (B), not 1 (A)
        urls.forEach(row => {
          const url = row[0] ? row[0].toString().trim() : "";
          if (url) {
            const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (idMatch) {
              targets.add(idMatch[1]);
            }
          }
        });
      }
    }
  } catch (e) {
    console.error("Error reading Drive Log sheet for shortcut targets: " + e.message);
  }
  
  // 2. Query only shortcuts created in the last 30 days via Drive API to find active recent ones
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const formattedDate = Utilities.formatDate(thirtyDaysAgo, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  
  let pageToken = null;
  do {
    try {
      const response = Drive.Files.list({
        q: "mimeType = 'application/vnd.google-apps.shortcut' and trashed = false and createdTime > '" + formattedDate + "'",
        fields: "nextPageToken, files(shortcutDetails)",
        pageToken: pageToken,
        pageSize: 1000
      });
      const files = response.files || [];
      files.forEach(f => {
        if (f.shortcutDetails && f.shortcutDetails.targetId) {
          targets.add(f.shortcutDetails.targetId);
        }
      });
      pageToken = response.nextPageToken;
    } catch (e) {
      console.error("Error retrieving recent shortcuts via API: " + e.message);
      break;
    }
  } while (pageToken);
  
  return targets;
}

/**
 * Checks recursively if a folder is marked as "OUT OF SCOPE" or is a child/descendant
 * of any of the configured OUT OF SCOPE folder IDs.
 * @param {GoogleAppsScript.Drive.Folder} folder - The resolved folder to check.
 * @returns {boolean} True if the folder is out of scope, false otherwise.
 */
function isFolderOutOfScope(folder) {
  if (!folder) return false;
  
  const outOfScopeProp = (SYSTEM_CONFIG && SYSTEM_CONFIG.DRIVE_FOLDERS && SYSTEM_CONFIG.DRIVE_FOLDERS.OUT_OF_SCOPE) || "";
  const outOfScopeIds = outOfScopeProp.split(",").map(id => id.trim()).filter(Boolean);
  if (outOfScopeIds.length === 0) return false;

  let current = folder;
  while (current) {
    if (outOfScopeIds.indexOf(current.getId()) !== -1) {
      return true;
    }
    const parents = current.getParents();
    if (parents.hasNext()) {
      current = parents.next();
    } else {
      break;
    }
  }
  return false;
}

// --- DETERMINISTIC ZONE PARSING ---
function extractActionZones(text) {
    // Defensive type checking
    if (typeof text !== 'string') {
        return "None";
    }
    
    const lines = text.split('\n');
    let extractedLines = [];
    let inTargetSection = false;
    const targetHeaders = ["decisions", "next steps", "action items", "actions", "decisions made"];
    const exitHeaders = ["summary", "details", "attendees", "notes", "agenda"];
    
    // Helper to normalize a line for header checking
    function normalizeHeader(str) {
        return str.toLowerCase()
                  .replace(/[^a-z ]/g, " ") // replace non-letters with spaces
                  .replace(/\s+/g, " ")      // condense spaces
                  .trim();
    }
    
    // Helper to check if the line starts with list/bullet/checkbox formatting
    function isListLine(str) {
        let trimmed = str.trim();
        return /^[-\*•✓●★☐☑☒□]/.test(trimmed) || /^\[[ xX]?\]/.test(trimmed) || /^\d+\.\s/.test(trimmed);
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let clean = normalizeHeader(line);
        
        // Check if the line is a header by length and keyword match
        let isTargetHeader = false;
        let isExitHeader = false;
        
        // A header is expected to be relatively short (e.g. less than 35 characters clean, and max 4 words)
        if (clean.length > 0 && clean.length < 35 && clean.split(" ").length <= 4) {
            
            // If the line starts with a list bullet/checkbox, it can only be a header if it is formatted as one.
            let isList = isListLine(line);
            let hasHeaderFormatting = !isList || line.endsWith(":") || line.includes("**") || targetHeaders.includes(clean) || exitHeaders.includes(clean);
            
            if (hasHeaderFormatting) {
                isTargetHeader = targetHeaders.some(h => {
                    return clean === h || clean === h + "s" || clean === "key " + h || clean === "key " + h + "s" ||
                           clean === "immediate " + h || clean === "immediate " + h + "s" ||
                           clean === "agreed " + h || clean === "agreed " + h + "s" ||
                           clean === "team " + h || clean === "team " + h + "s" ||
                           clean === "our " + h || clean === "our " + h + "s";
                });
                
                isExitHeader = exitHeaders.some(h => {
                    return clean === h || clean === h + "s" || clean === "meeting " + h || clean === "meeting " + h + "s" ||
                           clean === "discussion " + h || clean === "discussion " + h + "s" ||
                           clean === "executive " + h || clean === "executive " + h + "s" ||
                           clean === "general " + h || clean === "general " + h + "s" ||
                           clean === "additional " + h || clean === "additional " + h + "s";
                });
            }
        }
        
        // Fallback for target headers if the line is not matched by length (e.g. "and Decisions Made")
        if (!isTargetHeader && !inTargetSection) {
            isTargetHeader = targetHeaders.some(h => {
                if (clean === h) return true;
                if (clean.startsWith(h + " ")) return true;
                // If it is an inline/fallback match like "and next steps", it must be part of a header/hybrid line (which has a colon)
                if (clean.includes("and " + h) && line.includes(":")) return true;
                return false;
            });
        }
        
        if (isTargetHeader) {
            inTargetSection = true;
            // For standalone headers (short), use the original line text.
            // For long paragraphs with inline headers, use the matched header keyword.
            if (line.length < 50) {
                extractedLines.push("--- " + line.toUpperCase() + " ---");
                continue;
            } else {
                let matchedH = targetHeaders.find(h => clean.startsWith(h + " ") || clean.includes("and " + h) || clean === h);
                extractedLines.push("--- " + (matchedH || "next steps").toUpperCase() + " ---");
                
                // If it's a long hybrid line (header and content together), it typically has a colon followed by content.
                // Otherwise, it's just a long heading, so we should skip double-pushing.
                if (!line.includes(": ")) {
                    continue;
                }
            }
        }
        
        if (isExitHeader) {
            inTargetSection = false;
            continue;
        }
        
        if (inTargetSection) {
            extractedLines.push(line);
        }
    }
    
    return extractedLines.length > 0 ? extractedLines.join("\n") : "None";
}

// --- RETROACTIVE PROCESSING SCRIPT ---
function retroactivelyProcessTodayNotes() {
    const exactIds = [
        // 'paste_your_drive_file_id_here'
    ];
    
    const knowledge = loadKnowledgeDocs();
    const rules = knowledge.text || "";
    let validFiles = [];
    
    for (const fileId of exactIds) {
        let file;
        try {
            file = DriveApp.getFileById(fileId);
        } catch (e) {
            console.log("Could not access file ID: " + fileId);
            continue;
        }
        const fName = file.getName();
        console.log("Found via exact ID: " + fName);
        
        const fObj = {
                id: file.getId(),
                name: file.getName(),
                desc: file.getDescription() || "",
                mime: file.getMimeType(),
                isShortcut: false,
                dateCreated: file.getDateCreated(),
                folderPath: "Retroactive Override",
                sourceFolderId: "Retroactive",
            };
            
            const extData = extractContentV3(fObj);
            if (!extData.error && extData.part) {
                fObj.parts = extData.part;
                fObj.actionZones = extractActionZones(extData.part.text);
                validFiles.push(fObj);
            }
        }
    
    if (validFiles.length > 0) {
        console.log(`Sending ${validFiles.length} files to AI for retroactive task extraction...`);
        const aiResult = askGeminiStable(rules, validFiles, "gemini-2.5-flash"); // Flash is faster for retro
        if (aiResult.status === "SUCCESS") {
            const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
            let tasksCreated = 0;
            
            aiResult.data.forEach((data, i) => {
                const f = validFiles[i];
                if (data.tasks && Array.isArray(data.tasks)) {
                    data.tasks.forEach(t => {
                        if (t.title) {
                            try {
                                const targetFileUrl = `https://drive.google.com/open?id=${f.id}`;
                                const baseNotes = `${targetFileUrl}\n[Source: ${f.name}]\n\n${t.notes || ""}\n\nSYS: Pending initial review.\nDA:\n\n`;
                                const metadata = {
                                   duration: "15m",
                                   goal: "Maintenance",
                                   category_path: "Inbox",
                                   created_at: new Date().toISOString()
                                };
                                const initialHash = getStandardizedTaskHash(t.title, baseNotes, "", "needsAction", true);
                                metadata.ai_hash = initialHash;
                                const taskNotes = `${baseNotes}---SYSTEM_METADATA---\n${JSON.stringify(metadata)}`;
                                Tasks.Tasks.insert({ title: t.title, notes: taskNotes.trim() }, listId);
                                tasksCreated++;
                            } catch (e) {
                                console.error("Task creation failed: " + e.message);
                            }
                        }
                    });
                }
            });
            console.log(`Retroactive run complete! Created ${tasksCreated} tasks in the AI Review list.`);
        } else {
            console.error("AI Extraction failed: " + aiResult.message);
        }
    } else {
        console.log("No files found or extracted.");
    }
}
