/**
 * @file src/Code_MigrateGmailLabels.js
 * @description Provides logic to migrate and consolidate specific private Gmail labels.
 *
 * @version 1.0.0
 * @last_modified 2024-07-28
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added JSDoc docstrings and standardized variable naming (var to const/let, camelCase).
 */

/**
 * Migrates specific private Gmail labels by renaming and merging them.
 * Renames "CMA" to "Carry Martens Adersteg" and merges "2019" tax label into "19/20 UK Taxes".
 *
 * @returns {void}
 */
function migratePrivateGmailLabels() {
  // 1. Rename CMA to Carry Martens Adersteg
  const oldCmaName = "01 Private/05 Other/02 Relationships/CMA";
  const newCmaName = "01 Private/05 Other/02 Relationships/Carry Martens Adersteg";
  
  const cmaLabel = GmailApp.getUserLabelByName(oldCmaName);
  if (cmaLabel) {
    const newLabel = GmailApp.getUserLabelByName(newCmaName) || GmailApp.createLabel(newCmaName);
    const threads = cmaLabel.getThreads();
    for (let i = 0; i < threads.length; i++) {
      threads[i].addLabel(newLabel);
      threads[i].removeLabel(cmaLabel);
    }
    cmaLabel.deleteLabel();
    console.log("Successfully migrated CMA label to Carry Martens Adersteg.");
  } else {
    console.log("CMA label not found.");
  }
  
  // 2. Merge 2019 into 19/20 UK Taxes
  const oldTaxName = "01 Private/04 Finances/Tax/2019";
  const newTaxName = "01 Private/04 Finances/Tax/19/20 UK Taxes";
  
  const oldTaxLabel = GmailApp.getUserLabelByName(oldTaxName);
  let newTaxLabel = GmailApp.getUserLabelByName(newTaxName);
  
  if (oldTaxLabel) {
    if (!newTaxLabel) newTaxLabel = GmailApp.createLabel(newTaxName);
    
    const threads = oldTaxLabel.getThreads();
    for (let i = 0; i < threads.length; i++) {
      threads[i].addLabel(newTaxLabel);
      threads[i].removeLabel(oldTaxLabel);
    }
    oldTaxLabel.deleteLabel();
    console.log("Successfully migrated 2019 tax label to 19/20 UK Taxes.");
  } else {
    console.log("2019 Tax label not found.");
  }
}
