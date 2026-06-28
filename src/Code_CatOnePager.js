/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2024-08-01
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Refactored to use getSafeDocText for safer file reading and added JSDoc docstring to catOnePager.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
 */

/**
 * Retrieves the content of the current execution plan one-pager and logs it to the console.
 * Utilizes getSafeDocText to safely extract text and avoid MIME type errors.
 *
 * @returns {void}
 */
function catOnePager() {
  try {
    const fileId = getExecutionPlanId();
    if (fileId) {
      console.log(getSafeDocText(fileId));
    } else {
      console.warn("Execution plan file not found");
    }
  } catch (e) {
    console.error(`catOnePager encountered an error: ${e.message}`);
  }
}
