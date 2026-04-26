/**
 * Optimized Task & Gmail Thread Extractor
 * Architect: Cellsior 5.0
 */
function extractTasksWithConversationDetails() {
  const spreadsheetId = "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4";
  const targetGid = "1580572397"; 
  const charLimit = 500; 
  
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  if (!sheet) return Browser.msgBox("Error: Tab not found.");
  
  const taskLists = Tasks.Tasklists.list().items;
  if (!taskLists) return;

  const results = [];
  // Header Row
  results.push([
    "Task List", "Task Title", "Status", "Deadline", "Labels",
    "First Msg (Sender)", "First Msg (Body Preview)", 
    "Last Msg (Sender)", "Last Msg (Body Preview)", "Email Link"
  ]);

  taskLists.forEach(taskList => {
    const tasks = Tasks.Tasks.list(taskList.id).items;
    if (!tasks) return;

    tasks.forEach(task => {
      let emailInfo = { labels: "", firstSender: "", firstBody: "", lastSender: "", lastBody: "", link: "" };

      if (task.links) {
        const emailLinkObj = task.links.find(l => l.type === "email");
        if (emailLinkObj) {
          emailInfo.link = emailLinkObj.link;
          try {
            const idMatch = emailInfo.link.match(/\/[a-z0-9]+\/([a-f0-9]+)/i);
            if (idMatch && idMatch[1]) {
              const searchResults = GmailApp.search("id:" + idMatch[1]);
              if (searchResults.length > 0) {
                const thread = searchResults[0];
                const messages = thread.getMessages();
                emailInfo.labels = thread.getLabels().map(l => l.getName()).join(", ");
                
                const firstMsg = messages[0];
                emailInfo.firstSender = firstMsg.getFrom();
                emailInfo.firstBody = firstMsg.getPlainBody().substring(0, charLimit).replace(/\s+/g, " ").trim();
                
                const lastMsg = messages[messages.length - 1];
                emailInfo.lastSender = messages.length > 1 ? lastMsg.getFrom() : "---";
                emailInfo.lastBody = messages.length > 1 ? 
                  lastMsg.getPlainBody().substring(0, charLimit).replace(/\s+/g, " ").trim() : 
                  "(Single message thread)";
              } else {
                emailInfo.firstSender = "Thread not found or deleted.";
              }
            }
          } catch (e) {
            emailInfo.firstSender = "Gmail API Error: " + e.message;
          }
        }
      }

      results.push([
        taskList.title,
        task.title || "No Title",
        task.status,
        task.due ? new Date(task.due).toLocaleDateString() : "",
        emailInfo.labels,
        emailInfo.firstSender,
        emailInfo.firstBody,
        emailInfo.lastSender,
        emailInfo.lastBody,
        emailInfo.link
      ]);
    });
  });

  // Atomic Write Operation
  sheet.clearContents();
  if (results.length > 0) {
    sheet.getRange(1, 1, results.length, results[0].length).setValues(results);
    sheet.getRange(1, 1, 1, results[0].length).setFontWeight("bold");
  }
  
  Browser.msgBox("Success: " + (results.length - 1) + " tasks exported.");
}