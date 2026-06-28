/**
 * @file src/Code_AgentTools_DriveExport.js
 * @description Provides functionality to export text contents of a Google Drive folder.
 *
 * @version 1.0.1
 * @last_modified 2024-06-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added strict MIME-type validation for getBlob().getDataAsString() and removed legacy PDF comments. Upgraded JSDoc.
 * - 1.0.0: Initial creation with JSDoc headers, error bounds, and input validation.
 */

/**
 * Exports the content of files within a specific Google Drive folder.
 * Iterates through all files, parsing Google Docs, skipping PDFs, and reading
 * supported text formats (plain text and CSV) while catching unsupported types.
 *
 * @param {string} folderId - The string ID of the Google Drive folder to process.
 * @returns {string} A JSON stringified map of file names to their extracted string content, or an error JSON string if a failure occurs.
 */
function exportFolder(folderId) {
  if (!folderId || typeof folderId !== 'string') {
    return JSON.stringify({ error: "Invalid folderId: Must be a non-empty string." });
  }

  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const result = {};
    
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      let content = "UNSUPPORTED_MIME";

      try {
        if (mimeType === MimeType.GOOGLE_DOCS) {
          const doc = DocumentApp.openById(file.getId());
          content = doc.getBody().getText();
        } else if (mimeType === MimeType.PDF) {
          content = "PDF_SKIPPED";
        } else if (mimeType === MimeType.PLAIN_TEXT || mimeType === "text/csv") {
          content = file.getBlob().getDataAsString();
        } else {
          content = `UNSUPPORTED_MIME: ${mimeType}`;
        }
      } catch(e) {
        content = "ERROR: " + e.message;
      }

      result[file.getName()] = content;
    }
    
    return JSON.stringify(result);
  } catch (e) {
    console.error(`[exportFolder] Failed to process folder ${folderId}: ${e.message}`);
    return JSON.stringify({ error: `Failed to access folder or process files: ${e.message}` });
  }
}
