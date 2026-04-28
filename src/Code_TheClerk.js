/**
* THE CLERK: VERSION 25.0 (THE TRUTH ENGINE)
* - Model: gemini-3.1-flash-lite-preview (Tier 1)
* - Fix 1: Advanced Drive v3 Syntax (Uses 'create' with 'name' instead of 'insert' with 'title').
* - Fix 2: Error Isolation (Stops Gemini from analyzing system error messages).
* - Fix 3: Extension Lock & Source ID Preservation.
* - Logic: Batches Text/Code | Isolates PDF/PNG for stability.
*/


// --- 1. CONFIGURATION ---
const PROPS = PropertiesService.getScriptProperties();
const KEY = PROPS.getProperty("gemini_api_key");
const MODEL_ID = "gemini-3.1-flash-lite-preview";


const LOG_SHEET_ID = "1emckMH8cZP9z5PXo3k_J8n-5IWq4DZUrm2xB2zVApdU";
const MAX_BATCH_SIZE = 1;
const TOTAL_FILES_LIMIT = 3;
const MAX_EXECUTION_TIME_MS = 280000;


const DOC_IDS = {
    INSTRUCTIONS: "1BgYouMZhPq9XPj73fxQZRCfrSTwWfvehdYzll5YuNVw",
    CATEGORISATION: "1VuAd3h1YrMBgdJWOtWQiObnEUKT00zdq9jTYXBX6Dnk",
    PROTOCOL: "1rL1zqmSbzm9jjz2gJ2dewHxBRwX-cWIgN9gy3L-4idI"
};


const FOLDERS = {
    STND_SOURCES: ["1XossC1cdOZE82efew3qH48LJnhl6ng4i", "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", "17uUH01ihipNeRfTQQcD61zzjORpWFCRY"],
    STND_DEST: "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb",
    ARCHIVE_ROOT: "1RUVHQkPk3RjTYNnZSXm7qNSrFyP46cC4",
    REVIEW: "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY"
};


// --- 2. ENGINES ---


function runTheClerkStandard() { executeEngine("STANDARD"); }
function runTheClerkArchive() { executeEngine("ARCHIVE"); }


function executeEngine(mode) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;
    const sessionStart = Date.now();
    console.log(`>>> [${mode} START] v25.0`);
    try {
        const log = SpreadsheetApp.openById(LOG_SHEET_ID).getSheets()[0];
        const fullRules = loadKnowledgeDocs();
        const visionRules = fullRules.substring(0, 5000);
        let allFiles = [];


        // Search Phase
        if (mode === "STANDARD") {
            FOLDERS.STND_SOURCES.forEach(id => {
                try {
                    const folder = DriveApp.getFolderById(id);
                    const files = folder.getFiles();
                    while (files.hasNext() && allFiles.length < TOTAL_FILES_LIMIT) {
                        const f = files.next();
                        allFiles.push({ id: f.getId(), name: f.getName(), mime: f.getMimeType(), desc: f.getDescription() || "", sourceFolderId: id });
                    }
                } catch (e) { }
            });
        } else {
            const processedIds = new Set(log.getDataRange().getValues().map(r => String(r[0]).includes("id=") ? r[0].split('id=')[1] : null));
            allFiles = getArchiveFilesRecursive(FOLDERS.ARCHIVE_ROOT, processedIds, TOTAL_FILES_LIMIT);
        }


        console.log(`[FOUND] ${allFiles.length} files.`);

        // Batching Logic
        let currentBatch = [];
        for (let f of allFiles) {
            if (Date.now() - sessionStart > MAX_EXECUTION_TIME_MS) break;


            const needsIsolation = f.mime.includes("image/") || f.mime === "application/pdf" || f.mime.includes("officedocument") || f.mime.includes("ms-");


            if (needsIsolation) {
                if (currentBatch.length > 0) { processAndLog(currentBatch, fullRules, log, mode); currentBatch = []; }
                const rulesToUse = f.mime.includes("image/") ? visionRules : fullRules;
                processAndLog([f], rulesToUse, log, mode);
            } else {
                currentBatch.push(f);
                if (currentBatch.length >= MAX_BATCH_SIZE) { processAndLog(currentBatch, fullRules, log, mode); currentBatch = []; }
            }
        }
        if (currentBatch.length > 0) processAndLog(currentBatch, fullRules, log, mode);


    } catch (e) { console.error("FATAL: " + e.message); }
    finally { lock.releaseLock(); }
}


// --- 3. UNIFIED PROCESSING & LOGGING ---


