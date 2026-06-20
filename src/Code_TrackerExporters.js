/**
 * @file src/Code_TrackerExporters.js
 * @description Exports the Email and Drive tracking logs to JSONL and CSV formats for LLM digestion.
 * Exports are placed in the configured WORKSPACE_FOLDER_ID.
 */

function exportTrackers() {
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.ROOTS) {
    console.error("exportTrackers failed: SYSTEM_CONFIG missing.");
    return;
  }

  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  let EXPORT_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  
  // For Private environment, override folder to the exports folder
  const IS_PMT_ENV = (getEnvProp("ENV") === "WORK");
  if (!IS_PMT_ENV) {
    EXPORT_FOLDER_ID = "1ylbggzC_eIJAMu-_AwPj7YJL1Z_uuoOJ"; // Exports folder for Private
  } else {
    EXPORT_FOLDER_ID = "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"; // Exports folder for PMT
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Export Email Log
  const emailLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.EMAIL_LOG);
  if (emailLogSheet) {
    _exportLogData(emailLogSheet, "Email", EXPORT_FOLDER_ID);
  }

  // Export Drive Log
  const driveLogSheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEETS.DRIVE_LOG);
  if (driveLogSheet) {
    _exportLogData(driveLogSheet, "Drive", EXPORT_FOLDER_ID);
  }
}

function _exportLogData(sheet, typeName, folderId) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headerRowIdx = data[0].findIndex(h => h && (h.toString().toLowerCase().includes('link') || h.toString().toLowerCase().includes('original name'))) === -1 && data.length > 1 ? 1 : 0;
  const headers = data[headerRowIdx].map(h => h.toString().trim().toLowerCase());
  
  const colMap = typeName === "Email" ? {
    timestamp: headers.findIndex(h => h === "timestamp"),
    subject: headers.findIndex(h => h === "subject"),
    sender: headers.findIndex(h => h === "sender"),
    labels: headers.findIndex(h => h === "final label set"),
    summary: headers.findIndex(h => h === "ai summary"),
    actions: headers.findIndex(h => h === "ai action items"),
    link: headers.findIndex(h => h === "link"),
    status: headers.findIndex(h => h === "inbox status")
  } : {
    timestamp: headers.findIndex(h => h === "timestamp"),
    originalName: headers.findIndex(h => h === "original name"),
    finalName: headers.findIndex(h => h === "final name"),
    summary: headers.findIndex(h => h === "summary"),
    targetPath: headers.findIndex(h => h === "target folder path"),
    url: headers.findIndex(h => h === "url"),
    status: headers.findIndex(h => h === "status"),
    mappedTask: headers.findIndex(h => h === "mapped task")
  };

  const tsIndex = colMap.timestamp !== -1 ? colMap.timestamp : 0; // Default to first column if missing
  
  const allLinesJSONL = [];
  const allLinesCSV = [];
  const recentLinesJSONL = [];
  const recentLinesCSV = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);

  // Build CSV Headers
  const csvHeaders = Object.keys(colMap).map(k => `"${k}"`).join(",");
  allLinesCSV.push(csvHeaders);
  recentLinesCSV.push(csvHeaders);

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const rawDate = row[tsIndex];

    let rowDate = null;
    if (rawDate instanceof Date) rowDate = rawDate;
    else if (rawDate) rowDate = new Date(rawDate.toString());

    const entry = {};
    const csvValues = [];
    
    for (const [key, idx] of Object.entries(colMap)) {
      let val = idx !== -1 ? (row[idx] || "").toString() : "";
      if (key === "timestamp" && rowDate && !isNaN(rowDate)) {
        val = Utilities.formatDate(rowDate, "GMT", "yyyy-MM-dd HH:mm");
      }
      entry[key] = val;
      csvValues.push(`"${val.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
    }

    const jsonlStr = JSON.stringify(entry);
    const csvStr = csvValues.join(",");

    allLinesJSONL.push(jsonlStr);
    allLinesCSV.push(csvStr);

    if (rowDate && !isNaN(rowDate) && rowDate >= cutoffDate) {
      recentLinesJSONL.push(jsonlStr);
      recentLinesCSV.push(csvStr);
    }
  }

  _writeFileToDrive(`${typeName}_Tracker_All.jsonl`, allLinesJSONL.join("\n"), "text/plain", folderId);
  _writeFileToDrive(`${typeName}_Tracker_All.csv`, allLinesCSV.join("\n"), "text/csv", folderId);
  _writeFileToDrive(`${typeName}_Tracker_14d.jsonl`, recentLinesJSONL.join("\n"), "text/plain", folderId);
  _writeFileToDrive(`${typeName}_Tracker_14d.csv`, recentLinesCSV.join("\n"), "text/csv", folderId);
}

function _writeFileToDrive(fileName, content, mimeType, folderId) {
  try {
    const blob = Utilities.newBlob(content, mimeType, fileName);
    const q = "name = '" + fileName + "' and '" + folderId + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({ q: q, fields: "files(id)" }).files;

    if (existingFiles && existingFiles.length > 0) {
      Drive.Files.update({}, existingFiles[0].id, blob);
    } else {
      Drive.Files.create({ name: fileName, mimeType: mimeType, parents: [folderId] }, blob);
    }
    console.log(`_writeFileToDrive: Wrote ${fileName}`);
  } catch (e) {
    console.error(`_writeFileToDrive failed for ${fileName}: ${e.message}`);
  }
}
