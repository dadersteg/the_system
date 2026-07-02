/**
 * @file src/Code_CSVUploader.js
 * @description Receives CLI inputs from Antigravity to upload CSV data to a specific Google Sheet tab.
 * @version 1.0.1
 * @last_modified 2024-06-20
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added standardized JSDoc headers, improved error logging, and added bounds checking.
 * - 1.0.0: Initial version.
 */

/**
 * Uploads CSV data to a specific Google Sheet tab.
 *
 * @param {string} spreadsheetId The ID of the target spreadsheet.
 * @param {string} sheetName The name of the tab to upload data into.
 * @param {string} csvContent The raw CSV data to parse and upload.
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
    
    if (!csvData[0] || csvData[0].length === 0) {
      throw new Error("Parsed CSV data has empty rows or columns.");
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      console.log(`Sheet "${sheetName}" did not exist, so it was created.`);
    } else {
      sheet.clear();
    }
    
    const maxCols = Math.max(...csvData.map(r => r.length));
    csvData.forEach(r => { while(r.length < maxCols) r.push(''); });
    sheet.getRange(1, 1, csvData.length, maxCols).setValues(csvData);
    console.log(`Success: CSV uploaded to spreadsheet ID "${spreadsheetId}", tab "${sheetName}". Total rows: ${csvData.length}`);
  } catch (e) {
    console.error(`Failed to upload CSV: ${e.message}`);
  }
}
