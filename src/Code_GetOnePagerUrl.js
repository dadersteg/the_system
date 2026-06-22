/**
 * @file src/Code_GetOnePagerUrl.js
 * @description Retrieves and logs the Google Drive URL for the current execution plan one-pager.
 *
 * @version 1.0.0
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added JSDoc headers, error bounds, and type checking for improved stability.
 */

/**
 * Retrieves the URL of the execution plan and logs it to the console.
 *
 * @returns {void}
 */
function getOnePagerUrl() {
  try {
    if (typeof getExecutionPlanId !== 'function') {
      console.warn("[getOnePagerUrl] getExecutionPlanId function is not defined.");
      return;
    }

    const fileId = getExecutionPlanId();
    if (fileId) {
      console.log(DriveApp.getFileById(fileId).getUrl());
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`[getOnePagerUrl] encountered an error: ${e.message}`);
  }
}
