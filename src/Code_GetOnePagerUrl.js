/**
 * @file src/Code_GetOnePagerUrl.js
 * @description Retrieves and logs the URL of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2026-06-26
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added try/catch block for error handling and updated log level.
 * - 1.0.0: Added JSDoc header and function documentation.
 */

/**
 * Retrieves the Drive URL of the current execution plan file and logs it to the console.
 *
 * @returns {void}
 */
function getOnePagerUrl() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      console.log(DriveApp.getFileById(fileId).getUrl());
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`getOnePagerUrl encountered an error: ${e.message}`);
  }
}
