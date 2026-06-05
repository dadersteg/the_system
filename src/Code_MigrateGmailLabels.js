function migratePrivateGmailLabels() {
  // 1. Rename CMA to Carry Martens Adersteg
  var oldCmaName = "01 Private/05 Other/02 Relationships/CMA";
  var newCmaName = "01 Private/05 Other/02 Relationships/Carry Martens Adersteg";
  
  var cmaLabel = GmailApp.getUserLabelByName(oldCmaName);
  if (cmaLabel) {
    var newLabel = GmailApp.getUserLabelByName(newCmaName) || GmailApp.createLabel(newCmaName);
    var threads = cmaLabel.getThreads();
    for (var i = 0; i < threads.length; i++) {
      threads[i].addLabel(newLabel);
      threads[i].removeLabel(cmaLabel);
    }
    cmaLabel.deleteLabel();
    Logger.log("Successfully migrated CMA label to Carry Martens Adersteg.");
  } else {
    Logger.log("CMA label not found.");
  }
  
  // 2. Merge 2019 into 19/20 UK Taxes
  var oldTaxName = "01 Private/04 Finances/Tax/2019";
  var newTaxName = "01 Private/04 Finances/Tax/19/20 UK Taxes";
  
  var oldTaxLabel = GmailApp.getUserLabelByName(oldTaxName);
  var newTaxLabel = GmailApp.getUserLabelByName(newTaxName);
  
  if (oldTaxLabel) {
    if (!newTaxLabel) newTaxLabel = GmailApp.createLabel(newTaxName);
    
    var threads = oldTaxLabel.getThreads();
    for (var i = 0; i < threads.length; i++) {
      threads[i].addLabel(newTaxLabel);
      threads[i].removeLabel(oldTaxLabel);
    }
    oldTaxLabel.deleteLabel();
    Logger.log("Successfully migrated 2019 tax label to 19/20 UK Taxes.");
  } else {
    Logger.log("2019 Tax label not found.");
  }
}
