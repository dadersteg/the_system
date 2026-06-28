/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added MIME-type validation to safely handle Google Docs and prevent read errors.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();

      let content = "";
      if (mimeType === MimeType.GOOGLE_DOCS || mimeType === "application/vnd.google-apps.document") {
        content = DocumentApp.openById(fileId).getBody().getText();
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
