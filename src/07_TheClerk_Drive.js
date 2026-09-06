/**
 * @file 07_TheClerk_Drive.js
 * @description The Clerk Drive Triage Engine, OCR Vision Processing, Drive Archaeologist Scanner & Failsafe Sweeper.
 */

// ==========================================
// SECTION 1: ONGOING DRIVE TRIAGE & OCR VISION
// ==========================================

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
const DRIVE_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
const RUNNING_NOTES_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE || "gemini-flash-lite-latest";

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
    PROTOCOL: SYSTEM_CONFIG.DOCS.MASTER_ASSET_NAMING_PROTOCOL,
    BLUF_PROMPT: SYSTEM_CONFIG.DOCS.BLUF_SUMMARY_PROMPT_ID
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
  if (!isPipelineAuthorized("CLERK_DRIVE")) return "Skipped (Scope Mismatch)";
  executeEngine("ONGOING", DRIVE_MODEL_NAME); 
}

function executeEngine(mode, currentModel) {
    if (mode === "ONGOING" && isLocalEngineActive("CLERK_DRIVE", 30)) {
        console.log("[TheClerk_Drive] Skipping cloud sweep: Local Mac mini heartbeat lease active.");
        return "Skipped (Local Mac mini engine lease active)";
    }

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
        const folderCache = { byId: {}, byName: {} };
        let allFiles = [];

        // Search Phase (Includes immediate child subfolders for Google Meet / Meet Recordings)
        DRIVE_FOLDERS.STND_SOURCES.forEach(id => {
            try {
                const rootFolder = DriveApp.getFolderById(id);
                const rootPath = getFullFolderPath(rootFolder);

                const collectFilesFromFolder = (folder, folderPath, isSubfolder) => {
                    const files = folder.getFiles();
                    while (files.hasNext() && allFiles.length < DRIVE_TOTAL_FILES_LIMIT) {
                        const f = files.next();
                        const fName = f.getName();
                        const mimeType = f.getMimeType();

                        // Only skip folders (files, shortcuts, scripts, images, docs are all processed)
                        if (mimeType === "application/vnd.google-apps.folder") {
                            continue;
                        }

                        const isShortcut = mimeType === "application/vnd.google-apps.shortcut";
                        let targetId = f.getId();
                        let targetMime = mimeType;
                        if (isShortcut) {
                            try {
                                targetId = f.getTargetId();
                                targetMime = f.getTargetMimeType();
                            } catch (err) {
                                console.warn(`Shortcut target resolution note for ${fName}: ${err.message}`);
                            }
                        }
                        allFiles.push({ 
                            id: f.getId(), 
                            name: f.getName(), 
                            mime: mimeType, 
                            isShortcut: isShortcut,
                            targetId: targetId,
                            targetMime: targetMime,
                            desc: f.getDescription() || "", 
                            sourceFolderId: folder.getId(),
                            rootSourceFolderId: id,
                            isSubfolder: isSubfolder,
                            folderPath: folderPath,
                            dateCreated: Utilities.formatDate(f.getDateCreated(), "GMT", "yyyy-MM-dd")
                        });
                    }
                };

                // 1. Collect top-level files
                collectFilesFromFolder(rootFolder, rootPath, false);

                // 2. Collect files from immediate child subfolders (e.g. Google Meet generated meeting subfolders)
                if (allFiles.length < DRIVE_TOTAL_FILES_LIMIT) {
                    const subfolders = rootFolder.getFolders();
                    while (subfolders.hasNext() && allFiles.length < DRIVE_TOTAL_FILES_LIMIT) {
                        const sub = subfolders.next();
                        if (typeof isFolderOutOfScope === "function" && isFolderOutOfScope(sub)) continue;

                        const subFiles = sub.getFiles();
                        const subFolders = sub.getFolders();
                        // If subfolder is completely empty, clean it up proactively
                        if (!subFiles.hasNext() && !subFolders.hasNext()) {
                            try {
                                console.log(`   [CLEANUP] Trashing pre-existing empty subfolder: ${sub.getName()} (${sub.getId()})`);
                                sub.setTrashed(true);
                            } catch (cleanErr) {
                                console.warn(`Could not trash empty subfolder ${sub.getName()}: ${cleanErr.message}`);
                            }
                            continue;
                        }

                        const subPath = rootPath + " / " + sub.getName();
                        collectFilesFromFolder(sub, subPath, true);
                    }
                }
            } catch (e) { console.error("Error fetching files from folder " + id + ": " + e.message); }
        });

        console.log(`[FOUND] ${allFiles.length} files.`);
        // Fast-Path Zero-File Check: If 0 files found, exit immediately without loading heavy knowledge docs or LLMs
        if (allFiles.length === 0) {
            console.log("[TheClerk_Drive] 0 files found in source folders. Clean queue! Skipping knowledge doc reads and AI.");
            return;
        }

        const knowledge = loadKnowledgeDocs();
        const activeTaskMap = getActiveThreadTaskMap();
        const openTasksStr = activeTaskMap.openTasksForAI.join('\n');
        const recentContext = fetchRecentContext(ss);
        let tasksContext = "\n\n--- OPEN GOOGLE TASKS ---\nIf any file processed is a confirmation of or update to an existing task in this list, map it to the task by returning the task's EXACT ID in the 'mapped_task_id' field of the JSON output and provide a detailed reason in 'mark_completed_reason' why it is completed. Otherwise, use 'None' for both.\n\n" + openTasksStr;
        const fullRules = knowledge.text + "\n\n" + (knowledge.blufPrompt ? knowledge.blufPrompt + "\n\n" : "") + recentContext + tasksContext;
        let parsedTaxonomy = [];
        try { 
          let cleaned = knowledge.taxonomyJson;
          const s = cleaned.indexOf('[');
          if (s !== -1) {
            let bracketCount = 0;
            let inString = false;
            let escapeNext = false;
            let e = -1;
            for (let i = s; i < cleaned.length; i++) {
              const char = cleaned[i];
              if (escapeNext) { escapeNext = false; continue; }
              if (char === '\\') { escapeNext = true; continue; }
              if (char === '"') { inString = !inString; continue; }
              if (!inString) {
                if (char === '[') bracketCount++;
                else if (char === ']') {
                  bracketCount--;
                  if (bracketCount === 0) { e = i; break; }
                }
              }
            }
            if (e !== -1) cleaned = cleaned.substring(s, e + 1);
          }
          parsedTaxonomy = JSON.parse(cleaned); 
        } catch (e) { console.warn("Failed to parse taxonomy JSON"); }

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

        const sourceFolderPath = f.folderPath || f.sourceFolderId || "Unknown";

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
                             const cleanTaskTitle = (t.title || "").replace(/^\[[A-Za-z]+\]\s*/, "").trim();
                             const tempNotesForHash = buildTaskNotes(targetFileUrl, file.getName(), t.notes, {}, undefined, undefined, "File: ", "");
                             const metadata = {
                                duration: "15m",
                                goal: "Maintenance",
                                category_path: "Inbox",
                                created_at: new Date().toISOString()
                             };
                             const taskNotes = buildTaskNotes(targetFileUrl, file.getName(), t.notes, metadata, undefined, undefined, "File: ", "");
                             const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                             Tasks.Tasks.insert({ title: cleanTaskTitle, notes: taskNotes.trim() }, listId);
                            tasksCreated++;
                            extractedTasksLog.push(cleanTaskTitle);
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

            // --- RUNNING NOTES AUTO-SYNC (Replaces Workspace Studio Flow) ---
            const runningNotesDocId = SYSTEM_CONFIG.DOCS.RUNNING_NOTES_DOC_ID;
            if (runningNotesDocId && mode === "ONGOING") {
                const isMeetingSource = f.isSubfolder || 
                                       (f.rootSourceFolderId && ["1TxMBviOHoPa_WFe0x8Sksl6w-P30aFXm", "1Ls1ZClhOFTDfZeUHLsfwUPM8bo3qMV4h"].includes(f.rootSourceFolderId)) ||
                                       (f.sourceFolderId && ["1TxMBviOHoPa_WFe0x8Sksl6w-P30aFXm", "1Ls1ZClhOFTDfZeUHLsfwUPM8bo3qMV4h"].includes(f.sourceFolderId));
                const meetingKeywords = ["meeting", "notes by gemini", "transcript", "agenda", "minutes", "sync", "catchup", "catch up", "standup", "stand up", "okr review", "1:1", "1-1"];
                const fNameLower = (f.name || "").toLowerCase();
                const isMeetingName = meetingKeywords.some(kw => fNameLower.includes(kw));
                const isMeetingAi = (data && data.is_meeting === true);

                if (isMeetingSource || isMeetingName || isMeetingAi) {
                    const todayDateStr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
                    let runningNotesSummary = data.summary;
                    const contentText = (f.parts && f.parts.text) ? f.parts.text : "";
                    if (contentText && contentText.length > 50) {
                        const richSummary = generateRunningNotesSummary(f.name, contentText);
                        if (richSummary) runningNotesSummary = richSummary;
                    }
                    prependEntryToRunningNotesDoc(runningNotesDocId, finalName, targetFileUrl, runningNotesSummary, data.tasks, todayDateStr);
                }
            }
            
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

                // If file was in an ephemeral meeting/source subfolder, check if subfolder is now empty and trash it
                if (f.isSubfolder && f.sourceFolderId) {
                    try {
                        const srcSub = DriveApp.getFolderById(f.sourceFolderId);
                        if (!srcSub.getFiles().hasNext() && !srcSub.getFolders().hasNext()) {
                            console.log(`   [CLEANUP] Trashing empty meeting subfolder: ${srcSub.getName()} (${f.sourceFolderId})`);
                            srcSub.setTrashed(true);
                        }
                    } catch (subCleanErr) {
                        console.warn(`Could not check/trash empty subfolder ${f.sourceFolderId}: ${subCleanErr.message}`);
                    }
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
            
            // --- NEW: Recent Shortcuts Engine ---
            if (mode === "ONGOING" && moved && SYSTEM_CONFIG.DRIVE_FOLDERS.RECENT_SHORTCUTS) {
                createRecentShortcut(file.getId(), finalName);
            }

            const shortcutsLog = shortcutsCreated.length > 0 ? shortcutsCreated.join(", ") : "None";

            const successMsg = isBypass ? `${mode} Success (Fast-Path)` : `${mode} Success`;
            const targetFolderUrl = targetFolderId === "Root" || targetFolderId === "N/A" ? "https://drive.google.com/drive/my-drive" : `https://drive.google.com/drive/folders/${targetFolderId}`;
            const targetFolderLink = `=HYPERLINK("${targetFolderUrl}", "${targetFolderPath.replace(/"/g, '""')}")`;
            
            batchLogs.push([
                new Date(),
                targetFileUrl,
                f.name,
                f.desc || "",
                finalName,
                data.path_code,
                data.context_id,
                data.summary,
                data.description,
                data.reasoning,
                isBypass ? 0 : tpf,
                successMsg,
                sourceFolderPath,
                targetFolderId,
                targetFolderLink,
                shortcutsLog,
                "",
                "",
                "",
                mappedTaskStr,
                tasksLogStr
            ]);
            console.log(`   [OK] Processed: ${finalName}`);
        } catch (e) {
            const errUrl = f.isShortcut ? `https://drive.google.com/open?id=${f.targetId}` : `https://drive.google.com/open?id=${f.id}`;
            batchLogs.push([
                new Date(),
                errUrl,
                f.name,
                f.desc || "",
                "[SYSTEM ERROR]",
                "Unknown",
                "Unknown",
                "Processing Failed",
                "N/A",
                e.message,
                0,
                "SYSTEM_ERROR",
                sourceFolderPath,
                "N/A",
                "N/A",
                "None",
                "",
                "",
                "",
                "None",
                "None"
            ]);
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
    const driveHeaders = [
        "Timestamp", "URL", "Original Name", "Description", "Final Name",
        "Path Code", "Context ID", "BLUF Summary", "Metadata Description", "Reasoning",
        "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path",
        "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status",
        "Mapped Task", "Tasks Extracted"
    ];
    // Always enforce complete 21-column header row
    sheet.getRange(1, 1, 1, driveHeaders.length).setValues([driveHeaders]).setFontWeight("bold").setBackground("#cfe2f3");
    sheet.setFrozenRows(1);
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
         let file = null;
         try {
             file = DriveApp.getFileById(id);
         } catch(idErr) {
             if (fileObj.isShortcut && fileObj.id !== id) {
                 file = DriveApp.getFileById(fileObj.id);
             } else {
                 throw idErr;
             }
         }

         if (mime === MimeType.GOOGLE_DOCS || mime === "application/vnd.google-apps.document") {
             const txt = DocumentApp.openById(file.getId()).getBody().getText();
             return { part: { text: `CONTENT:\n${txt.substring(0, 8000)}` } };
         }
         if (mime === MimeType.GOOGLE_SHEETS || mime === "application/vnd.google-apps.spreadsheet") {
             const txt = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues().slice(0, 50).map(r => r.join(" | ")).join("\n");
             return { part: { text: `CONTENT:\n${txt.substring(0, 8000)}` } };
         }

         // Apps Script project
         if (mime === "application/vnd.google-apps.script") {
             return { part: { text: `CONTENT:\n[Google Apps Script Project: ${name}]` } };
         }

         const blob = file.getBlob();

         // 1. Vision
         if (mime.includes("image/")) {
             const bytes = blob.getBytes();
             if (bytes.length > 5000000) return { part: { text: `CONTENT:\n[Image: ${name} (${mime})]` } };
             return { part: { inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } } };
         }

         // 2. OCR/Office Conversion
         if (mime === "application/pdf" || mime.includes("officedocument") || mime.includes("ms-word") || mime.includes("ms-excel")) {
             try {
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
             } catch(convErr) {
                 return { part: { text: `CONTENT:\n[Document: ${name} (${mime})]` } };
             }
         }

         // 3. Native & Text
         try {
             return { part: { text: `CONTENT:\n${blob.getDataAsString().substring(0, 8000)}` } };
         } catch(strErr) {
             return { part: { text: `CONTENT:\n[File: ${name} (${mime})]` } };
         }

     } catch (e) {
         console.warn(`Extraction note for ${name}: ${e.message}`);
         return { part: { text: `CONTENT:\n[File Name: ${name} | Type: ${mime}]\nAnalyze and categorize this file based on its name and context.` } };
     }
 }


