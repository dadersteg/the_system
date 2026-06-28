/**
 * @file src/Code_CatOnePager.js
 * @description Retrieves and logs the content of the current execution plan one-pager.
 *
 * @version 1.0.1
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Replaced getBlob().getDataAsString() with getSafeDocText() for better error handling and MIME-type safety.
 * - 1.0.0: Added JSDoc header and try/catch block for error handling.
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
