/**
 * CSV Uploader
 * Receives CLI inputs from Antigravity to upload CSV data to a specific Google Sheet tab.
 */

function uploadCSVFromCLI(spreadsheetId, sheetName, csvContent) {
  try {
    if (!spreadsheetId || !sheetName || !csvContent) {
      throw new Error("Missing required parameters: spreadsheetId, sheetName, or csvContent.");
    }
    
    const csvData = Utilities.parseCsv(csvContent);
    if (!csvData || csvData.length === 0) {
      throw new Error("Parsed CSV data is empty.");
    }
    
    const ss = SpreadsheetApp.openById(spreadsheetId);
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      console.log(`Sheet "${sheetName}" did not exist, so it was created.`);
    } else {
      sheet.clear();
    }
    
    sheet.getRange(1, 1, csvData.length, csvData[0].length).setValues(csvData);
    console.log(`Success: CSV uploaded to spreadsheet ID "${spreadsheetId}", tab "${sheetName}". Total rows: ${csvData.length}`);
  } catch (e) {
    console.log(`Failed to upload CSV: ${e.message}`);
  }
}