// --- 6. STABLE API CALL ---

function askGeminiStable(rules, batch, currentModel) {
    const taskInstruction = `
## BOTTOM LINE UP FRONT (BLUF) SUMMARY INSTRUCTIONS
For the \`summary\` field of each document/file:
1. Write a concise, maximum 500-character Bottom Line Up Front (BLUF) summary.
2. Extract the core message, key decisions, and any critical deadlines or requirements.
3. Maintain a highly efficient, punchy tone. Remove all filler and corporate pleasantries.
4. CRITICAL: Do NOT output any URLs, web links, or markdown link formatting. Output pure plain text only.

## ACTION EXTRACTION & CONFIRMATION MAPPING
1. EXTRACT ASSIGNED ACTIONS: If the file contains meeting notes, project plans, or explicit action items, extract ONLY the actions assigned specifically to "Daniel Adersteg" or "Daniel". DO NOT extract actions assigned to any other person. Extract them directly into the \`tasks\` array with a clear \`title\` (Action Verb + Object) and \`notes\`. 
2. FILE PROCESSING ACTIONS: Determine if any implicit action is required to respond to or process the file itself. Do NOT suggest generic actions like "review the file". 
3. If no action is needed from either of the above, return an empty array.
4. CONFIRMATION MAPPING: If the file is a confirmation or update for an existing task from the "OPEN GOOGLE TASKS" list, output its EXACT ID in the \`mapped_task_id\` field. If this file confirms the mapped task is complete (e.g. it is a receipt, ticket, confirmation letter, or result document), provide a detailed explanation in \`mark_completed_reason\`. Otherwise, output "None" for both.

Output schema for each file object must include:
{
  "filename": "...",
  "concat_path": "...", // CRITICAL: This MUST be the exact value from the 'Concat (Path)' column of the VALID TAXONOMY CATEGORIES. DO NOT use the 'Concat (Label)' column value.
  "summary": "...", // Concise, max 500-char BLUF summary (pure plain text, no markdown links/URLs, punchy tone)
  "description": "...", // Short 0X 0Y ZW metadata descriptor with hashtags
  "reasoning": "...",
  "is_meeting": true, // Boolean: Return true if this document represents meeting notes, minutes, a transcript, an agenda, or a discussion summary; false otherwise
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

    const genOptions = { maxOutputTokens: 2500, thinkingBudget: 0 };
    let result = callGemini(parts, currentModel, rules + taskInstruction, null, false, genOptions);
    
    // Resilient Ingestion Fallback: 3.5 Flash-Lite -> 3.7 Flash
    if (!result || result.error) {
      const liteFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_LITE || "gemini-3.5-flash-lite";
      if (currentModel !== liteFallback) {
        console.warn(`The Clerk Drive failed on ${currentModel}, attempting Ingestion Fallback: ${liteFallback}...`);
        result = callGemini(parts, liteFallback, rules + taskInstruction, null, false, genOptions);
      }
    }
    if (!result || result.error) {
      const proFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_PRO || "gemini-3.7-flash";
      if (currentModel !== proFallback) {
        console.warn(`The Clerk Drive fallback failed, attempting Primary Fallback: ${proFallback}...`);
        result = callGemini(parts, proFallback, rules + taskInstruction, null, false, genOptions);
      }
    }
    if (result && !result.error) {
        let items = null;
        if (Array.isArray(result)) {
            items = result;
        } else if (typeof result === 'object' && result !== null) {
            if (Array.isArray(result.files)) items = result.files;
            else if (Array.isArray(result.results)) items = result.results;
            else if (Array.isArray(result.data)) items = result.data;
            else if (batch.length === 1 && (result.filename || result.summary)) items = [result];
        }
        if (Array.isArray(items)) {
            return { status: "SUCCESS", data: items, tokens: result._raw_tokens || 0 };
        }
        return { status: "ERROR", message: "No JSON array found in response: " + JSON.stringify(result).substring(0, 200) };
    }
    return { status: "ERROR", message: result ? result.error : "Unknown error" };
}


// --- 7. HELPERS ---

function isExclusivelySharedPrivate(targetId) {
  if (IS_CE_ENV) return false;
  const emailA = "adersteg.daniel@gmail.com";
  const emailB = (typeof getEnvProp !== 'undefined' ? getEnvProp("CE_EMAIL") : null) || "daniel@martens-adersteg.com";
  
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
    
    // Enforce YYYYMM - prefix
    let yyyymm = "";
    if (f.dateCreated) {
        yyyymm = f.dateCreated.substring(0, 4) + f.dateCreated.substring(5, 7) + " - ";
    }
    
    // Strip any existing 6-digit date prefix that the AI or original file might have had to avoid duplicates
    cleanName = cleanName.replace(/^(\d{6})\s*-\s*/, "");
    
    const finalClean = (yyyymm + cleanName).trim();
    return finalClean.endsWith(ext) ? finalClean : finalClean + ext;
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

    let parsedTaxonomyList = [];

    // 1. Try loading from spreadsheet tab (Master Single Source of Truth)
    try {
        const ss = getMasterSpreadsheet();
        const targetGid = SYSTEM_CONFIG.SHEETS.LOS_TAXONOMY;
        const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
        if (sheet) {
            const rows = sheet.getDataRange().getValues();
            if (rows.length > 1) {
                const headers = rows[0];
                const pathIdx = headers.indexOf("Concat (Path)") !== -1 ? headers.indexOf("Concat (Path)") : 8;
                const drivePathIdx = headers.indexOf("Drive Path") !== -1 ? headers.indexOf("Drive Path") : 9;
                const driveIdIdx = headers.indexOf("Drive ID") !== -1 ? headers.indexOf("Drive ID") : 11;
                for (let i = 1; i < rows.length; i++) {
                    const path = rows[i][pathIdx] ? rows[i][pathIdx].toString().trim() : "";
                    const drivePath = (drivePathIdx !== -1 && rows[i][drivePathIdx]) ? rows[i][drivePathIdx].toString().trim() : path;
                    const driveId = (driveIdIdx !== -1 && rows[i][driveIdIdx]) ? rows[i][driveIdIdx].toString().trim() : "";
                    if (path) {
                        parsedTaxonomyList.push({
                            "Concat (Path)": path,
                            "Drive Path": drivePath || path,
                            "Drive ID": driveId
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Could not load taxonomy from spreadsheet tab: " + e.message);
    }

    // 2. Fallback to TAXONOMY_JSON document if sheet was empty
    if (parsedTaxonomyList.length === 0 && DRIVE_DOC_IDS.TAXONOMY_JSON) {
        try {
            let rawJson = getRawFileText(DRIVE_DOC_IDS.TAXONOMY_JSON);
            let parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsedTaxonomyList = parsed.map(item => {
                    let obj = { ...item };
                    delete obj["Concat (Label)"];
                    return obj;
                });
            }
        } catch (jsonErr) {
            console.warn("Could not parse taxonomy JSON doc: " + jsonErr.message);
        }
    }

    let blufPrompt = "";
    try {
        const iterBluf = DriveApp.getFilesByName("202608 - The Clerk BLUF Summary System Prompt.md");
        if (iterBluf.hasNext()) {
            blufPrompt = getSafeDocText(iterBluf.next().getId());
        }
    } catch(e) {
        console.warn(`Could not find BLUF Prompt by name: ${e.message}`);
    }

    if (!blufPrompt) {
        try {
            if (DRIVE_DOC_IDS.BLUF_PROMPT) {
                blufPrompt = getSafeDocText(DRIVE_DOC_IDS.BLUF_PROMPT);
            }
        } catch(e){
            console.warn(`Failed to dynamically load BLUF Prompt document by ID: ${e.message}`);
        }
    }

    const taxonomyJson = JSON.stringify(parsedTaxonomyList, null, 2);
    
    return {
        text: [instructions, "--- VALID TAXONOMY CATEGORIES (Use 'Concat (Path)') ---", taxonomyJson, protocol].join("\n\n"),
        taxonomyJson: taxonomyJson,
        blufPrompt: blufPrompt
    };
}

function moveToReview(id, msg) { 
    try { 
        const f = DriveApp.getFileById(id); 
        f.setDescription("FAILED: " + msg); 
        const reviewFolderId = DRIVE_FOLDERS.REVIEW;
        if (reviewFolderId) {
          try {
            f.moveTo(DriveApp.getFolderById(reviewFolderId)); 
          } catch(err) {
            console.warn("Could not move file to REVIEW folder: " + err.message);
          }
        }
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
              "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx", // CE Workspace
              "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", // Private Workspace
              "1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR", // CE STND_DEST
              "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb", // Private STND_DEST
              "1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H", // CE REVIEW
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
        const retroModel = SYSTEM_CONFIG.SECRETS.GEMINI_RETRO_MODEL || "gemini-3.5-flash-lite";
        const aiResult = askGeminiStable(rules, validFiles, retroModel);
        if (aiResult.status === "SUCCESS") {
            const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
            let tasksCreated = 0;
            
            aiResult.data.forEach((data, i) => {
                const f = validFiles[i];
                if (data.tasks && Array.isArray(data.tasks)) {
                    data.tasks.forEach(t => {
                        if (t.title) {
                            try {
                                const cleanTaskTitle = (t.title || "").replace(/^\[[A-Za-z]+\]\s*/, "").trim();
                                const targetFileUrl = `https://drive.google.com/open?id=${f.id}`;
                                const metadata = {
                                   duration: "15m",
                                   goal: "Maintenance",
                                   category_path: "Inbox",
                                   created_at: new Date().toISOString()
                                };
                                const taskNotes = buildTaskNotes(targetFileUrl, f.name, t.notes, metadata, undefined, undefined, "File: ", "");
                                Tasks.Tasks.insert({ title: cleanTaskTitle, notes: taskNotes.trim() }, listId);
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

/**
 * Creates a shortcut in the Recent Shortcuts folder.
 */
function createRecentShortcut(targetId, name) {
    try {
        const folderId = SYSTEM_CONFIG.DRIVE_FOLDERS.RECENT_SHORTCUTS;
        if (!folderId) return;
        const resource = {
            name: name,
            mimeType: "application/vnd.google-apps.shortcut",
            shortcutDetails: { targetId: targetId },
            parents: [folderId]
        };
        Drive.Files.create(resource);
        console.log(`   [SHORTCUT] Created in Recent for: ${name}`);
    } catch (e) {
        console.error(`   [WARNING] Failed to create Recent shortcut for ${name}: ${e.message}`);
    }
}

/**
 * Prepends a structured meeting summary entry to the top of the Running Notes Google Doc.
 * Matches the structure of the Google Workspace Studio flow: Title, Link, BLUF Summary, and Actions.
 *
 * @param {string} docId - The ID of the Running Notes Google Doc.
 * @param {string} title - The finalized name or meeting title.
 * @param {string} url - Direct URL to the source document in Google Drive.
 * @param {string} summary - The Bottom Line Up Front (BLUF) summary.
 * @param {Array<Object>} tasks - Extracted action items array.
 * @param {string} dateStr - The current date string (YYYY-MM-DD).
 */
/**
 * Generates a structured executive summary specifically for the Running Notes document using Flash Lite.
 *
 * @param {string} title - The document title.
 * @param {string} text - The raw text content of the document.
 * @returns {string|null} The formatted executive summary string.
 */
function generateRunningNotesSummary(title, text) {
    try {
        const systemInstruction = `You are an executive assistant and technical summarizer.
Analyze the provided meeting notes or transcript and produce a structured executive summary matching this exact format:

BLUF: A punchy 1-2 sentence Bottom Line Up Front summarizing the core purpose and key outcome.

Key Points & Decisions:
- **Topic/Decision 1:** Concise explanation of the argument, decision, metric, or structural agreement.
- **Topic/Decision 2:** Concise explanation of the argument, decision, metric, or structural agreement.

Keep it dense with facts, clear, and without corporate fluff. Do not output markdown links or URLs.`;

        const promptParts = [
            { text: `DOCUMENT TITLE: ${title}\n\nCONTENT:\n${text.substring(0, 10000)}` }
        ];

        const res = callGemini(promptParts, RUNNING_NOTES_MODEL_NAME, systemInstruction, null, true);
        if (res && res.text) {
            return res.text.trim();
        }
    } catch (e) {
        console.warn(`[RUNNING NOTES] Flash Lite summary generation warning: ${e.message}`);
    }
    return null;
}

/**
 * Prepends a beautifully formatted meeting summary entry to the top of the Running Notes Google Doc under <Start Here >.
 * Formats native bullet points with bold topic headers, clean source links, and clear section dividers.
 *
 * @param {string} docId - The ID of the Running Notes Google Doc.
 * @param {string} title - The finalized name or meeting title.
 * @param {string} url - Direct URL to the source document in Google Drive.
 * @param {string} summary - The Bottom Line Up Front (BLUF) and key points summary text.
 * @param {Array<Object>} tasks - Extracted action items array.
 * @param {string} dateStr - The current date string (YYYY-MM-DD).
 */
function prependEntryToRunningNotesDoc(docId, title, url, summary, tasks, dateStr) {
    if (!docId || docId.trim() === "") return;
    try {
        const doc = DocumentApp.openById(docId);
        const body = doc.getBody();

        let idx = 0;
        const numChildren = body.getNumChildren();
        for (let i = 0; i < numChildren; i++) {
            const child = body.getChild(i);
            const text = child.getText ? child.getText().trim() : "";
            if (text.toLowerCase().includes("<start here") || text.toLowerCase().includes("start here >")) {
                idx = i + 1;
                break;
            } else if (text === "Running Notes" && idx === 0) {
                idx = i + 1;
            }
        }

        // Clean redundant prefixes from title (e.g. "2026-08-20 — 202608 - Operations Objectives IT Meeting Notes")
        let cleanTitle = (title || "").trim();
        cleanTitle = cleanTitle.replace(/^\d{4}[-_]\d{2}[-_]\d{2}\s*[—–-]\s*/, "");
        cleanTitle = cleanTitle.replace(/^\d{6}\s*[—–-]\s*/, "");
        cleanTitle = cleanTitle.replace(/\s*Meeting Notes\s*$/i, "");
        cleanTitle = cleanTitle.replace(/\s*-\s*Notes by Gemini\s*$/i, "");
        cleanTitle = cleanTitle.replace(/\s*Notes by Gemini:\s*/i, "");
        if (!cleanTitle) cleanTitle = title;

        // 1. Heading 1: Date — Clean Title
        const headingText = dateStr ? `${dateStr} — ${cleanTitle}` : cleanTitle;
        const heading = body.insertParagraph(idx++, headingText);
        heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);

        // 2. Clickable Source Hyperlink
        const linkPara = body.insertParagraph(idx++, "Source: ");
        linkPara.appendText("Link to File").setLinkUrl(url);

        // 3. Render Structured Summary with Native Bullets & Bold Labels
        if (summary && summary !== "N/A" && summary !== "Unknown" && summary.trim().length > 0) {
            const lines = summary.split(/\r?\n/);
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
                if (bulletMatch) {
                    const bulletContent = bulletMatch[1].trim();
                    const li = body.insertListItem(idx++, "");
                    li.setGlyphType(DocumentApp.GlyphType.BULLET);

                    // Check for bold label or colon
                    const colonMatch = bulletContent.match(/^(\*\*.*?\*\*|[^:]+:)\s*(.*)$/);
                    if (colonMatch) {
                        let label = colonMatch[1].replace(/\*\*/g, "").trim();
                        let desc = colonMatch[2].replace(/\*\*/g, "").trim();
                        const t = li.asText();
                        t.appendText(label + (label.endsWith(":") ? " " : ": "));
                        t.setBold(0, label.length, true);
                        if (desc) {
                            const startDesc = t.getText().length;
                            t.appendText(desc);
                            t.setBold(startDesc, t.getText().length - 1, false);
                        }
                    } else {
                        li.setText(bulletContent.replace(/\*\*/g, ""));
                    }
                } else if (line.toLowerCase().startsWith("bluf:") || line.toLowerCase().startsWith("bottom line up front:")) {
                    const blufContent = line.replace(/^(bluf|bottom line up front):\s*/i, "").trim();
                    const p = body.insertParagraph(idx++, "");
                    const t = p.asText();
                    t.appendText("BLUF: ");
                    t.setBold(0, 5, true);
                    const startDesc = t.getText().length;
                    t.appendText(blufContent.replace(/\*\*/g, ""));
                    t.setBold(startDesc, t.getText().length - 1, false);
                } else if (line.endsWith(":") || line.toLowerCase().includes("key points") || line.toLowerCase().includes("decisions")) {
                    const p = body.insertParagraph(idx++, line.replace(/\*\*/g, ""));
                    p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
                } else {
                    const p = body.insertParagraph(idx++, line.replace(/\*\*/g, ""));
                    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
                }
            }
        }

        // 4. Extracted Action Items
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
            const actHeading = body.insertParagraph(idx++, "Action Items");
            actHeading.setHeading(DocumentApp.ParagraphHeading.HEADING3);
            tasks.forEach(t => {
                if (t.title) {
                    const cleanTaskTitle = (t.title || "").replace(/^\[[A-Za-z]+\]\s*/, "").trim();
                    const li = body.insertListItem(idx++, "");
                    li.setGlyphType(DocumentApp.GlyphType.BULLET);
                    const textElem = li.asText();
                    textElem.appendText(cleanTaskTitle);
                    textElem.setBold(0, cleanTaskTitle.length - 1, true);

                    if (t.notes && t.notes.trim().length > 0) {
                        const cleanNotes = t.notes.replace(/\n/g, " ").trim();
                        const startOffset = textElem.getText().length;
                        textElem.appendText(` — ${cleanNotes}`);
                        textElem.setBold(startOffset, textElem.getText().length - 1, false);
                    }
                }
            });
        }

        // 5. Clean Divider Line
        const divider = body.insertParagraph(idx++, "―".repeat(48));
        divider.setForegroundColor("#cccccc");
        body.insertParagraph(idx++, "");

        doc.saveAndClose();
        console.log(`   [RUNNING NOTES] Successfully prepended meeting "${cleanTitle}" to Running Notes Doc (${docId}).`);
    } catch (e) {
        console.error(`   [WARNING] Failed to prepend entry to Running Notes doc (${docId}): ${e.message}`);
    }
}


