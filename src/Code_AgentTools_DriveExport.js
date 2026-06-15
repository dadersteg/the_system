/**
 * @file src/Code_AgentTools_DriveExport.js
 * @description Provides functionality to export text contents of a Google Drive folder.
 *
 * @version 1.0.0
 * @last_modified 2024-06-15
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial creation with JSDoc headers, error bounds, and input validation.
 */

/**
 * Exports the content of files within a specific folder.
 *
 * @param {string} folderId The ID of the Drive folder to export.
 * @returns {string} JSON stringified object of file names and their string content, or error string.
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
          // Can't easily extract text from PDF in apps script without OCR
          content = "PDF_SKIPPED";
        } else {
          content = file.getBlob().getDataAsString();
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
