/**
 * Cellsior V5.9 - Revision-Ready Task Architect
 * Features: Interleaved "Revised" columns for bidirectional sync preparation.
 */
function extractTasksWithConversationDetails() {
  const CONFIG = {
    includeCompleted: false, 
    includeHidden: false,    
    charLimit: 2000,         
    spreadsheetId: "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4",
    targetGid: "1580572397"
  };

  const exportTs = Utilities.formatDate(new Date(), "GMT", "yyyyMMdd-HHmmss");
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CONFIG.targetGid);
  if (!sheet) return console.error("Error: Target GID not found.");
  
  let taskListsResponse;
  try {
    taskListsResponse = Tasks.Tasklists.list();
  } catch (e) {
    return console.error(`Critical API Failure (Tasklists.list): ${e.message}`);
  }

  const taskLists = taskListsResponse ? taskListsResponse.items : null;
  if (!taskLists) return console.warn("No Task Lists found.");

  // Schema: Original and Revised columns interleaved
  const headers = [
    "URN", 
    "Task List", "Task List (Revised)", 
    "Task Title", "Task (Revised)", 
    "Notes", "Notes (Revised)", 
    "Status", 
    "Date", "Deadline (Revised)", 
    "Email Labels",
    "First Msg (Sender)", "First Msg (Body Preview)", 
    "Last Msg (Sender)", "Last Msg (Body Preview)", "Email Link"
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  SpreadsheetApp.flush();

  const results = [];
  let rowCounter = 1;

  taskLists.forEach(taskList => {
    console.log(`Processing list: ${taskList.title}`);
    let pageToken = null;
    
    do {
      let taskResponse;
      try {
        taskResponse = Tasks.Tasks.list(taskList.id, {
          pageToken: pageToken,
          showCompleted: CONFIG.includeCompleted,
          showHidden: CONFIG.includeHidden,
          maxResults: 100
        });
      } catch (e) {
        console.error(`API Error [Tasks] on ${taskList.title}: ${e.message}`);
        break; 
      }

      if (taskResponse && taskResponse.items) {
        taskResponse.items.forEach(task => {
          let emailInfo = { labels: "", firstSender: "", firstBody: "", lastSender: "", lastBody: "", link: "" };

          if (task.links) {
            const emailLinkObj = task.links.find(l => l.type === "email");
            if (emailLinkObj) {
              emailInfo.link = emailLinkObj.link;
              try {
                const idMatch = emailInfo.link.match(/([a-zA-Z0-9]{10,})$/);
                if (idMatch) {
                  const gmailId = idMatch[1];
                  let thread = null;
                  try {
                    thread = GmailApp.getThreadById(gmailId);
                  } catch (e) {
                    try {
                      const msg = GmailApp.getMessageById(gmailId);
                      if (msg) thread = msg.getThread();
                    } catch (e2) {
                      const search = GmailApp.search("id:" + gmailId, 0, 1);
                      if (search.length > 0) thread = search[0];
                    }
                  }

                  if (thread) {
                    const messages = thread.getMessages();
                    emailInfo.labels = thread.getLabels().map(l => l.getName()).join(", ");
                    const getFullPreview = (msg) => {
                      const body = (msg.getPlainBody() || msg.getSnippet() || "").replace(/\s+/g, " ").trim();
                      return body.length <= (CONFIG.charLimit * 2) ? body : 
                             body.substring(0, CONFIG.charLimit) + " ... [TRUNCATED] ... " + body.slice(-CONFIG.charLimit);
                    };
                    const firstMsg = messages[0];
                    emailInfo.firstSender = firstMsg.getFrom();
                    emailInfo.firstBody = getFullPreview(firstMsg);
                    if (messages.length > 1) {
                      const lastMsg = messages[messages.length - 1];
                      emailInfo.lastSender = lastMsg.getFrom();
                      emailInfo.lastBody = getFullPreview(lastMsg);
                    } else {
                      emailInfo.lastSender = "---";
                      emailInfo.lastBody = "(Single message thread)";
                    }
                  }
                }
              } catch (e) {
                emailInfo.firstSender = "Email Fetch Error: " + e.message;
              }
            }
          }

          const urn = `urn:task:${exportTs}-${rowCounter.toString().padStart(4, '0')}`;
          const formattedDate = task.due ? Utilities.formatDate(new Date(task.due), "GMT", "yyyy-MM-dd") : "";

          // Data mapping following the interleaved header order
          results.push([
            urn, 
            taskList.title, "",               // Task List + Revised Placeholder
            task.title || "No Title", "",    // Task Title + Revised Placeholder
            task.notes || "", "",             // Notes + Revised Placeholder
            task.status,
            formattedDate, "",                // Date + Revised Placeholder
            emailInfo.labels, 
            emailInfo.firstSender, emailInfo.firstBody,
            emailInfo.lastSender, emailInfo.lastBody, 
            emailInfo.link
          ]);
          
          rowCounter++;
        });
      }
      pageToken = taskResponse ? taskResponse.nextPageToken : null;
    } while (pageToken);
  });

  if (results.length > 0) {
    const existingLastRow = Math.max(sheet.getLastRow(), 2);
    // Clear only columns A through P (1 to 16)
    sheet.getRange(2, 1, existingLastRow, headers.length).clearContent();
    sheet.getRange(2, 1, results.length, headers.length).setValues(results);
    console.log(`Exported ${results.length} rows. Ready for revision.`);
  }
}