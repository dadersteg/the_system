/**
 * @file Code_TheClerk_Notes.js
 * @description Processes unstructured notes, extracts tasks via Gemini, cleans up formatting, and routes/files appropriately.
 */

const NOTES_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
const NOTES_MODEL = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH;

const NOTES_LOG_GID = SYSTEM_CONFIG.SHEET_GIDS.NOTES_LOG;
const MASTER_SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;

const ARCHIVE_ROOT = SYSTEM_CONFIG.ROOTS.DRIVE_RETRO_ROOT_ID;

function runTheClerkNotes() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;
    
    const sessionStart = Date.now();
    console.log(">>> [NOTES START] The Clerk Notes Engine");
    
    try {
        const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
        let logSheet = null;
        if (NOTES_LOG_GID !== "TODO_NOTES_LOG_GID") {
            logSheet = ss.getSheets().find(s => s.getSheetId().toString() === NOTES_LOG_GID);
        }
        
        let batchLogs = [];
        
        const routeFolders = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.ROUTE_MODE;
        const cleanFolders = SYSTEM_CONFIG.CLERK_NOTES_FOLDERS.CLEAN_MODE;
        
        const NOTES_ROUTE_PROMPT_ID = PropertiesService.getScriptProperties().getProperty("CLERK_NOTES_ROUTE_PROMPT_ID") || "PLACEHOLDER_ROUTE_ID";
        const NOTES_CLEAN_PROMPT_ID = PropertiesService.getScriptProperties().getProperty("CLERK_NOTES_CLEAN_PROMPT_ID") || "PLACEHOLDER_CLEAN_ID";
        
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
        console.error("FATAL in Notes Processing: " + e.message);
    } finally {
        lock.releaseLock();
        console.log(`<<< [NOTES END] Completed in ${((Date.now() - sessionStart) / 1000).toFixed(1)}s`);
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
        const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
        recentContext = typeof fetchRecentContext === 'function' ? fetchRecentContext(ss) : "";
    } catch(e) {}

    runningDocs.forEach(fileId => {
        if (fileId && fileId.trim() !== "") {
            processRunningNoteById(fileId, batchLogs, recentContext);
        }
    });
    
    if (batchLogs.length > 0) {
        try {
            const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
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
        
        const NOTES_CLEAN_PROMPT_ID = PropertiesService.getScriptProperties().getProperty("CLERK_NOTES_CLEAN_PROMPT_ID") || "PLACEHOLDER_CLEAN_ID";
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
                            const taskNotes = `${file.getUrl()}\n[Source: ${file.getName()}]\n\n${t.notes || ""}`;
                            const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                            Tasks.Tasks.insert({ title: t.title, notes: taskNotes.trim() }, listId);
                            tasksCreated++;
                            
                            finalMarkdown += `- **${t.title}**\n`;
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
                    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
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
                                    const taskNotes = `${file.getUrl()}\n[Source: ${file.getName()}]\n\n${t.notes || ""}`;
                                    const listId = SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID || SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
                                    Tasks.Tasks.insert({ title: t.title, notes: taskNotes.trim() }, listId);
                                    tasksCreated++;
                                    
                                    finalMarkdown += `- **${t.title}**\n`;
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${NOTES_MODEL}:generateContent?key=${NOTES_KEY}`;
    
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
    
    parts.push({ text: "--- RAW NOTE TEXT ---\n" + text });
    
    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
            contents: [{ role: "user", parts: parts }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
        }),
        muteHttpExceptions: true
    };
    
    try {
        const resp = UrlFetchApp.fetch(url, options);
        if (resp.getResponseCode() === 200) {
            const res = JSON.parse(resp.getContentText());
            let raw = res.candidates[0].content.parts[0].text;
            
            raw = raw.replace(/^```json/m, "").replace(/```$/m, "").trim();
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON object found in response");
            
            return { status: "SUCCESS", data: JSON.parse(match[0]) };
        } else {
            return { status: "ERROR", message: `HTTP ${resp.getResponseCode()} - ${resp.getContentText()}` };
        }
    } catch (e) {
        return { status: "ERROR", message: e.message };
    }
}

function getPromptText(promptId, fallback) {
    try {
        return DocumentApp.openById(promptId).getBody().getText();
    } catch (e) {
        return fallback;
    }
}

function getTaxonomyJson() {
    try {
        return DriveApp.getFileById(SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID).getBlob().getDataAsString();
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
