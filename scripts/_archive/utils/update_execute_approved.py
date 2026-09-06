import re

with open('src/Code_TheClerk_Retro.js', 'r') as f:
    content = f.read()

replacement = """
function executeApprovedBatchItems() {
  const props = PropertiesService.getScriptProperties();
  const ssId = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const ss = SpreadsheetApp.openById(ssId);
  
  // Retro Logs
  const driveLogId = SYSTEM_CONFIG.SHEET_GIDS.DRIVE_RETRO_LOG;
  const emailLogId = SYSTEM_CONFIG.SHEET_GIDS.EMAIL_RETRO_LOG;
  let driveLog = driveLogId ? ss.getSheets().find(s => s.getSheetId().toString() === driveLogId) : null;
  let emailLog = emailLogId ? ss.getSheets().find(s => s.getSheetId().toString() === emailLogId) : null;

  // Find all QA Sheets
  const sheets = ss.getSheets().filter(s => s.getName().startsWith("Batch QA"));
  
  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const statusIdx = headers.indexOf("Status");
    const idIdx = headers.indexOf("ID");
    const typeIdx = headers.indexOf("Type");
    const nameIdx = headers.indexOf("Original Name/Subject");
    const propNameIdx = headers.indexOf("Proposed Name");
    const propPathIdx = headers.indexOf("Proposed Path/Labels");
    const summaryIdx = headers.indexOf("Summary");

    let driveLogsToWrite = [];
    let emailLogsToWrite = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIdx] === "PENDING" || data[i][statusIdx] === "APPROVED") {
        const type = data[i][typeIdx];
        const itemId = data[i][idIdx];
        const origName = data[i][nameIdx];
        const newName = data[i][propNameIdx];
        const newPath = data[i][propPathIdx];
        const summary = data[i][summaryIdx];

        try {
          if (type === "DRIVE") {
            const file = DriveApp.getFileById(itemId);
            file.setName(newName);
            file.setDescription(`[CLERK PROCESSED]\\nTaxonomy: ${newPath}\\nSummary: ${summary}`);
            
            if (driveLog) {
              driveLogsToWrite.push([file.getUrl(), origName, file.getDescription(), newName, "N/A", newPath, summary, "RETRO PROCESSED", "Batch Approved", 0, "SUCCESS", "N/A", "N/A", "N/A", "None", "", "", ""]);
            }
          } else if (type === "EMAIL") {
            const thread = GmailApp.getThreadById(itemId);
            const labels = newPath.split(",").map(l => l.trim());
            labels.forEach(labelName => {
              let label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
              thread.addLabel(label);
            });
            let processedLabel = GmailApp.getUserLabelByName("Label_Reviewed") || GmailApp.createLabel("Label_Reviewed");
            thread.addLabel(processedLabel);
            
            if (emailLog) {
              emailLogsToWrite.push([new Date(), thread.getPermalink(), "N/A", origName, "RETRO PROCESSED", newPath, summary, "N/A", "Batch Approved", "SUCCESS"]);
            }
          }

          sheet.getRange(i + 1, statusIdx + 1).setValue("DONE");

        } catch (e) {
          console.error(`Failed to execute item ${itemId}: ${e.message}`);
          sheet.getRange(i + 1, statusIdx + 1).setValue(`ERROR: ${e.message}`);
        }
      }
    }
    
    // Batch write logs
    if (driveLogsToWrite.length > 0 && driveLog) {
      if (driveLog.getLastRow() === 0) {
        driveLog.appendRow(["URL", "Original Name", "Description", "Final Name", "Path Code", "Context ID", "Summary", "Metadata Description", "Reasoning", "Tokens", "Status", "Source Folder Path", "Target Folder ID", "Target Folder Path", "Shortcuts Generated", "Revised Path (Override)", "Revised Name (Override)", "Override Status"]);
      }
      driveLog.getRange(driveLog.getLastRow() + 1, 1, driveLogsToWrite.length, driveLogsToWrite[0].length).setValues(driveLogsToWrite);
    }
    if (emailLogsToWrite.length > 0 && emailLog) {
      if (emailLog.getLastRow() === 0) {
        emailLog.appendRow(["Timestamp", "Thread Link", "Sender", "Subject", "Assigned Action", "Labels Applied", "Summary", "Reasoning", "Tokens", "Status"]);
      }
      emailLog.getRange(emailLog.getLastRow() + 1, 1, emailLogsToWrite.length, emailLogsToWrite[0].length).setValues(emailLogsToWrite);
    }
  });
}
"""

# Replace the existing executeApprovedBatchItems function
content = re.sub(r'function executeApprovedBatchItems\(\) \{.*?(?=\/\*\*|\Z)', replacement, content, flags=re.DOTALL)

with open('src/Code_TheClerk_Retro.js', 'w') as f:
    f.write(content)
print("Updated Code_TheClerk_Retro.js")
