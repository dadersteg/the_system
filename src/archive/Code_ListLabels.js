function getGmailLabelsForCli() {
  try {
    const labels = GmailApp.getUserLabels();
    const names = labels.map(l => l.getName()).sort();
    return names.join('\n');
  } catch (e) {
    return "ERROR: " + e.message;
  }
}
