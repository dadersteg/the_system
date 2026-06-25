/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2026-06-25
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added comprehensive JSDoc function description for catOnePager.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the Drive ID of the current execution plan one-pager, fetches the
 * file from Google Drive as a blob, extracts its contents as a string,
 * and logs it to the console.
 *
 * @returns {void}
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      console.log(DriveApp.getFileById(fileId).getBlob().getDataAsString());
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
