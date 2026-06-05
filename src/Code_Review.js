
/**
 * Lists the next email starting from a specific date that needs review.
 */
function getNextEmailForReview() {
  const startTime = new Date("2026-05-08T20:58:00Z");
  const processedFlag = "99 Label_Reviewed";
  const query = `after:2026/05/07 -label:"${processedFlag}"`;
  const threads = GmailApp.search(query, 0, 50);
  
  const results = [];
  threads.forEach(thread => {
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1];
    const timestamp = lastMessage.getDate();
    
    if (timestamp >= startTime) {
      results.push({
        id: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        from: lastMessage.getFrom(),
        timestamp: timestamp.toISOString(),
        body: lastMessage.getPlainBody().substring(0, 2000),
        labels: thread.getLabels().map(l => l.getName())
      });
    }
  });
  
  // Sort by timestamp ascending
  results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  if (results.length > 0) {
    return results[0];
  }
  return null;
}

/**
 * Applies labels and rules to a thread.
 */
function applyReviewDecision(threadId, labelsToAdd, labelsToRemove, archive, markRead) {
  const thread = GmailApp.getThreadById(threadId);
  
  labelsToAdd.forEach(l => {
    let label = GmailApp.getUserLabelByName(l) || GmailApp.createLabel(l);
    thread.addLabel(label);
  });
  
  labelsToRemove.forEach(l => {
    let label = GmailApp.getUserLabelByName(l);
    if (label) thread.removeLabel(label);
  });
  
  if (archive) thread.moveToArchive();
  if (markRead) thread.markRead();
  
  // Always mark as reviewed
  let reviewedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed") || GmailApp.createLabel("99 Label_Reviewed");
  thread.addLabel(reviewedLabel);
  
  return "Success";
}
