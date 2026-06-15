function readDocBypass(fileId) {
  try {
    // Try as Document first
    try {
      const doc = DocumentApp.openById(fileId);
      const text = doc.getBody().getText();
      return ContentService.createTextOutput(JSON.stringify({
        type: "document",
        name: doc.getName(),
        text: text
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (e1) {
      // Try as Spreadsheet
      try {
        const ss = SpreadsheetApp.openById(fileId);
        const sheets = ss.getSheets();
        const data = {};
        sheets.forEach(function(sheet) {
          data[sheet.getName()] = sheet.getDataRange().getValues();
        });
        return ContentService.createTextOutput(JSON.stringify({
          type: "spreadsheet",
          name: ss.getName(),
          data: data
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (e2) {
        throw new Error("Could not open file as Document or Spreadsheet. Doc Error: " + e1.message + " | SS Error: " + e2.message);
      }
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
