/**
 * @file src/Code_ReadDocsBypass.js
 * @description Extracts text content from Google Docs or Google Spreadsheets for the CLI or Agents.
 *
 * @version 1.0.0
 * @last_modified 2024-06-20
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial JSDoc implementation and variable standardisation.
 */

/**
 * Reads the content of a Google Document or Spreadsheet and returns it as a JSON payload.
 *
 * @param {string} fileId The Drive file ID of the document or spreadsheet to read.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response containing text/data or error.
 */
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
    } catch (docError) {
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
      } catch (spreadsheetError) {
        throw new Error("Could not open file as Document or Spreadsheet. Doc Error: " + docError.message + " | SS Error: " + spreadsheetError.message);
      }
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
