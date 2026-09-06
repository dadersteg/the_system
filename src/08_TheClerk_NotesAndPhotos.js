/**
 * @file 08_TheClerk_NotesAndPhotos.js
 * @description The Clerk Running Notes & Clean-in-Place Engine, Google Photos Retroactive Sync & Antigravity Transcript Exporter.
 */

// ==========================================
// SECTION 1: RUNNING NOTES CLEANING & ROUTING
// ==========================================

/**
 * @file Code_TheClerk_Notes.js
 * @description Processes unstructured notes, extracts tasks via Gemini, cleans up formatting, and routes/files appropriately.
 */

const NOTES_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
const NOTES_MODEL = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";

const NOTES_LOG_GID = SYSTEM_CONFIG.SHEETS.NOTES_LOG;
const MASTER_SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;

const ARCHIVE_ROOT = SYSTEM_CONFIG.ROOTS.DRIVE_RETRO_ROOT_ID;

function runTheClerkNotes() {
    if (!isPipelineAuthorized("CLERK_NOTES")) return "Skipped (Scope Mismatch)";

    // Check Cross-Machine Heartbeat Lease from local Mac mini
    if (isLocalEngineActive("CLERK_NOTES", 30)) {
        console.log("[TheClerk_Notes] Skipping cloud sweep: Local Mac mini heartbeat lease active.");
        return "Skipped (Local Mac mini engine lease active)";
    }

    console.log(">>> [NOTES START] The Clerk Notes Engine - acquiring lock...");
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
        console.warn("Could not acquire script lock. Another execution is likely running.");
        return;
    }
    
    const sessionStart = Date.now();
    
    try {
        const routeFolders = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.ROUTE_MODE || [];
        const cleanFolders = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.CLEAN_MODE || [];
        
        // FAST-PATH: Check if any route or clean folders contain Google Docs before loading heavy prompts or taxonomy
        let hasFilesToProcess = false;
        const allFolderIds = [...routeFolders, ...cleanFolders];
        for (let i = 0; i < allFolderIds.length; i++) {
            const fid = allFolderIds[i];
            if (fid && fid !== "FOLDER_ID_1" && fid !== "FOLDER_ID_2" && fid !== "FOLDER_ID_3" && fid !== "FOLDER_ID_4") {
                try {
                    const f = DriveApp.getFolderById(fid);
                    if (f.getFilesByType(MimeType.GOOGLE_DOCS).hasNext()) {
                        hasFilesToProcess = true;
                        break;
                    }
                } catch(e) {}
            }
        }

        if (!hasFilesToProcess) {
            console.log("[TheClerk_Notes] 0 Google Docs found across route/clean folders. Clean queue! Exiting fast-path.");
            return "SUCCESS: 0 notes to process";
        }

        const ss = getMasterSpreadsheet();
        let logSheet = null;
        if (NOTES_LOG_GID !== "TODO_NOTES_LOG_GID") {
            logSheet = ss.getSheets().find(s => s.getSheetId().toString() === NOTES_LOG_GID);
        }
        
        let batchLogs = [];
        
        const NOTES_ROUTE_PROMPT_ID = SYSTEM_CONFIG.DOCS.NOTES_ROUTE_PROMPT_ID;
        const NOTES_CLEAN_PROMPT_ID = SYSTEM_CONFIG.DOCS.NOTES_CLEAN_PROMPT_ID;
        
        const routePromptDoc = getPromptText(NOTES_ROUTE_PROMPT_ID, getFallbackRoutePrompt());
        const cleanPromptDoc = getPromptText(NOTES_CLEAN_PROMPT_ID, getFallbackCleanPrompt());
        
        const taxonomyJson = getTaxonomyJson();
        const recentContext = typeof fetchRecentContext === 'function' ? fetchRecentContext(ss) : "";
        
        // 1. Process Route Mode Folders
        routeFolders.forEach(folderId => {
            if (folderId && folderId !== "FOLDER_ID_1" && folderId !== "FOLDER_ID_2") {
                processNotesFolder(folderId, "ROUTE", routePromptDoc, taxonomyJson, batchLogs, recentContext);
            }
        });
        
        // 2. Process Clean Mode Folders (Legacy or specific)
        cleanFolders.forEach(folderId => {
            if (folderId && folderId !== "FOLDER_ID_3" && folderId !== "FOLDER_ID_4") {
                processNotesFolder(folderId, "CLEAN", cleanPromptDoc, taxonomyJson, batchLogs, recentContext);
            }
        });
        
        if (logSheet && batchLogs.length > 0) {
            writeNotesLogBatch(logSheet, batchLogs);
        }
        
    } catch (e) {
        console.error("FATAL in Notes Processing: " + e.message + "\nStack: " + e.stack);
    } finally {
        lock.releaseLock();
        console.log(`<<< [NOTES END] Completed in ${((Date.now() - sessionStart) / 1000).toFixed(1)}s`);
        return "Successfully swept Notes and executed extraction engine.";
    }
}

/**
 * Manually triggered execution for all configured RUNNING_DOCS.
 * This is isolated from the 15-minute schedule to prevent conflicts while actively editing.
 */
function runCleanRunningNotes() {
    const runningDocs = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.RUNNING_DOCS || [];
    console.log(`Starting manual clean for ${runningDocs.length} running docs...`);
    
    let batchLogs = [];
    
    let recentContext = "";
    try {
        const ss = getMasterSpreadsheet();
        recentContext = typeof fetchRecentContext === 'function' ? fetchRecentContext(ss) : "";
    } catch(e) {}

    runningDocs.forEach(fileId => {
        if (fileId && fileId.trim() !== "") {
            processRunningNoteById(fileId, batchLogs, recentContext);
        }
    });
    
    if (batchLogs.length > 0) {
        try {
            const ss = getMasterSpreadsheet();
            const logSheet = ss.getSheets().find(s => s.getSheetId().toString() === NOTES_LOG_GID);
            if (logSheet) {
                writeNotesLogBatch(logSheet, batchLogs);
            }
        } catch(e) {
            console.error("Failed to write manual running note logs: " + e.message);
        }
    }
}

