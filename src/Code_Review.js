/**
 * @file src/Code_Review.js
 * @description Handles fetching emails for review and applying review decisions.
 *
 * @version 1.0.0
 * @last_modified 2024-06-16
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Added standardized JSDoc headers, aggressive type checking, and error bounds.
 */

/**
 * Lists the next email starting from a specific date that needs review.
 *
 * @returns {Object|null} An object containing the thread ID, subject, from, timestamp, body, and labels, or null if no threads are found or on error.
 */
function getNextEmailForReview() {
  try {
    const startTime = new Date("2026-05-08T20:58:00Z");
    const processedFlag = "99 Label_Reviewed";
    const query = `after:2026/05/07 -label:"${processedFlag}"`;
    const threads = GmailApp.search(query, 0, 50);
    
    if (!threads || !Array.isArray(threads)) {
        return null;
    }

    const results = [];
    threads.forEach(thread => {
      const messages = thread.getMessages();
      if (!messages || messages.length === 0) return;

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
  } catch (error) {
    console.error(`[getNextEmailForReview] Error: ${error.message}`);
    return null;
  }
}

/**
 * Applies labels and rules to a thread.
 *
 * @param {string} threadId - The ID of the Gmail thread.
 * @param {string[]} labelsToAdd - An array of label names to add to the thread.
 * @param {string[]} labelsToRemove - An array of label names to remove from the thread.
 * @param {boolean} archive - Whether to archive the thread.
 * @param {boolean} markRead - Whether to mark the thread as read.
 * @returns {string} Returns "Success" or an error message if the operation fails.
 */
function applyReviewDecision(threadId, labelsToAdd, labelsToRemove, archive, markRead) {
  try {
    if (!threadId || typeof threadId !== 'string') {
      throw new Error("Invalid threadId provided.");
    }

    const thread = GmailApp.getThreadById(threadId);
    if (!thread) {
       throw new Error(`Thread with ID ${threadId} not found.`);
    }

    if (Array.isArray(labelsToAdd)) {
        labelsToAdd.forEach(l => {
          if(typeof l === 'string') {
            let label = GmailApp.getUserLabelByName(l) || GmailApp.createLabel(l);
            thread.addLabel(label);
          }
        });
    }

    if (Array.isArray(labelsToRemove)) {
        labelsToRemove.forEach(l => {
          if(typeof l === 'string') {
            let label = GmailApp.getUserLabelByName(l);
            if (label) thread.removeLabel(label);
          }
        });
    }

    if (archive) thread.moveToArchive();
    if (markRead) thread.markRead();

    // Always mark as reviewed
    let reviewedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed") || GmailApp.createLabel("99 Label_Reviewed");
    thread.addLabel(reviewedLabel);

    return "Success";
  } catch (error) {
    console.error(`[applyReviewDecision] Error processing thread ${threadId}: ${error.message}`);
    return `Error: ${error.message}`;
  }
}
