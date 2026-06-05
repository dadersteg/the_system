/**
 * @file src/Code_EmailLogExporter.js
 * @description Exports the last 90 days of the Email 05 Log to a JSONL file in the workspace folder.
 * Designed as a lightweight, daily export for MacGyver agent consumption — providing
 * quick-lookup context on recent email activity without requiring live spreadsheet access.
 *
 * @version 1.0.0
 * @last_modified 2026-05-05
 * @modified_by Cellsior (via Antigravity)
 *
 * @changelog
 * - 1.0.0: Initial creation. Exports curated columns from Email 05 Log as JSONL to Drive.
 */

// =============================================================================
// EMAIL LOG EXPORTER — DAILY JSONL EXPORT FOR MACGYVER
// =============================================================================

/**
 * Exports the last 90 days of email log entries from the "Email 05 Log" tab
 * to a JSONL file in the workspace docs folder.
 *
 * Curated fields per line:
 *   - date: Received Last Message timestamp
 *   - subject: Email subject line
 *   - sender: Sender address
 *   - labels: Final label set applied
 *   - summary: AI-generated summary
 *   - actions: AI-extracted action items
 *   - link: Gmail thread URL
 *   - status: Inbox status (INBOX / ARCHIVED / TEMP_DELETE)
 *
 * @returns {void}
 */
function exportEmailLogJSONL() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("exportEmailLogJSONL failed: SYSTEM_CONFIG or SYSTEM_CONFIG.ROOTS is undefined");
    return;
  }

  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const EXPORT_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const EMAIL_LOG_GID = SYSTEM_CONFIG.SHEET_GIDS.EMAIL_LOG;

  if (!SPREADSHEET_ID || !EXPORT_FOLDER_ID || !EMAIL_LOG_GID) {
    console.error("exportEmailLogJSONL failed: Missing required config (MASTER_SHEET_ID, WORKSPACE_FOLDER_ID, or EMAIL_LOG GID)");
    return;
  }

  // --- 1. OPEN THE EMAIL LOG TAB ---
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === EMAIL_LOG_GID);

  if (!sheet) {
    console.error(`exportEmailLogJSONL failed: Email Log tab with GID ${EMAIL_LOG_GID} not found.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.log("exportEmailLogJSONL: No data rows found in Email Log.");
    return;
  }

  // --- 2. RESOLVE HEADER ROW ---
  // The sheet may have a frozen title row above the actual headers
  let headerRowIdx = 0;
  if (data[0].findIndex(h => h && h.toString().trim().toLowerCase() === "link") === -1 && data.length > 1) {
    headerRowIdx = 1;
  }
  const headers = data[headerRowIdx].map(h => h.toString().trim().toLowerCase());

  // --- 3. MAP COLUMN INDICES ---
  const colMap = {
    date:    headers.findIndex(h => h.includes("last message")),
    subject: headers.findIndex(h => h === "subject"),
    sender:  headers.findIndex(h => h === "sender"),
    labels:  headers.findIndex(h => h === "final label set"),
    summary: headers.findIndex(h => h === "ai summary"),
    actions: headers.findIndex(h => h === "ai action items"),
    link:    headers.findIndex(h => h === "link"),
    status:  headers.findIndex(h => h === "inbox status")
  };

  // Validate critical columns exist
  const missing = Object.entries(colMap).filter(([_, idx]) => idx === -1).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`exportEmailLogJSONL failed: Missing columns: ${missing.join(", ")}. Available headers: ${headers.join(", ")}`);
    return;
  }

  // --- 4. FILTER TO LAST 90 DAYS ---
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const lines = [];

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const rawDate = row[colMap.date];

    // Parse date — could be Date object or string
    let rowDate;
    if (rawDate instanceof Date) {
      rowDate = rawDate;
    } else if (rawDate) {
      rowDate = new Date(rawDate.toString());
    } else {
      continue; // Skip rows with no date
    }

    if (isNaN(rowDate.getTime()) || rowDate < cutoffDate) {
      continue;
    }

    const entry = {
      date:    Utilities.formatDate(rowDate, "GMT", "yyyy-MM-dd HH:mm"),
      subject: (row[colMap.subject] || "").toString(),
      sender:  (row[colMap.sender] || "").toString(),
      labels:  (row[colMap.labels] || "").toString(),
      summary: (row[colMap.summary] || "").toString(),
      actions: (row[colMap.actions] || "").toString(),
      link:    (row[colMap.link] || "").toString(),
      status:  (row[colMap.status] || "").toString()
    };

    lines.push(JSON.stringify(entry));
  }

  if (lines.length === 0) {
    console.log("exportEmailLogJSONL: No email log entries found within the last 90 days.");
    return;
  }

  // --- 5. WRITE JSONL TO DRIVE ---
  const fileName = "Email_Log_90d.jsonl";
  const content = lines.join("\n");
  const blob = Utilities.newBlob(content, "text/plain", fileName);

  try {
    const q = "name = '" + fileName + "' and '" + EXPORT_FOLDER_ID + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({ q: q, fields: "files(id)" }).files;

    if (existingFiles && existingFiles.length > 0) {
      Drive.Files.update({}, existingFiles[0].id, blob);
      console.log(`exportEmailLogJSONL: Updated existing '${fileName}' (${lines.length} entries).`);
    } else {
      Drive.Files.create(
        { name: fileName, mimeType: "text/plain", parents: [EXPORT_FOLDER_ID] },
        blob
      );
      console.log(`exportEmailLogJSONL: Created '${fileName}' (${lines.length} entries).`);
    }
  } catch (e) {
    console.error(`exportEmailLogJSONL failed to write to Drive: ${e.message}`);
  }
}