/**
 * Processes a specific running document, parsing new content below the "--- PROCESSED ---" marker.
 * Can be called manually or by the engine loop using configuration IDs.
 * @param {string} fileId - The ID of the Google Doc to process.
 * @param {Array} [batchLogs] - Optional array to append log rows to. If absent, logs immediately.
 * @param {string} [recentContext] - Optional context string containing recent emails and tasks.
 */
function processRunningNoteById(fileId, batchLogs, recentContext = "") {
    console.log(`Processing running note manually: ${fileId}`);
    try {
        const file = DriveApp.getFileById(fileId);
        const doc = DocumentApp.openById(fileId);
        const body = doc.getBody();
        const rawText = body.getText();
        
        const splitMarker = "--- PROCESSED ---";
        const parts = rawText.split(splitMarker);
        const newText = parts[parts.length - 1].trim();
        
        if (!newText) {
            console.log("No new text found to process.");
            return;
        }
        
        const NOTES_CLEAN_PROMPT_ID = SYSTEM_CONFIG.DOCS.NOTES_CLEAN_PROMPT_ID;
        const systemPrompt = getPromptText(NOTES_CLEAN_PROMPT_ID, getFallbackCleanPrompt());
        const taxonomyJson = getTaxonomyJson();
        
        const response = askGeminiNotes("CLEAN", newText, systemPrompt, taxonomyJson, recentContext);
        if (response.status === "SUCCESS") {
            const data = response.data;
            
            let finalMarkdown = data.structured_markdown || "";
            let tasksCreated = 0;
            if (data.tasks && Array.isArray(data.tasks)) {
                if (data.tasks.length > 0) finalMarkdown += "\n\n## Actions Extracted\n";
                data.tasks.forEach(t => {
                    if (t.title) {
                        try {
                             const cleanTaskTitle = (t.title || "").replace(/^\[[A-Za-z]+\]\s*/, "").trim();
                             const tempNotesForHash = buildTaskNotes(file.getUrl(), file.getName(), t.notes, {}, undefined, undefined, "Note: ", "");
                             const metadata = {
                                duration: "15m",
                                goal: "Maintenance",
                                category_path: "Inbox",
                                created_at: new Date().toISOString()
                             };
                             const taskNotes = buildTaskNotes(file.getUrl(), file.getName(), t.notes, metadata, undefined, undefined, "Note: ", "");
                             const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                             Tasks.Tasks.insert({ title: cleanTaskTitle, notes: taskNotes.trim() }, listId);
                            tasksCreated++;
                            
                            finalMarkdown += `- **${cleanTaskTitle}**\n`;
                            if (t.notes) finalMarkdown += `- *${t.notes.replace(/\n/g, " ")}*\n`;
                        } catch (e) {
                            console.error("Error creating task: " + e.message);
                        }
                    }
                });
            }
            
            let foundMarker = false;
            if (parts.length > 1) {
                const paragraphs = body.getParagraphs();
                let markerIndex = -1;
                for (let i = paragraphs.length - 1; i >= 0; i--) {
                    if (paragraphs[i].getText().includes(splitMarker)) {
                        markerIndex = i;
                        break;
                    }
                }
                
                if (markerIndex !== -1) {
                    foundMarker = true;
                    for (let i = paragraphs.length - 1; i > markerIndex; i--) {
                        paragraphs[i].removeFromParent();
                    }
                }
            }
            
            if (!foundMarker) {
                body.clear();
            }
            
            applyMarkdownToGoogleDoc(body, finalMarkdown, true);
            body.appendParagraph("\n" + splitMarker + " " + Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm"));
            
            console.log("Successfully updated running note and extracted " + tasksCreated + " tasks.");
            
            let parentFolder = file.getParents().hasNext() ? file.getParents().next() : null;
            let parentUrl = parentFolder ? `https://drive.google.com/drive/folders/${parentFolder.getId()}` : "https://drive.google.com/drive/my-drive";
            let parentName = parentFolder ? parentFolder.getName() : "My Drive";
            let targetPath = `=HYPERLINK("${parentUrl}", "${parentName.replace(/"/g, '""')}")`;

            const logRow = [
                file.getUrl(),
                file.getName(),
                "RUNNING",
                tasksCreated,
                "N/A",
                targetPath,
                "Success",
                Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss")
            ];

            if (batchLogs && Array.isArray(batchLogs)) {
                batchLogs.push(logRow);
            } else {
                // Log to Master Sheet immediately if run manually
                try {
                    const ss = getMasterSpreadsheet();
                    const logSheet = ss.getSheets().find(s => s.getSheetId().toString() === NOTES_LOG_GID);
                    if (logSheet) {
                        writeNotesLogBatch(logSheet, [logRow]);
                    }
                } catch(e) {
                    console.error("Failed to log manual running note: " + e.message);
                }
            }
            
        } else {
            console.error(`API Error for ${file.getName()}: ${response.message}`);
        }
    } catch(e) {
        console.error("Error processing running note manually " + fileId + ": " + e.message);
    }
}

function processNotesFolder(folderId, mode, systemPrompt, taxonomyJson, batchLogs, recentContext = "") {
    let parsedTaxonomy = [];
    try { parsedTaxonomy = JSON.parse(taxonomyJson); } catch (e) { console.error("Could not parse taxonomy JSON"); }

    try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
        const runningDocs = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.RUNNING_DOCS || [];
        
        while (files.hasNext()) {
            const file = files.next();
            if (runningDocs.includes(file.getId())) {
                console.log(`Skipping ${file.getName()} because it is a configured running doc.`);
                continue;
            }
            console.log(`Processing note [${mode}]: ${file.getName()}`);
            
            try {
                const doc = DocumentApp.openById(file.getId());
                const rawText = doc.getBody().getText();
                
                if (!rawText || rawText.trim().length === 0) continue;
                
                const response = askGeminiNotes(mode, rawText, systemPrompt, taxonomyJson, recentContext);
                if (response.status === "SUCCESS") {
                    const data = response.data;
                    
                    // Push tasks
                    let finalMarkdown = data.structured_markdown || "";
                    let tasksCreated = 0;
                    if (data.tasks && Array.isArray(data.tasks)) {
                        if (data.tasks.length > 0) finalMarkdown += "\n\n## Actions Extracted\n";
                        data.tasks.forEach(t => {
                            if (t.title) {
                                try {
                                     const cleanTaskTitle = (t.title || "").replace(/^\[[A-Za-z]+\]\s*/, "").trim();
                                     const tempNotesForHash = buildTaskNotes(file.getUrl(), file.getName(), t.notes, {}, undefined, undefined, "Note: ", "");
                                     const metadata = {
                                        duration: "15m",
                                        goal: "Maintenance",
                                        category_path: "Inbox",
                                        created_at: new Date().toISOString()
                                     };
                                     const taskNotes = buildTaskNotes(file.getUrl(), file.getName(), t.notes, metadata, undefined, undefined, "Note: ", "");
                                     const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                                     Tasks.Tasks.insert({ title: cleanTaskTitle, notes: taskNotes.trim() }, listId);
                                    tasksCreated++;
                                    
                                    finalMarkdown += `- **${cleanTaskTitle}**\n`;
                                    if (t.notes) finalMarkdown += `- *${t.notes.replace(/\n/g, " ")}*\n`;
                                } catch (e) {
                                    console.error("Error creating task: " + e.message);
                                }
                            }
                        });
                    }
                    if (data.filename) {
                        file.setName(data.filename);
                    }
                    
                    let newUrl = file.getUrl();
                    let targetPath = `=HYPERLINK("https://drive.google.com/drive/folders/${folder.getId()}", "${folder.getName().replace(/"/g, '""')}")`;
                    let statusMsg = "Success";
                    let finalContext = data.target_context || "N/A";
                    
                    if (mode === "ROUTE") {
                        // Create new document in target folder
                        let targetFolder = null;
                        if (data.target_context && data.target_context !== "Unknown") {
                            targetFolder = resolveFolderFromTaxonomy(data.target_context, parsedTaxonomy);
                        }
                        
                        if (!targetFolder) {
                            targetFolder = DriveApp.getFolderById(SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW);
                        }
                        
                        let folderName = targetFolder.getName();
                        targetPath = `=HYPERLINK("https://drive.google.com/drive/folders/${targetFolder.getId()}", "${folderName.replace(/"/g, '""')}")`;
                        finalContext = data.target_context || folderName;
                        
                        let safeFilename = data.filename || file.getName().replace(/(\.[^.]+)$/, "") + " (Structured)";
                        const newDoc = DocumentApp.create(safeFilename);
                        applyMarkdownToGoogleDoc(newDoc.getBody(), finalMarkdown);
                        const newFile = DriveApp.getFileById(newDoc.getId());
                        newFile.moveTo(targetFolder);
                        
                        newUrl = newFile.getUrl();
                        
                        // Move original to Archive or Trash
                        try {
                            const archive = DriveApp.getFolderById(ARCHIVE_ROOT);
                            file.moveTo(archive);
                        } catch (e) {
                            file.setTrashed(true);
                        }
                    } else if (mode === "CLEAN") {
                        // Move to parent folder FIRST so it isn't processed again even if formatting fails
                        let parentFolder = folder.getParents().hasNext() ? folder.getParents().next() : null;
                        if (parentFolder) {
                            file.moveTo(parentFolder);
                            targetPath = `=HYPERLINK("https://drive.google.com/drive/folders/${parentFolder.getId()}", "${parentFolder.getName().replace(/"/g, '""')}")`;
                        }
                        
                        // Replace content in place
                        try {
                            applyMarkdownToGoogleDoc(doc.getBody(), finalMarkdown);
                        } catch(e) {
                            console.error("Error applying markdown: " + e.message);
                            statusMsg = "Warning: Tasks extracted & file moved, but markdown formatting failed: " + e.message;
                        }
                    }
                    
                    batchLogs.push([
                        newUrl,
                        file.getName(),
                        mode,
                        tasksCreated,
                        finalContext,
                        targetPath,
                        statusMsg,
                        Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss")
                    ]);
                    
                } else {
                    console.error(`API Error for ${file.getName()}: ${response.message}`);
                    batchLogs.push([file.getUrl(), file.getName(), mode, 0, "N/A", "N/A", "API Error: " + response.message, Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss")]);
                }
            } catch (e) {
                console.error("Error processing file " + file.getId() + ": " + e.message);
                batchLogs.push([file.getUrl(), file.getName(), mode, 0, "N/A", "N/A", "System Error: " + e.message, Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss")]);
            }
        }
    } catch (e) {
        console.error("Error reading folder " + folderId + ": " + e.message);
    }
}

function askGeminiNotes(mode, text, systemPrompt, taxonomyJson, recentContext = "") {
    const currentDate = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
    let parts = [
        { text: `[SYSTEM TIME CONTEXT: The current date is ${currentDate}]\n\n` + systemPrompt }
    ];
    
    if (recentContext) {
        parts.push({ text: recentContext });
    }

    if (mode === "ROUTE") {
        parts.push({ text: "--- VALID TAXONOMY CATEGORIES ---\n" + taxonomyJson });
    }
    
    const primaryModel = NOTES_MODEL || SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
    const genOptions = { maxOutputTokens: 1200, thinkingBudget: 0 };
    let result = callGemini(parts, primaryModel, "You are an assistant.", null, false, genOptions);
    
    if (!result || result.error) {
        const liteFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_LITE || "gemini-3.5-flash-lite";
        if (primaryModel !== liteFallback) {
            console.warn(`The Clerk Notes failed on ${primaryModel}, attempting Ingestion Fallback: ${liteFallback}...`);
            result = callGemini(parts, liteFallback, "You are an assistant.", null, false, genOptions);
        }
    }
    if (!result || result.error) {
        const proFallback = SYSTEM_CONFIG.SECRETS.GEMINI_FALLBACK_PRO || "gemini-3.7-flash";
        if (primaryModel !== proFallback) {
            console.warn(`The Clerk Notes fallback failed, attempting Pro Fallback: ${proFallback}...`);
            result = callGemini(parts, proFallback, "You are an assistant.", null, false, genOptions);
        }
    }
    if (result && !result.error) {
        return { status: "SUCCESS", data: result };
    }
    return { status: "ERROR", message: result ? result.error : "Unknown error" };
}

function getPromptText(promptId, fallback) {
    try {
        return getSafeDocText(promptId);
    } catch (e) {
        return processPromptText(fallback);
    }
}

function getTaxonomyJson() {
    try {
        return getRawFileText(SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID);
    } catch (e) {
        return "{}";
    }
}

function writeNotesLogBatch(sheet, batchLogs) {
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["URL", "Document Name", "Mode", "Tasks Extracted", "Target Context", "Target Folder Path", "Status", "Timestamp"]);
        sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#cfe2f3");
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
}

function getFallbackRoutePrompt() {
    return [
        "# The Clerk Notes (Route Mode) - System Prompt",
        "",
        "You are 'The Clerk', a structured data extraction AI. You are processing a messy, unstructured note or scratchpad.",
        "",
        "## 1. TASK EXTRACTION",
        "Extract ONLY high-level, critical tasks found in the text. Do NOT extract vague, minor, or overly granular points. If a point is not clearly actionable, concrete, and critical, ignore it.",
        "Use the provided RECENT CONTEXT (EMAILS & TASKS) to ensure you do not extract duplicates of tasks that already exist, and to add nuance and specific details to the actions.",
        "Format them strictly as a JSON array of objects. Each object should have:",
        "- `title`: A clear, actionable title for the task. You MUST strictly apply the format: [Action Verb] [Object]. Example: 'Pay the 28 day electricity bill'. Do not just copy the raw text.",
        "- `notes`: Any context or details related to the task.",
        "If no critical tasks are found, return an empty array [].",
        "",
        "## 2. KNOWLEDGE CLEANUP",
        "Format the remaining knowledge and non-actionable text as clean, structured Markdown.",
        "Do not include the extracted tasks here.",
        "",
        "## 3. CATEGORIZATION",
        "Determine the most appropriate L4 target Context/Folder based on the LOS taxonomy. Provide the exact path code or Context ID.",
        "",
        "## 4. ASSET NAMING",
        "Determine a highly descriptive filename following the System Protocol. E.g., `YYYYMMDD [Context] Subject`. Provide the base filename without extension.",
        "",
        "Output MUST be in the following JSON format:",
        "{",
        "  \"filename\": \"...\",",
        "  \"tasks\": [ { \"title\": \"...\", \"notes\": \"...\" } ],",
        "  \"structured_markdown\": \"...\",",
        "  \"target_context\": \"...\",",
        "  \"target_folder_path\": \"...\"",
        "}"
    ].join("\n");
}

function getFallbackCleanPrompt() {
    return [
        "# The Clerk Notes (Clean-in-Place Mode) - System Prompt",
        "",
        "You are 'The Clerk', a structured data extraction AI. You are processing an in-context meeting note or running document.",
        "",
        "## 1. TASK EXTRACTION",
        "Extract ONLY high-level, critical tasks found in the text. Do NOT extract vague, minor, or overly granular points. If a point is not clearly actionable, concrete, and critical, ignore it.",
        "Use the provided RECENT CONTEXT (EMAILS & TASKS) to ensure you do not extract duplicates of tasks that already exist, and to add nuance and specific details to the actions.",
        "Format them strictly as a JSON array of objects. Each object should have:",
        "- `title`: A clear, actionable title for the task. You MUST strictly apply the format: [Action Verb] [Object]. Example: 'Pay the 28 day electricity bill'. Do not just copy the raw text.",
        "- `notes`: Any context or details related to the task.",
        "If no critical tasks are found, return an empty array [].",
        "",
        "## 2. KNOWLEDGE CLEANUP",
        "Format the remaining knowledge and non-actionable text as clean, structured Markdown.",
        "Do not include the extracted tasks here.",
        "Do NOT categorize or determine a new target folder for this document.",
        "",
        "## 3. ASSET NAMING",
        "Determine a highly descriptive filename following the System Protocol. E.g., `YYYYMMDD [Context] Subject`. Provide the base filename without extension. You MUST provide a new filename.",
        "",
        "Output MUST be in the following JSON format:",
        "{",
        "  \"filename\": \"...\",",
        "  \"tasks\": [ { \"title\": \"...\", \"notes\": \"...\" } ],",
        "  \"structured_markdown\": \"...\"",
        "}"
    ].join("\n");
}

/**
 * Parses simple Markdown text and applies formatting to a Google Docs Body.
 * @param {GoogleAppsScript.Document.Body} body - The body element of the Document.
 * @param {string} markdownText - The structured markdown to apply.
 * @param {boolean} [appendMode=false] - If true, does not clear the body before appending.
 */
function applyMarkdownToGoogleDoc(body, markdownText, appendMode) {
    if (!appendMode) {
        body.clear();
    }
    const lines = markdownText.split('\n');
    lines.forEach(line => {
        let text = line.trim();
        if (!text) return;
        
        let p;
        if (text.startsWith('# ')) {
            p = body.appendParagraph(text.substring(2));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        } else if (text.startsWith('## ')) {
            p = body.appendParagraph(text.substring(3));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
        } else if (text.startsWith('### ')) {
            p = body.appendParagraph(text.substring(4));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
        } else if (text.startsWith('#### ')) {
            p = body.appendParagraph(text.substring(5));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING4);
        } else if (text.startsWith('##### ')) {
            p = body.appendParagraph(text.substring(6));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING5);
        } else if (text.startsWith('###### ')) {
            p = body.appendParagraph(text.substring(7));
            p.setHeading(DocumentApp.ParagraphHeading.HEADING6);
        } else if (text.startsWith('- ') || text.startsWith('* ')) {
            p = body.appendListItem(text.substring(2));
            p.setGlyphType(DocumentApp.GlyphType.BULLET);
        } else if (/^\d+\.\s/.test(text)) {
            p = body.appendListItem(text.replace(/^\d+\.\s/, ''));
            p.setGlyphType(DocumentApp.GlyphType.NUMBER);
        } else {
            p = body.appendParagraph(text);
        }
    });

    // Pass over the document to bold **text** and remove the asterisks
    let searchResult = body.findText("\\*\\*[^*]+\\*\\*");
    while (searchResult !== null) {
        let element = searchResult.getElement().asText();
        let start = searchResult.getStartOffset();
        let end = searchResult.getEndOffsetInclusive();
        
        // Apply bold to the inner characters
        element.setBold(start, end, true);
        
        // Remove the ** at the end and then at the beginning
        element.deleteText(end - 1, end);
        element.deleteText(start, start + 1);
        
        searchResult = body.findText("\\*\\*[^*]+\\*\\*"); 
    }
}


// ==========================================
// SECTION 2: GOOGLE PHOTOS ATTACHMENT SYNC
// ==========================================

/**
 * @file src/Code_TheClerk_Photo_Sync.js
 * @description Extracts automated photo backups from Messenger, Instagram, and Telegram, uploads them natively to Google Photos, and logs them in the Photo Register.
 *
 * @version 1.0.1
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added comprehensive JSDoc/Google-style docstrings. Standardized variable naming. Cleaned up code.
 * - 1.0.0: Initial implementation.
 */

/**
 * Processes automated photo backup emails from Messenger, Instagram, and Telegram.
 * Extracts image attachments, uploads them to Google Photos, and logs metadata
 * (including AI analysis) to the Photo Register sheet.
 *
 * @returns {void}
 */
function runRetroactivePhotoSync() {
  if (!isPipelineAuthorized("CLERK_PHOTOS")) return "Skipped (Scope Mismatch)";
  const query = "has:attachment (subject:[Instagram] OR subject:[Messenger] OR subject:[Telegram] OR subject:[WhatsApp]) from:adersteg.daniel@gmail.com -label:Photo_Extracted";
  const startTime = new Date().getTime();
  const maxExecutionTimeMs = 4 * 60 * 1000; // 4 minutes
  let threadsProcessed = 0;
  
  let label;
  try {
    label = GmailApp.getUserLabelByName("Photo_Extracted");
    if (!label) label = GmailApp.createLabel("Photo_Extracted");
  } catch(e) {
    console.warn("Failed to get/create label: " + e.message);
    return;
  }
  
  const photoRegisterId = "1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k"; 
  let sheet = null;
  try {
    const ss = SpreadsheetApp.openById(photoRegisterId);
    sheet = ss.getSheetByName("Table 1") || ss.getSheets()[1] || ss.getActiveSheet();
  } catch(e) {
    console.warn("Photo Register Sheet not accessible yet: " + e.message);
  }

  let deterministicRules = [];
  try {
    deterministicRules = getDeterministicRules() || [];
  } catch(e) {
    console.warn("Failed to retrieve deterministic rules: " + e.message);
  }

  while (true) {
    if (new Date().getTime() - startTime > maxExecutionTimeMs) {
      console.log(`Approaching time limit. Processed ${threadsProcessed} threads. Run again to continue.`);
      break;
    }
    
    const threads = GmailApp.search(query, 0, 10);
    if (threads.length === 0) {
      console.log(`Finished retroactive sync. Processed ${threadsProcessed} threads in total.`);
      break;
    }
    
    for (let i = 0; i < threads.length; i++) {
      // STRICT TIME CHECK inside the thread loop
      if (new Date().getTime() - startTime > maxExecutionTimeMs) {
        console.log(`Approaching time limit. Processed ${threadsProcessed} threads. Run again to continue.`);
        return;
      }

      const thread = threads[i];
      const messages = thread.getMessages();
      if (messages.length === 0) continue;

      const firstMsg = messages[0];
      const sender = firstMsg.getFrom();
      const subject = firstMsg.getSubject();

      // Extract thread body context (matching Code_TheClerk_Email.js logic)
      let body = "";
      if (messages.length === 1) {
        body = messages[0].getPlainBody().substring(0, 3000);
      } else {
        const recentMessages = messages.slice(-3);
        const bodies = recentMessages.map((m, idx) => `--- MSG ${idx+1} (FROM: ${m.getFrom()}) ---\n${m.getPlainBody().substring(0, 1500)}`);
        body = bodies.join('\n\n');
      }

      // Evaluate thread against deterministic rules
      let skipThread = false;
      try {
        const ruleMatch = _evaluateDeterministicRules(sender, subject, body, deterministicRules);
        if (ruleMatch && ruleMatch.skipAI === true) {
          console.log(` > Skipping photo backup for thread "${subject}" due to skipAI spreadsheet rule match.`);
          skipThread = true;
        }
      } catch(e) {
        console.warn("Error evaluating deterministic rules: " + e.message);
      }

      if (skipThread) {
        thread.addLabel(label);
        threadsProcessed++;
        continue;
      }

      // Determine target album based on channel
      let targetAlbumId = null;
      const lowerSubject = subject.toLowerCase();
      if (lowerSubject.includes("instagram")) {
        targetAlbumId = _getOrCreateAlbumByPlatform("instagram");
      } else if (lowerSubject.includes("telegram")) {
        targetAlbumId = _getOrCreateAlbumByPlatform("telegram");
      } else if (lowerSubject.includes("messenger")) {
        targetAlbumId = _getOrCreateAlbumByPlatform("messenger");
      }

      const uploadResults = _processAndUploadAttachments(messages);
      const mediaItemsToCreate = uploadResults.mediaItemsToCreate;
      const processedImages = uploadResults.processedImages;
      
      let urls = [];
      if (mediaItemsToCreate.length > 0) {
        urls = _batchCreateMediaItems(mediaItemsToCreate, targetAlbumId);
      }
        
      if (sheet && processedImages.length > 0) {
        let rowsToWrite = [];
        let urlIndex = 0;
        for (let m = 0; m < processedImages.length; m++) {
          const img = processedImages[m];
          let photoUrl = "";
          if (img.isWhatsApp) {
            photoUrl = "TBU";
          } else {
            photoUrl = urls[urlIndex] || "";
            urlIndex++;
          }
          
          rowsToWrite.push([
            img.name,
            "Gmail_Import",
            img.date,
            "", "", 
            photoUrl,
            img.analysis.category || "01 Private/05 Other",
            img.analysis.purpose || "",
            (img.analysis.activities || []).join(", "),
            (img.analysis.entities || []).join(", "),
            (img.analysis.text_found || []).join(", "),
            img.analysis.vibe || "",
            img.analysis.is_milestone || false
          ]);
        }

        if (rowsToWrite.length > 0) {
           sheet.getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
        }
      }
      Utilities.sleep(2000);
      thread.addLabel(label);
      threadsProcessed++;
    }
  }
}


/**
 * Uploads raw image bytes to Google Photos to obtain an upload token.
 * This token is required before calling the batchCreate API.
 *
 * @param {GoogleAppsScript.Base.Blob} blob - The image blob to upload.
 * @param {string} filename - The target filename.
 * @returns {string|null} The upload token string if successful, or null on failure.
 */
function _uploadBytesToPhotos(blob, filename) {
  const token = ScriptApp.getOAuthToken();
  const uploadOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": blob.getContentType(),
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-File-Name": filename || blob.getName()
    },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  };
  
  try {
    const uploadRes = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/uploads", uploadOptions);
    if (uploadRes.getResponseCode() === 200) {
      return uploadRes.getContentText();
    }
  } catch(e) {
    console.error("Photos Byte Upload failed: " + e.message);
  }
  return null;
}

