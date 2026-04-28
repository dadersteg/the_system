function runDriveCleanup() {
  const renames = {
    "01 02 01 Exercise": "01 02 01 Physical Health",
    "01 03 00 Principles, Goals, Methods and Habits": "01 03 00 Goals, Habits & Routines",
    "01 04 00 Bank Statements": "Banking",
    "01 04 00 Crypto": "Crypto",
    "01 04 00 Insurance": "Insurance",
    "01 04 00 Investing": "Investing",
    "01 04 00 Payslips": "Payslips",
    "01 04 00 Pension": "Pension",
    "01 04 00 Revolut Equity": "Revolut Equity",
    "01 04 00 Tax": "Tax",
    "01 04 01 Purchase": "01 Purchase",
    "01 04 01 Instructions": "Instructions",
    "01 04 01 Passes/Tickets": "Passes & Tickets",
    "01 04 01 Receipts": "Receipts"
  };

  const out = [];

  // 1. Perform Renames
  for (const [oldName, newName] of Object.entries(renames)) {
    try {
      const folders = DriveApp.getFoldersByName(oldName);
      if (folders.hasNext()) {
        const folder = folders.next();
        folder.setName(newName);
        out.push(`Renamed: '${oldName}' -> '${newName}'`);
      }
    } catch (e) {
      out.push(`Error renaming '${oldName}': ${e.message}`);
    }
  }

  // 2. Move 'Signature' to '01 01 02 Contracts'
  try {
    const signatureIter = DriveApp.getFoldersByName("Signature");
    const contractsIter = DriveApp.getFoldersByName("01 01 02 Contracts");
    if (signatureIter.hasNext() && contractsIter.hasNext()) {
      const signatureFolder = signatureIter.next();
      const contractsFolder = contractsIter.next();
      signatureFolder.moveTo(contractsFolder);
      out.push("Moved: 'Signature' -> '01 01 02 Contracts'");
    }
  } catch (e) {
    out.push(`Error moving Signature: ${e.message}`);
  }

  // 3. Merge '01 04 00 Revolut Banking' into 'Banking'
  try {
    const revolutIter = DriveApp.getFoldersByName("01 04 00 Revolut Banking");
    const bankingIter = DriveApp.getFoldersByName("Banking");
    if (revolutIter.hasNext() && bankingIter.hasNext()) {
      const revolutFolder = revolutIter.next();
      const bankingFolder = bankingIter.next();
      
      // Move all files
      const files = revolutFolder.getFiles();
      let count = 0;
      while (files.hasNext()) {
        files.next().moveTo(bankingFolder);
        count++;
      }
      
      // Move all folders (if any)
      const subFolders = revolutFolder.getFolders();
      while (subFolders.hasNext()) {
        subFolders.next().moveTo(bankingFolder);
      }
      
      revolutFolder.setTrashed(true);
      out.push(`Merged: '01 04 00 Revolut Banking' into 'Banking' (${count} files moved) and trashed the old folder.`);
    }
  } catch (e) {
    out.push(`Error merging Revolut Banking: ${e.message}`);
  }

  out.push("Drive Cleanup Complete.");
  Logger.log(out.join("\n"));
  return out.join("\n");
}
