/**
 * THE CLERK: BATCH API PIPELINE (HISTORICAL RETRO)
 * 4-Step decoupled architecture for mass processing of legacy emails and drive files.
 */

const BATCH_CONFIG = {
  maxBatchSize: 1000,
  geminiModel: "gemini-3.0-flash", // Update to whichever model you are using
  qaSheetHeaders: ["Type", "ID", "Original Name/Subject", "Proposed Name", "Original Path", "Proposed Path/Labels", "Summary", "Status"],
};

// ==========================================
// STEP 1 & 2: PAYLOAD EXTRACTOR & BATCH REQUEST
// ==========================================

function initiateDriveBatchRetro() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("GEMINI_API_KEY");
  const folderId = props.getProperty("RETRO_DRIVE_FOLDER_ID"); // Root of your backlog
  
  if (!apiKey || !folderId) throw new Error("Missing API Key or Retro Folder ID");

  // 1. EXTRACT PAYLOAD
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.searchFiles('trashed = false'); // You can add logic to skip already processed files
  
  let jsonlPayload = "";
  let count = 0;
  let fileManifest = [];

  // Assuming taxonomyJsonStr and docInstructions are fetched similar to ongoing triage
  const taxonomyJsonStr = getTaxonomyStr(); 
  const docInstructions = getDrivePromptStr(); 

  while (files.hasNext() && count < BATCH_CONFIG.maxBatchSize) {
    const file = files.next();
    // Skip if we already tagged it (assuming you use a specific property or description marker)
    if (file.getDescription() && file.getDescription().includes("[CLERK PROCESSED]")) continue;

    const fileId = file.getId();
    const fileName = file.getName();
    
    // We only process text/PDFs here. For simplicity, we just pass the name and basic text if possible.
    // In a real scenario, you'd extract text for PDFs, but for 60k files, filenames might be the safest bulk start.
    const prompt = `[SYSTEM INSTRUCTION: Categorize the following legacy file.]\nTAXONOMY:\n${taxonomyJsonStr}\nINSTRUCTIONS:\n${docInstructions}\nFILE NAME: ${fileName}`;

    const requestObj = {
      "request": {
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": { "responseMimeType": "application/json" }
      }
    };

    jsonlPayload += JSON.stringify(requestObj) + "\n";
    fileManifest.push({ id: fileId, name: fileName, type: "DRIVE" });
    count++;
  }

  if (count === 0) {
    console.log("No new files found for batch processing.");
    return;
  }

  // 2. UPLOAD TO GEMINI FILE API
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media&key=${apiKey}`;
  const uploadRes = UrlFetchApp.fetch(uploadUrl, {
    method: "post",
    contentType: "application/jsonl",
    payload: jsonlPayload,
    muteHttpExceptions: true
  });

  if (uploadRes.getResponseCode() !== 200) {
    throw new Error("Failed to upload JSONL to Gemini: " + uploadRes.getContentText());
  }

  const fileUri = JSON.parse(uploadRes.getContentText()).file.uri;

  // 3. START BATCH PREDICT JOB
  const batchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${BATCH_CONFIG.geminiModel}:batchPredict?key=${apiKey}`;
  const batchRes = UrlFetchApp.fetch(batchUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      "dataset": { "uri": fileUri },
      "destinations": [{ "uri": "" }] // Gemini will store the output in GCP/Drive or return a URI
    }),
    muteHttpExceptions: true
  });

  const batchData = JSON.parse(batchRes.getContentText());
  
  if (batchData.name) {
    props.setProperty("ACTIVE_BATCH_JOB", batchData.name);
    // Store manifest to map results back to specific files later
    props.setProperty("ACTIVE_BATCH_MANIFEST", JSON.stringify(fileManifest)); 
    console.log("Batch Job Started: " + batchData.name);
  } else {
    throw new Error("Failed to start Batch Job: " + batchRes.getContentText());
  }
}

// ==========================================
// STEP 3: QA STAGING AREA (POLLING)
// ==========================================