/**
 * Dynamically retrieves or creates a platform-specific album in Google Photos and caches its ID.
 *
 * @param {string} platform - The platform identifier ('instagram', 'telegram', 'messenger').
 * @returns {string|null} The Google Photos album ID or null if unresolvable.
 */
function _getOrCreateAlbumByPlatform(platform) {
  if (!platform) return null;
  const normalized = platform.toLowerCase();
  let albumKey = "";
  let defaultTitle = "";

  let configId = "";
  if (normalized.includes("instagram")) {
    albumKey = "PHOTO_ALBUM_INSTAGRAM_ID";
    defaultTitle = (SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUMS && SYSTEM_CONFIG.PHOTOS.ALBUMS.INSTAGRAM) || "Instagram Backups";
    configId = SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS.INSTAGRAM;
  } else if (normalized.includes("telegram")) {
    albumKey = "PHOTO_ALBUM_TELEGRAM_ID";
    defaultTitle = (SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUMS && SYSTEM_CONFIG.PHOTOS.ALBUMS.TELEGRAM) || "Telegram Backups";
    configId = SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS.TELEGRAM;
  } else if (normalized.includes("messenger")) {
    albumKey = "PHOTO_ALBUM_MESSENGER_ID";
    defaultTitle = (SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUMS && SYSTEM_CONFIG.PHOTOS.ALBUMS.MESSENGER) || "Messenger Backups";
    configId = SYSTEM_CONFIG.PHOTOS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS && SYSTEM_CONFIG.PHOTOS.ALBUM_IDS.MESSENGER;
  } else {
    return null;
  }

  if (configId) return configId;

  // 1. Check ScriptProperties cache
  try {
    const cachedId = PropertiesService.getScriptProperties().getProperty(albumKey);
    if (cachedId) return cachedId;
  } catch(e) {
    console.warn(`Could not read property ${albumKey}: ${e.message}`);
  }

  // 2. Create album via Google Photos API
  const token = ScriptApp.getOAuthToken();
  const createAlbumOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/json"
    },
    payload: JSON.stringify({ album: { title: defaultTitle } }),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/albums", createAlbumOptions);
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data && data.id) {
        try {
          PropertiesService.getScriptProperties().setProperty(albumKey, data.id);
        } catch(e) {}
        console.log(`Created new Google Photos album: "${defaultTitle}" with ID ${data.id}`);
        return data.id;
      }
    } else {
      console.error(`Failed to create Google Photos album "${defaultTitle}": ${res.getContentText()}`);
    }
  } catch(e) {
    console.error(`Exception creating album "${defaultTitle}": ${e.message}`);
  }

  return null;
}

