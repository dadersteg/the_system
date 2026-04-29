function createMissingGmailLabels() {
  const missingLabels = [
    '01 Private/04 Finances/01 Purchase/Instructions',
    '01 Private/04 Finances/01 Purchase/Passes & Tickets', // Replaced / to prevent unwanted nesting
    '01 Private/04 Finances/01 Purchase/Receipts',
    '01 Private/04 Finances/02 House/SW1V 4QE'
  ];

  const out = [];
  
  missingLabels.forEach(labelName => {
    try {
      const existing = GmailApp.getUserLabelByName(labelName);
      if (!existing) {
        GmailApp.createLabel(labelName);
        out.push("Created: " + labelName);
      } else {
        out.push("Already exists: " + labelName);
      }
    } catch (e) {
      out.push("Error creating " + labelName + ": " + e.message);
    }
  });

  out.push("Finished creating missing labels.");
  Logger.log(out.join("\n"));
  return out.join("\n");
}
