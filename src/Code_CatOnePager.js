/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added MIME type validation to prevent errors on unsupported formats.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      const mimeType = file.getMimeType();

      // Allow only plain text formats to avoid blob string conversion errors
      if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV || mimeType === MimeType.HTML) {
        console.log(file.getBlob().getDataAsString());
      } else {
        console.warn(`Unsupported MIME type for direct string read: ${mimeType}`);
      }
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
