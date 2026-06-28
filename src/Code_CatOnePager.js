/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.1.0
 * @last_modified 2026-06-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.1.0: Added MIME-type validation before reading file contents to prevent blob conversion errors. Injected comprehensive JSDoc for catOnePager.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the Drive URL of the current execution plan file, validates its MIME type,
 * and logs the string contents. Supports Google Docs and basic text-based MIME types.
 *
 * @returns {void} Returns early if the file is missing or the MIME type is unsupported.
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (!fileId) {
      console.warn("catOnePager: Execution plan file ID is undefined or not found.");
      return;
    }

    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();

    if (mimeType === MimeType.GOOGLE_DOCS) {
      // Use DocumentApp for Google Docs to safely get text
      const doc = DocumentApp.openById(fileId);
      console.log(doc.getBody().getText());
    } else if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV || mimeType === "application/json") {
      // Use Blob conversion for text-like formats
      console.log(file.getBlob().getDataAsString());
    } else {
      console.warn(`catOnePager: Unsupported MIME type: ${mimeType}. Cannot safely extract string data.`);
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