/**
 * Submits a batch request to Google Photos to create new media items using upload tokens.
 * Optionally places the items directly into a target album upon creation.
 *
 * @param {Array<Object>} mediaItems - Array of media item objects containing descriptions and uploadTokens.
 * @param {string} [albumId] - Optional Google Photos album ID to deposit the media items into.
 * @returns {Array<string>} An array of product URLs corresponding to the created media items.
 */
function _batchCreateMediaItems(mediaItems, albumId) {
  const token = ScriptApp.getOAuthToken();
  const payloadObj = { newMediaItems: mediaItems };
  if (albumId) {
    payloadObj.albumId = albumId;
  }
  const createOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/json"
    },
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true
  };
  
  let urls = [];
  try {
    const res = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", createOptions);
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data.newMediaItemResults) {
        for (let i = 0; i < data.newMediaItemResults.length; i++) {
          const item = data.newMediaItemResults[i];
          if (item.mediaItem && item.mediaItem.productUrl) {
            urls.push(item.mediaItem.productUrl);
          } else {
            urls.push("");
          }
        }
      }
    } else {
      console.error("Photos Batch create failed: " + res.getContentText());
    }
  } catch(e) {
    console.error("Photos Batch create exception: " + e.message);
  }
  return urls;
}

/**
 * Analyzes an image using the Gemini API to extract rich metadata and contextual information.
 *
 * @param {GoogleAppsScript.Base.Blob} blob - The image blob to analyze.
 * @param {Object} msgContext - Context from the original email (subject, sender, date, body).
 * @returns {Object} Parsed JSON object containing the Gemini analysis, or empty object on failure.
 */
