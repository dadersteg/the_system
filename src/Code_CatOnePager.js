/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2026-06-25
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added comprehensive JSDoc docstring to the catOnePager function.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the ID of the execution plan one-pager, fetches its raw content
 * from Google Drive, and logs it to the console.
 *
 * @returns {void}
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      const text = getSafeDocText(fileId);
      if (!text) {
        throw new Error(`Failed to retrieve valid text from file ID: ${fileId}`);
      }
      console.log(text);
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
