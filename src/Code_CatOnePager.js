/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the Execution Plan One-Pager from Google Drive.
 * @version 1.0.1
 * @last_modified 2024-06-20
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added JSDoc header and try/catch block for error handling.
 * - 1.0.0: Initial version.
 */

/**
 * Reads and logs the text content of the execution plan file.
 * Handles cases where the file ID is missing or the file is inaccessible.
 *
 * @returns {void}
 */
function catOnePager() {
  const fileId = getExecutionPlanId();
  if (fileId) {
    try {
      const content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
      console.log(content);
    } catch (error) {
      console.error(`Failed to read Execution Plan One-Pager (ID: ${fileId}): ${error.message}`);
    }
  } else {
    console.log("Execution plan file not found in configuration.");
  }
}