function _analyzePhotoWithGemini(blob, msgContext) {
  const base64Image = Utilities.base64Encode(blob.getBytes());
  const prompt = "Analyze this image and return a JSON object with: category (from TS taxonomy), purpose, activities (array), entities (array), text_found (array), vibe, is_milestone (boolean)." + (msgContext ? `\n\nOriginal Message Context:\n- Subject: ${msgContext.subject}\n- Sender: ${msgContext.sender}\n- Date: ${msgContext.date}\n- Body: ${msgContext.body ? msgContext.body.substring(0, 500) : ''}` : "");
  
  const parts = [
    { text: prompt },
    { inlineData: { mimeType: blob.getContentType(), data: base64Image } }
  ];

  const photoSchema = {
    type: "OBJECT",
    properties: {
      category: { type: "STRING" },
      purpose: { type: "STRING" },
      activities: { type: "ARRAY", items: { type: "STRING" } },
      entities: { type: "ARRAY", items: { type: "STRING" } },
      text_found: { type: "ARRAY", items: { type: "STRING" } },
      vibe: { type: "STRING" },
      is_milestone: { type: "BOOLEAN" }
    },
    required: ["category", "purpose", "activities", "entities", "text_found", "vibe", "is_milestone"]
  };

  const modelName = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
  const genOptions = { maxOutputTokens: 2048 };
  let parsed = callGemini(parts, modelName, "You are an expert image analyzer.", photoSchema, false, genOptions);
  if (!parsed || parsed.error) {
    const fallback = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE || "gemini-3.5-flash-lite";
    console.warn(`Photo Sync analysis on ${modelName} encountered an issue, retrying with fallback ${fallback}...`);
    parsed = callGemini(parts, fallback, "You are an expert image analyzer.", photoSchema, false, genOptions);
  }

  if (parsed && !parsed.error) {
    return parsed;
  } else {
    console.error("Gemini analysis failed: " + (parsed ? parsed.error : "Unknown error"));
    return {};
  }
}