function processAndLog(batch, rules, logSheet, mode) {
    console.log(`   > Extracting: ${batch.map(b => b.name).join(", ")}`);
    const batchLogs = [];
    // 1. EXTRACTION WITH ERROR CATCHING
    let validFiles = [];
    batch.forEach(f => {
        const extData = extractContentV3(f);
        if (extData.error) {
            console.error(`   [SKIP] Extraction error for ${f.name}: ${extData.error}`);
            batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[EXTRACTION FAILED]", "N/A", "N/A", "System Error during reading", extData.error, "N/A", 0, 0, "EXTRACTION_ERROR", f.sourceFolderId]);
            moveToReview(f.id, extData.error);
        } else {
            f.parts = extData.part;
            validFiles.push(f);
        }
    });


    if (validFiles.length === 0) {
        if (batchLogs.length > 0) logSheet.getRange(logSheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
        return;
    }


    // 2. SEND VALID FILES TO GEMINI
    const aiResult = askGeminiStable(rules, validFiles);


    if (aiResult.status === "SUCCESS" && aiResult.data.length === validFiles.length) {
        const tpf = Math.round(aiResult.tokens / validFiles.length);
        validFiles.forEach((f, idx) => {
            try {
                const data = aiResult.data[idx];
                const finalName = getLockedName(data, f);
                const file = DriveApp.getFileById(f.id);

                file.setName(finalName);
                file.setDescription(`${data.description}\n\nSummary: ${data.summary}`);
                if (mode === "STANDARD") file.moveTo(DriveApp.getFolderById(FOLDERS.STND_DEST));


                batchLogs.push([file.getUrl(), f.name, f.desc, finalName, data.path_code, data.context_id, data.summary, data.description, data.reasoning, tpf, 0, `${mode} Success`, f.sourceFolderId]);
                console.log(`   [OK] Processed: ${finalName}`);
            } catch (e) {
                batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[SYSTEM ERROR]", "N/A", "N/A", "Update Failed", e.message, "N/A", 0, 0, "SYSTEM_ERROR", f.sourceFolderId]);
                moveToReview(f.id, e.message);
            }
        });
    } else {
        // Retry logic
        if (validFiles.length > 1) {
            if (batchLogs.length > 0) {
                logSheet.getRange(logSheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
                batchLogs.length = 0;
            }
            validFiles.forEach(single => processAndLog([single], rules, logSheet, mode));
        } else {
            const f = validFiles[0];
            console.error(`   [API REJECTED] ${f.name}: ${aiResult.message}`);
            batchLogs.push([`https://drive.google.com/open?id=${f.id}`, f.name, f.desc, "[REJECTED]", "N/A", "N/A", "API Error", aiResult.message, "Review Required", 0, 0, "API_ERROR", f.sourceFolderId]);
            moveToReview(f.id, aiResult.message);
        }
    }

    if (batchLogs.length > 0) {
        logSheet.getRange(logSheet.getLastRow() + 1, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
    }
}


// --- 4. THE V3 CONTENT EXTRACTOR ---


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


        // 2. Corrected V3 OCR/Office Conversion
        if (mime === "application/pdf" || mime.includes("officedocument") || mime.includes("ms-word") || mime.includes("ms-excel")) {
            const target = (mime.includes("sheet") || mime.includes("excel")) ? MimeType.GOOGLE_SHEETS : MimeType.GOOGLE_DOCS;

            // FIXED: Drive Service v3 syntax (create + name)
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


// --- 5. STABLE API CALL ---


function askGeminiStable(rules, batch) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${KEY}`;
    const parts = [{ text: rules }, { text: `Analyze ${batch.length} files. Return JSON ARRAY.` }];
    batch.forEach((f, i) => { parts.push({ text: `--- FILE [${i}]: ${f.name} ---` }); parts.push(f.parts); });


    const options = { method: "post", contentType: "application/json", payload: JSON.stringify({ contents: [{ role: "user", parts: parts }], generationConfig: { response_mime_type: "application/json" } }), muteHttpExceptions: true };
    let retries = 3; let wait = 2000;
    while (retries > 0) {
        try {
            const resp = UrlFetchApp.fetch(url, options);
            const code = resp.getResponseCode();
            if (code === 200) {
                const res = JSON.parse(resp.getContentText());
                const raw = res.candidates[0].content.parts[0].text;
                const s = raw.indexOf('['); const e = raw.lastIndexOf(']');
                return { status: "SUCCESS", data: JSON.parse(raw.substring(s, e + 1)), tokens: res.usageMetadata.totalTokenCount };
            }
            if (code === 503 || code === 429) { Utilities.sleep(wait); wait *= 2; retries--; continue; }
            return { status: "ERROR", message: `HTTP ${code}` };
        } catch (e) { return { status: "ERROR", message: e.message }; }
    }
    return { status: "ERROR", message: "Timeout" };
}


// --- 6. HELPERS ---


function getArchiveFilesRecursive(folderId, processedSet, limit) {
    const list = []; const stack = [folderId];
    while (stack.length > 0 && list.length < limit) {
        const id = stack.pop();
        try {
            const folder = DriveApp.getFolderById(id);
            const files = folder.getFiles();
            while (files.hasNext() && list.length < limit) {
                const f = files.next();
                if (!processedSet.has(f.getId())) list.push({ id: f.getId(), name: f.getName(), mime: f.getMimeType(), desc: f.getDescription() || "", sourceFolderId: id });
            }
            const subs = folder.getFolders();
            while (subs.hasNext()) {
                const s = subs.next();
                if (s.getName() !== "[File Review]") stack.push(s.getId());
            }
        } catch (e) { }
    }
    return list;
}


function getLockedName(ai, f) {
    const extMatch = f.name.match(/\.[0-9a-z]+$/i);
    const ext = extMatch ? extMatch[0] : "";
    let cleanName = String(ai.filename || f.name).replace(/\.[0-9a-z]+$/i, "");
    cleanName = cleanName.replace(/^([0-9XOYZW]{2}\s[0-9XOYZW]{2}\s[0-9XOYZW]{2}\s*-\s*)/i, "");
    const prefix = (ai.context_id && ai.context_id !== "Unknown") ? ai.context_id : "Unknown";
    let final = cleanName.startsWith(prefix) ? cleanName : `${prefix} - ${cleanName}`;
    return final.endsWith(ext) ? final : final + ext;
}


function loadKnowledgeDocs() { return [DocumentApp.openById(DOC_IDS.INSTRUCTIONS).getBody().getText(), DocumentApp.openById(DOC_IDS.CATEGORISATION).getBody().getText(), DocumentApp.openById(DOC_IDS.PROTOCOL).getBody().getText()].join("\n\n"); }
function moveToReview(id, msg) { try { const f = DriveApp.getFileById(id); f.setDescription("FAILED: " + msg); f.moveTo(DriveApp.getFolderById(FOLDERS.REVIEW)); } catch (e) { } }