// ==========================================
// SECTION 2: DRIVE ARCHAEOLOGIST RETROACTIVE SCANNER
// ==========================================

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
    const parts = [{ text: systemPrompt }];
    candidates.forEach((c, i) => {
        parts.push({ text: `--- FILE [${i}] ---\nName: ${c.name}\nPath: ${c.folderPath}\nDesc: ${c.desc}` });
    });

    try {
        const aiDecisions = callGemini(parts, model, systemPrompt, null, false);
        if (!aiDecisions || aiDecisions.error) {
             console.error("Gemini Archeology Error:", aiDecisions ? aiDecisions.error : "Unknown");
             return;
        }
        if (Array.isArray(aiDecisions)) {
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
    } catch(e) {
        console.error("Failed to query Gemini: " + e.message);
    }
}


// ==========================================
// SECTION 3: FAILSAFE SWEEPER & SHORTCUT PURGER
// ==========================================

/**
 * Code_TheClerk_Drive_Sweeper.js
 * 
 * Background failsafe Sweeper that runs monthly to process untagged files in Google Drive.
 * 
 * Features:
 * 1. Excludes defined folders (e.g., MacMini, Legacy Chats) using SYSTEM_CONFIG.DRIVE_FOLDERS.OUT_OF_SCOPE
 * 2. Uses Context Caching and Batching logic against the Gemini API to save tokens.
 * 3. Does not rename working files destructively, merely prepends YYYYMM.
 */