/**
 * Processes messages to extract image attachments, uploads them, and performs AI analysis.
 * Extracted from processGmailPhotos to improve error handling and readability.
 *
 * @param {Array<GoogleAppsScript.Gmail.GmailMessage>} messages - Array of Gmail messages to process.
 * @returns {Object} Object containing arrays for `processedImages` and `mediaItemsToCreate`.
 */
function _processAndUploadAttachments(messages) {
  let processedImages = [];
  let mediaItemsToCreate = [];

  for (let j = 0; j < messages.length; j++) {
    const msg = messages[j];
    const attachments = msg.getAttachments();
    const date = msg.getDate();
    const subject = msg.getSubject();
    const sender = msg.getFrom();
    const body = msg.getPlainBody();

    for (let k = 0; k < attachments.length; k++) {
      const att = attachments[k];
      if (att.getContentType().indexOf("image/") !== -1) {
        try {
          // Remove brackets and make it a clean sentence
          let cleanSubject = subject.replace(/\[|\]/g, "").replace(/\s+/g, " ").trim();
          let safeFilename = cleanSubject.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_") + ".jpg";
          
          let isWhatsApp = cleanSubject.toLowerCase().includes("whatsapp");
          let uploadToken = null;
          
          if (!isWhatsApp) {
            // 1. Upload bytes (get token)
            uploadToken = _uploadBytesToPhotos(att, safeFilename);
            if (!uploadToken) continue;
          }

          // 2. Analyze with Gemini
          const analysis = _analyzePhotoWithGemini(att, { subject: subject, sender: sender, date: date, body: body });

          if (!isWhatsApp) {
            // Strip URLs and programmatic brackets to prevent Google Photos from silently dropping the metadata as 'spam'
            let cleanBody = body ? body.replace(/https?:\/\/[^\s]+/g, "[Link removed]").substring(0, 400).trim() : "";
            let photoDescription = `Source: ${cleanSubject}\nDate: ${date}\nMessage: ${cleanBody}`;

            mediaItemsToCreate.push({
              description: photoDescription,
              simpleMediaItem: {
                uploadToken: uploadToken,
                fileName: safeFilename
              }
            });
          }

          processedImages.push({
            name: safeFilename,
            date: date,
            analysis: analysis,
            isWhatsApp: isWhatsApp
          });

          // Small delay to avoid hammering the upload API
          Utilities.sleep(500);
        } catch (e) {
          console.warn(`Failed processing attachment in message ${subject}: ${e.message}`);
        }
      }
    }
  }

  return { processedImages, mediaItemsToCreate };
}


