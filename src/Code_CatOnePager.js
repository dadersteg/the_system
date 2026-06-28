/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.0
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the one-pager execution plan document ID and safely extracts its text content,
 * logging the result to the console for CLI agent ingestion.
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