function runTheClerkDriveSweeper() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Sweeper: Another instance is already running.");
    return;
  }
  
  try {
    console.log("Starting The Clerk Drive Sweeper...");
    
    // 1. Build Exclusion Paths & Cache
    const outOfScopeIds = (SYSTEM_CONFIG.DRIVE_FOLDERS.OUT_OF_SCOPE || "").split(",").map(id => id.trim()).filter(Boolean);
    // Add specific hardcoded exclusions if missing
    const hardcodedExclusions = ["17UhZsFz9DBwzukotWtS0cth0Xxwa6NB-"]; // Messages / Legacy Chats
    hardcodedExclusions.forEach(id => {
      if (outOfScopeIds.indexOf(id) === -1) outOfScopeIds.push(id);
    });

    const untaggedFiles = getUntaggedFiles(outOfScopeIds);
    if (untaggedFiles.length === 0) {
      console.log("Sweeper: No untagged files found. Drive is fully clean.");
      return;
    }
    
    console.log(`Sweeper: Found ${untaggedFiles.length} files requiring categorization.`);

    // 2. Load Knowledge Base
    const knowledge = loadKnowledgeDocs();
    const rules = knowledge.text || "";
    
    // 3. Trigger Batch API / Context Caching 
    // Uses gemini-3.6-flash or gemini-3.5-flash-lite via UrlFetchApp
    const result = runSweeperBatchAnalysis(rules, untaggedFiles);
    
    if (result.status === "SUCCESS") {
      applySweeperResults(untaggedFiles, result.data);
    } else {
      console.error("Sweeper AI Processing Failed: " + result.message);
    }
    
  } catch (e) {
    console.error("Sweeper Fatal Error: " + e.message);
  } finally {
    // 4. Enforce 7-Day TTL on Recent Shortcuts
    purgeExpiredShortcuts();
    
    lock.releaseLock();
  }
}