// ==========================================
// SECTION 3: ANTIGRAVITY TRANSCRIPT SYNC
// ==========================================

/**
 * @file src/Code_TheClerk_Antigravity.js
 * @description Syncs Antigravity conversation transcripts to the 5 Import - Antigravity Log tab using Gemini API.
 */

function runAntigravitySync() {
  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const BRAIN_FOLDER_ID = "19Yq7j6eyV3hmw83RPbBv2Ro0eJMnlTUM";
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName("5 Import - Antigravity Log");
  if (!logSheet) {
    console.error("runAntigravitySync: '5 Import - Antigravity Log' tab not found.");
    return;
  }
  
  // Get all existing convo IDs to know if we are doing incremental or full
  try {
    const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
    const BRAIN_FOLDER_ID = "19Yq7j6eyV3hmw83RPbBv2Ro0eJMnlTUM";
    const MODEL = SYSTEM_CONFIG.SECRETS.GEMINI_PRIMARY_MODEL || "gemini-3.7-flash";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName("5 Import - Antigravity Log");
    if (!logSheet) {
      console.error("runAntigravitySync: '5 Import - Antigravity Log' tab not found.");
      return;
    }
    
    const lastRow = logSheet.getLastRow();
    const range = logSheet.getRange(2, 1, Math.max(1, lastRow - 1), 7);
    const data = lastRow > 1 ? range.getValues() : [];
    
    // Create a map of existing convo IDs to their data to check for duplicates / incremental updates
    const existingConvos = {};
    for (let row of data) {
      if (row[1]) { // Convo ID is column B
        existingConvos[row[1]] = row;
      }
    }
    
    // Only process files modified in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // We search for jsonl files. The transcript.jsonl files are usually named transcript.jsonl
    const query = `title = 'transcript.jsonl' and modifiedDate > '${yesterday.toISOString()}'`;
    const files = DriveApp.searchFiles(query);
    
    let processedCount = 0;
    while (files.hasNext() && processedCount < 20) { // Limit to 20 per run to avoid timeout
      const file = files.next();
      
      // Ensure this is actually an Antigravity log by verifying its parent structure
      // Structure: brain/<convo-id>/.system_generated/logs/transcript.jsonl
      const parents = file.getParents();
      let isValid = false;
      let convoId = "Unknown";
      
      if (parents.hasNext()) {
        const logsFolder = parents.next();
        const sysParents = logsFolder.getParents();
        if (sysParents.hasNext()) {
          const sysFolder = sysParents.next();
          const convoParents = sysFolder.getParents();
          if (convoParents.hasNext()) {
            const convoFolder = convoParents.next();
            convoId = convoFolder.getName();
            
            // Check if it's inside the brain folder
            const brainParents = convoFolder.getParents();
            if (brainParents.hasNext()) {
              if (brainParents.next().getId() === BRAIN_FOLDER_ID) {
                isValid = true;
              }
            }
          }
        }
      }
      
      if (!isValid) continue;
      
      console.log(`Processing transcript for Convo: ${convoId}`);
      
      const content = file.getBlob().getDataAsString();
      const lines = content.split('\n');
      
      const existingRow = existingConvos[convoId];
      let prompt = "";
      
      if (existingRow) {
        // Incremental Update
        const recentLines = lines.slice(-200).join('\n');
        prompt = `You are an expert project manager. I am giving you the latest transcript from an ongoing AI Agent conversation.
The conversation's overall purpose is: "${existingRow[5]}"
The previous summary of work was: "${existingRow[6]}"

Based on the recent transcript below, provide an updated, concise bulleted summary of the actual work completed recently. Focus ONLY on new work done in this transcript chunk.
Return EXACTLY a valid JSON object with the key "summary".

TRANSCRIPT:
${recentLines}`;
      } else {
        // New Conversation
        let startLines = lines.slice(0, 100).join('\n');
        let endLines = lines.slice(-200).join('\n');
        let compressed = startLines + "\n\n...[MIDDLE TRUNCATED]...\n\n" + endLines;
        if (lines.length < 300) compressed = lines.join('\n');
        
        prompt = `You are an expert project manager. Review the following AI Agent conversation transcript and extract the key tasks and purpose.
Return EXACTLY a valid JSON object with the following keys:
- "type": "Main User" if this conversation is driven by a human user, or "Subagent" if this is a sub-agent conversation spawned by another agent.
- "name": A short 3-5 word title for the conversation
- "purpose": A 1-2 sentence description of the overall goal or purpose of the conversation based on the start.
- "summary": A concise bulleted summary of the actual work completed by the AI agent.

TRANSCRIPT:
${compressed}`;
      }
      
      // Call Gemini API
      try {
        const parsed = callGemini(prompt, MODEL, "You are an expert project manager.", null);
        
        if (parsed && !parsed.error) {
          const currentDate = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
          
          if (existingRow) {
            logSheet.appendRow([
              currentDate,
              convoId,
              existingRow[2],
              existingRow[3],
              existingRow[4],
              existingRow[5],
              parsed.summary
            ]);
          } else {
            let createdDate = Utilities.formatDate(file.getDateCreated(), "GMT", "yyyy-MM-dd HH:mm:ss");
            try {
              const firstStep = JSON.parse(lines[0]);
              if (firstStep.created_at) {
                createdDate = firstStep.created_at.replace("T", " ").replace("Z", "");
              }
            } catch(e) {}
            
            logSheet.appendRow([
              currentDate,
              convoId,
              parsed.type || "Main User",
              parsed.name,
              createdDate,
              parsed.purpose,
              parsed.summary
            ]);
          }
        } else {
          console.error(`Gemini Error on ${convoId}: ${parsed ? parsed.error : "Unknown Error"}`);
        }
      } catch (e) {
        console.error(`Failed to process ${convoId}: ${e.message}`);
      }
      
      processedCount++;
    }
    
    console.log(`Successfully processed ${processedCount} conversations via Antigravity Sync.`);
  } catch (e) {
    console.error(`runAntigravitySync failed: ${e.message}`);
  }
}

