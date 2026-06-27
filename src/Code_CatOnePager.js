/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.1.0
 * @last_modified 2026-06-27
 * @modified_by Jules
 *
 * @changelog
 * - 1.1.0: Injected comprehensive JSDoc docstrings, standardized variable naming, and implemented strict MIME-type validation before reading blob strings.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the Drive File ID for the execution plan, validates its MIME type,
 * and logs the textual content to the console.
 *
 * @returns {void}
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (!fileId) {
      console.warn("Execution plan file ID not found.");
      return;
    }

    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();

    const allowedTextMimes = [
      MimeType.PLAIN_TEXT,
      MimeType.CSV,
      "application/json",
      MimeType.HTML
    ];

    if (allowedTextMimes.includes(mimeType) || mimeType.startsWith("text/")) {
      console.log(file.getBlob().getDataAsString());
    } else {
      console.error(`Cannot read file as string. Unsupported MIME type: ${mimeType}`);
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