function pollBatchJobStatus() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("GEMINI_API_KEY");
  const jobName = props.getProperty("ACTIVE_BATCH_JOB");
  const manifestStr = props.getProperty("ACTIVE_BATCH_MANIFEST");

  if (!jobName) return; // No active job

  const url = `https://generativelanguage.googleapis.com/v1beta/${jobName}?key=${apiKey}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const jobData = JSON.parse(res.getContentText());

  if (jobData.state === "SUCCEEDED") {
    console.log("Batch Job Succeeded! Downloading results...");
    
    // Download results (Assuming outputUri is provided in jobData)
    const resultUri = jobData.outputUri; 
    const resultData = UrlFetchApp.fetch(`${resultUri}?key=${apiKey}`).getContentText();
    const resultLines = resultData.split("\n").filter(l => l.trim() !== "");
    
    const manifest = JSON.parse(manifestStr);
    const sheetData = [];

    resultLines.forEach((line, index) => {
      const parsed = JSON.parse(line);
      const aiResponse = JSON.parse(parsed.response.candidates[0].content.parts[0].text);
      const fileInfo = manifest[index];

      sheetData.push([
        fileInfo.type,
        fileInfo.id,
        fileInfo.name,
        aiResponse.targetName || fileInfo.name, // Proposed Name
        "Legacy Archive", // Original Path
        aiResponse.targetFolder || "N/A", // Proposed Path
        aiResponse.summary || "N/A",
        "PENDING"
      ]);
    });

    // Write to Spreadsheet
    const ssId = props.getProperty("MASTER_SHEET_ID");
    const ss = SpreadsheetApp.openById(ssId);
    const dateStr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
    let sheet = ss.getSheetByName(`Batch QA [${dateStr}]`);
    if (!sheet) {
      sheet = ss.insertSheet(`Batch QA [${dateStr}]`);
      sheet.appendRow(BATCH_CONFIG.qaSheetHeaders);
      sheet.getRange("1:1").setFontWeight("bold");
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, sheetData.length, sheetData[0].length).setValues(sheetData);
    
    // Clear properties
    props.deleteProperty("ACTIVE_BATCH_JOB");
    props.deleteProperty("ACTIVE_BATCH_MANIFEST");
    console.log("QA Staging complete. Awaiting human review.");

  } else if (jobData.state === "FAILED") {
    console.error("Batch Job Failed:", jobData);
    props.deleteProperty("ACTIVE_BATCH_JOB");
  } else {
    console.log(`Job ${jobName} is still ${jobData.state}. Waiting...`);
  }
}

// ==========================================
// STEP 4: EXECUTION ENGINE (HUMAN-APPROVED)
// ==========================================

function executeApprovedBatchItems() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("MASTER_SHEET_ID");
  const ss = SpreadsheetApp.openById(ssId);
  
  // Find all QA Sheets
  const sheets = ss.getSheets().filter(s => s.getName().startsWith("Batch QA"));
  
  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const statusIdx = headers.indexOf("Status");
    const idIdx = headers.indexOf("ID");
    const typeIdx = headers.indexOf("Type");
    const propNameIdx = headers.indexOf("Proposed Name");
    const propPathIdx = headers.indexOf("Proposed Path/Labels");
    const summaryIdx = headers.indexOf("Summary");

    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIdx] === "APPROVED") {
        const type = data[i][typeIdx];
        const itemId = data[i][idIdx];
        const newName = data[i][propNameIdx];
        const newPath = data[i][propPathIdx];
        const summary = data[i][summaryIdx];

        try {
          if (type === "DRIVE") {
            const file = DriveApp.getFileById(itemId);
            // CRITICAL REVISION: DO NOT MOVE FILE. 
            // 1. Rename to match taxonomy
            file.setName(newName);
            // 2. Inject summary + processed flag into description
            file.setDescription(`[CLERK PROCESSED]\nTaxonomy: ${newPath}\nSummary: ${summary}`);
            
          } else if (type === "EMAIL") {
            const thread = GmailApp.getThreadById(itemId);
            // 1. Apply L4 Labels based on taxonomy
            const labels = newPath.split(",").map(l => l.trim());
            labels.forEach(labelName => {
              let label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
              thread.addLabel(label);
            });
            // Mark as processed
            let processedLabel = GmailApp.getUserLabelByName("Label_Reviewed") || GmailApp.createLabel("Label_Reviewed");
            thread.addLabel(processedLabel);
          }

          // Mark as DONE in sheet
          sheet.getRange(i + 1, statusIdx + 1).setValue("DONE");

        } catch (e) {
          console.error(`Failed to execute item ${itemId}: ${e.message}`);
          sheet.getRange(i + 1, statusIdx + 1).setValue(`ERROR: ${e.message}`);
        }
      }
    }
  });
}
