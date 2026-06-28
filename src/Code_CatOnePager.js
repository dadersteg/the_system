/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2026-06-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added function JSDoc and MIME-type validation.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves and logs the text content of the current execution plan one-pager.
 * Handles both Google Docs and generic text files.
 *
 * @returns {void}
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();

      let content = "UNSUPPORTED_MIME";
      if (mimeType === MimeType.GOOGLE_DOCS) {
        const doc = DocumentApp.openById(fileId);
        content = doc.getBody().getText();
      } else {
        content = file.getBlob().getDataAsString();
      }

      console.log(content);
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
