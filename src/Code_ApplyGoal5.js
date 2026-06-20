/**
 * @file src/Code_ApplyGoal5.js
 * @description Updates the System Architecture Overview document to include the fifth strategic goal (Tech Cost Efficiency).
 *
 * @version 1.0.0
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial JSDoc implementation and standardized variable names.
 */

/**
 * Applies the Goal 5 updates to the specified document.
 *
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response indicating success or failure.
 */
function applyGoal5Update() {
  try {
    const docId = '1N44t8vrm6QsCEg1h0TKGHviUyFNhGOvxE9Tjvi_w6zA';
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    
    // 1. Replace text in the document
    body.replaceText("Four core strategic goals drive the Playmetech planning system to compound capital efficiently, manage risk dynamically, and preserve elite operational talent.", "Five core strategic goals drive the Playmetech planning system to compound capital efficiently, manage risk dynamically, preserve elite operational talent, and enforce lean, scalable tech architecture.");
    body.replaceText("The planning system comprises 4 core strategic goals:", "The planning system comprises 5 core strategic goals:");
    
    // 2. Append row to the first table
    const tables = body.getTables();
    if (tables.length > 0) {
      const mainTable = tables[0];
      const newRow = mainTable.appendTableRow();
      newRow.appendTableCell("5. Tech Cost Efficiency & OPEX Control");
      newRow.appendTableCell("Operational Efficiency");
      newRow.appendTableCell("Deploy and maintain scalable tech architecture and aggressively control operating expenses (OPEX) to ensure lean growth.");
    }
    
    // 3. Append Goal 5 section and constituents table
    body.appendParagraph("").setHeading(DocumentApp.ParagraphHeading.NORMAL);
    body.appendParagraph("Goal 5: Tech Cost Efficiency Constituents").setHeading(DocumentApp.ParagraphHeading.HEADING_3);
    
    const newTable = body.appendTable([
      ["Metric / Parameter", "Unit", "Target / Description"],
      ["Execution Latency", "ms", "The average time delay between signal generation and trade execution across automated models"],
      ["System Uptime", "%", "The availability of critical infrastructure including API feeds and cloud nodes"],
      ["OPEX vs. Budget", "£", "The tracking of fixed technological operating costs against predefined monthly budgets"]
    ]);
    
    // Format headers
    const headerRow = newTable.getRow(0);
    for (let i = 0; i < headerRow.getNumCells(); i++) {
      headerRow.getCell(i).setBackgroundColor("#f3f3f3");
      headerRow.getCell(i).getChild(0).asParagraph().setBold(true);
    }
    
    doc.saveAndClose();
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Successfully updated Goal 5 in document." })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