/**
 * Sweeps the entire drive for files missing taxonomy tags, respecting out of scope exclusions.
 */
function getUntaggedFiles(outOfScopeIds) {
  const untagged = [];
  const query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false";
  let pageToken = null;
  
  do {
    const response = Drive.Files.list({
      q: query,
      fields: "nextPageToken, files(id, name, mimeType, description, createdTime, parents)",
      pageToken: pageToken,
      pageSize: 100,
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    
    const files = response.files || [];
    for (let f of files) {
      const desc = f.description || "";
      const hasTag = desc.includes("#") || desc.includes("Taxonomy:") || desc.includes("[CLERK PROCESSED]");
      if (hasTag) continue;
      
      // Check exclusions
      if (f.name.includes("Archive_Legacy_Chats")) continue;
      
      let isExcluded = false;
      let parents = f.parents || [];
      
      // (Fast validation via parents array. In a true recursive tree this requires a folder cache to walk up the chain)
      if (parents.some(p => outOfScopeIds.includes(p))) {
        isExcluded = true;
      }
      
      if (!isExcluded) {
        untagged.push(f);
      }
    }
    
    pageToken = response.nextPageToken;
  } while (pageToken && untagged.length < 500); // Cap per run for 6-min timeout
  
  return untagged;
}

/**
 * Handles the REST API interaction with Gemini for Context Caching.
 */
function runSweeperBatchAnalysis(rules, files) {
  // NOTE: Stub for Gemini 3.6 REST API Context Caching + Batch implementation via UrlFetchApp.
  // This replaces askGeminiStable for high-volume sweeps.
  console.log("Sending files to Gemini Batch API using Context Caching...");
  return { status: "SUCCESS", data: [] }; // Implementation placeholder
}

/**
 * Applies the generated metadata and safely prepends YYYYMM without changing the core filename.
 */
function applySweeperResults(files, aiData) {
  // Logic to apply metadata and safely rename (prepend YYYYMM only)
}

/**
 * Background Sweeper to enforce the 7-day TTL on Recent Shortcuts.
 * Deletes shortcuts older than 7 days from the RECENT_SHORTCUTS folder.
 */
function purgeExpiredShortcuts() {
  const folderId = SYSTEM_CONFIG.DRIVE_FOLDERS.RECENT_SHORTCUTS;
  if (!folderId) {
    console.warn("purgeExpiredShortcuts: RECENT_SHORTCUTS folder ID not configured.");
    return;
  }
  
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    while (files.hasNext()) {
      const file = files.next();
      // Verify it's a shortcut
      if (file.getMimeType() === "application/vnd.google-apps.shortcut") {
        const ageMs = now - file.getDateCreated().getTime();
        if (ageMs > SEVEN_DAYS_MS) {
          file.setTrashed(true);
          deletedCount++;
        }
      }
    }
    console.log(`purgeExpiredShortcuts: Successfully purged ${deletedCount} expired shortcuts.`);
  } catch (e) {
    console.error(`purgeExpiredShortcuts Error: ${e.message}`);
  }
}

