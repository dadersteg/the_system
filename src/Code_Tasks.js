/**
 * Cellsior V6.1 - Revision-Ready Task Architect with Gemini AI Batching & Bi-Directional Sync
 * Features: 
 * - Interleaved "Revised" columns for bidirectional sync
 * - Hidden Task ID and Task List ID columns for exact mapping
 * - Gemini 2.5 Flash batched API integration for AI Context Summary and Categorization
 * - Bi-directional Sync via Tasks API
 * - Improved prompt to eliminate redundant filler ("The task is...")
 * - Context-aware categorization using the workspace LOS taxonomy
 */

const CONFIG = {
  includeCompleted: false, 
  includeHidden: false,    
  charLimit: 2000,         
  spreadsheetId: "1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4",
  targetGid: "1580572397",
  geminiBatchSize: 40      // Max tasks per Gemini prompt to avoid timeouts
};

/**
 * Main function to extract tasks from Google Tasks, integrate Gemini AI analysis, 
 * and export the data to the target Spreadsheet with interleaved revision columns.
 */
function extractTasksWithConversationDetails() {
  const exportTs = Utilities.formatDate(new Date(), "GMT", "yyyyMMdd-HHmmss");
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CONFIG.targetGid);
  
  if (!sheet) {
    console.error("Error: Target GID not found.");
    return;
  }
  
  const taskLists = fetchTaskLists();
  if (!taskLists) return;

  const headers = getExportHeaders();
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  // Hide internal tracking columns: Task ID, Task List ID, Original Status
  const idColStartIndex = headers.indexOf("Task ID") + 1;
  if (idColStartIndex > 0) {
    sheet.hideColumns(idColStartIndex, 3);
  }
  SpreadsheetApp.flush();

  const allTasksToExport = [];

  taskLists.forEach(taskList => {
    console.log(`Fetching tasks for list: ${taskList.title}`);
    let pageToken = null;
    
    do {
      const taskResponse = fetchTasks(taskList.id, pageToken);
      if (!taskResponse) break;

      if (taskResponse.items) {
        taskResponse.items.forEach(task => {
          const emailInfo = processTaskEmailLinks(task);
          allTasksToExport.push({
            task: task,
            taskList: taskList,
            emailInfo: emailInfo
          });
        });
      }
      pageToken = taskResponse.nextPageToken;
    } while (pageToken);
  });

  console.log(`Total tasks to process: ${allTasksToExport.length}. Batching for Gemini AI...`);
  
  // Process Gemini AI in batches to avoid 6-minute execution limit
  const aiResultsMap = {};
  
  for (let i = 0; i < allTasksToExport.length; i += CONFIG.geminiBatchSize) {
    const batch = allTasksToExport.slice(i, i + CONFIG.geminiBatchSize);
    const geminiInputBatch = batch.map(item => ({
      id: item.task.id,
      title: item.task.title || "",
      notes: item.task.notes || "",
      emailLabels: item.emailInfo.labels || "",
      firstMessage: item.emailInfo.firstBody || "",
      lastMessage: item.emailInfo.lastBody || ""
    }));

    console.log(`Sending batch ${Math.floor(i / CONFIG.geminiBatchSize) + 1} of ${Math.ceil(allTasksToExport.length / CONFIG.geminiBatchSize)} to Gemini...`);
    const batchResults = batchAnalyzeTasksWithGemini(geminiInputBatch);
    Object.assign(aiResultsMap, batchResults);
  }

  // Construct final row results
  const results = [];
  let rowCounter = 1;

  allTasksToExport.forEach(item => {
    const task = item.task;
    const taskList = item.taskList;
    const emailInfo = item.emailInfo;
    const aiData = aiResultsMap[task.id] || { emailSummary: "N/A", proposedCategory: "N/A" };

    const urn = `urn:task:${exportTs}-${rowCounter.toString().padStart(4, '0')}`;
    const formattedDate = task.due ? Utilities.formatDate(new Date(task.due), "GMT", "yyyy-MM-dd") : "";
    const status = task.status || "needsAction";

    // Auto-population logic for revisions
    let titleRevised = "";
    let notesRevised = "";

    const hasLOSPrefix = /^\d{2}\s\d{2}\s\d{2}/.test(task.title || "");
    if (!hasLOSPrefix && aiData.proposedCategory && aiData.proposedCategory !== "N/A" && aiData.proposedCategory !== "") {
      titleRevised = `${aiData.proposedCategory} - ${task.title || "No Title"}`;
    }

    if ((!task.notes || task.notes.trim() === "") && aiData.emailSummary && aiData.emailSummary !== "N/A" && aiData.emailSummary !== "") {
      notesRevised = aiData.emailSummary;
    }

    results.push([
      urn, 
      taskList.title, "",               // Task List + Revised Placeholder
      task.title || "No Title", titleRevised, // Task Title + Revised
      task.notes || "", notesRevised,   // Notes + Revised
      status,                           // Status
      formattedDate, "",                // Date + Revised Placeholder
      emailInfo.labels, 
      emailInfo.firstSender, emailInfo.firstBody,
      emailInfo.lastSender, emailInfo.lastBody, 
      emailInfo.link,
      aiData.emailSummary, aiData.proposedCategory, // AI Columns
      task.id, taskList.id, status      // Hidden Tracking IDs & Original Status
    ]);
    
    rowCounter++;
  });

  exportResultsToSheet(sheet, results, headers.length);
  exportTasksToMarkdownDrive(results);
}

/**
 * Returns the defined headers for the export schema.
 * @returns {string[]} Array of header strings
 */
function getExportHeaders() {
  return [
    "URN", 
    "Task List", "Task List (Revised)", 
    "Task Title", "Task (Revised)", 
    "Notes", "Notes (Revised)", 
    "Status", 
    "Date", "Deadline (Revised)", 
    "Email Labels",
    "First Msg (Sender)", "First Msg (Body Preview)", 
    "Last Msg (Sender)", "Last Msg (Body Preview)", "Email Link",
    "AI Context Summary", "AI Proposed Category",
    "Task ID", "Task List ID", "Original Status"
  ];
}

/**
 * Fetches all Task Lists securely.
 * @returns {Object[]|null} Array of task list objects or null on failure.
 */
function fetchTaskLists() {
  try {
    const response = Tasks.Tasklists.list();
    return response.items || null;
  } catch (e) {
    console.error(`Critical API Failure (Tasklists.list): ${e.message}`);
    return null;
  }
}

/**
 * Fetches a page of Tasks for a given Task List.
 * @param {string} taskListId 
 * @param {string} pageToken 
 * @returns {Object|null} Task response object or null on failure.
 */
function fetchTasks(taskListId, pageToken) {
  try {
    return Tasks.Tasks.list(taskListId, {
      pageToken: pageToken,
      showCompleted: CONFIG.includeCompleted,
      showHidden: CONFIG.includeHidden,
      maxResults: 100
    });
  } catch (e) {
    console.error(`API Error [Tasks] on list ${taskListId}: ${e.message}`);
    return null;
  }
}

/**
 * Processes associated email links for a task to extract conversation details.
 * @param {Object} task The task object
 * @returns {Object} Extracted email information
 */
function processTaskEmailLinks(task) {
  const emailInfo = { labels: "", firstSender: "", firstBody: "", lastSender: "", lastBody: "", link: "" };

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
  return emailInfo;
}

/**
 * Fetches the taxonomy from the Google Drive file (ID: 1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf).
 * Uses a basic cache to avoid redundant fetches during execution.
 */
let cachedTaxonomy = null;
function getTaxonomyDocument() {
  if (cachedTaxonomy) return cachedTaxonomy;
  try {
    const fileId = "1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf";
    // Try as a standard text/markdown file first
    const file = DriveApp.getFileById(fileId);
    cachedTaxonomy = file.getBlob().getDataAsString();
    return cachedTaxonomy;
  } catch (e) {
    try {
      // Fallback in case the user converted it to a Google Doc
      const doc = DocumentApp.openById("1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf");
      cachedTaxonomy = doc.getBody().getText();
      return cachedTaxonomy;
    } catch (e2) {
      console.error("Failed to fetch taxonomy document from Drive:", e2.message);
      return "Taxonomy document could not be loaded.";
    }
  }
}

/**
 * Calls Gemini API to analyze a batch of tasks using gemini-2.5-flash.
 * Batches multiple tasks into a single prompt to bypass the 6-min execution limit and API rate limits.
 * 
 * @param {Array<{id: string, title: string, notes: string, firstMessage: string, lastMessage: string}>} tasksBatch 
 * @returns {Object} Map of taskId -> { emailSummary, proposedCategory }
 */
function batchAnalyzeTasksWithGemini(tasksBatch) {
  if (!tasksBatch || tasksBatch.length === 0) return {};

  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("No GEMINI_API_KEY found in Script Properties.");
    return {};
  }

  // Dynamically fetch the FULL taxonomy document from Drive
  const taxonomy = getTaxonomyDocument();

  // ==========================================
  // FULL PROMPT: Edit here to refine AI output
  // ==========================================
  const prompt = `You are an expert Life Organisation System (LOS) assistant.
Please analyze the following list of tasks provided as JSON. 

For each task, provide:
1. "emailSummary": Deliver a concise summary (MAXIMUM 200 characters). 
   - Follow the Pyramid Principle and BLUF (Bottom Line Up Front).
   - Get straight to the point. DO NOT use filler words like "The task is about" or "This email is...".
   - You have been provided with the task notes, the first and last message of the email thread (if applicable), and any existing Gmail labels. Synthesize the core intent or required action.
2. "proposedCategory": A proposed category strictly based on the FULL LOS Taxonomy provided below.
   - Choose the MOST SPECIFIC fitting category (e.g., an L4 context or L3 category).
   - IMPORTANT: Heavily weigh any provided "emailLabels" when determining the category, as they often directly map to an LOS category.

=== FULL LOS TAXONOMY ===
${taxonomy}
=========================

Input Tasks:
${JSON.stringify(tasksBatch)}

Respond STRICTLY in valid JSON format as an array of objects matching the input IDs:
[
  {
    "id": "...",
    "emailSummary": "...",
    "proposedCategory": "..."
  }
]`;
  // ==========================================

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let maxRetries = 4;
  let delay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode === 200) {
        const json = JSON.parse(response.getContentText());
        const resultText = json.candidates[0].content.parts[0].text;
        
        let parsedResults = [];
        try {
          parsedResults = JSON.parse(resultText);
        } catch (e) {
          const match = resultText.match(/\[[\s\S]*\]/);
          if (match) parsedResults = JSON.parse(match[0]);
        }

        const resultMap = {};
        parsedResults.forEach(res => {
          resultMap[res.id] = {
            emailSummary: res.emailSummary,
            proposedCategory: res.proposedCategory
          };
        });
        return resultMap;

      } else if (statusCode === 429 || statusCode >= 500) {
        Utilities.sleep(delay);
        delay *= 2;
      } else {
        console.error(`Gemini API Error: ${statusCode} - ${response.getContentText()}`);
        return {};
      }
    } catch (e) {
      if (i === maxRetries - 1) {
        console.error("Gemini batch call failed after retries:", e.message);
        return {};
      }
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return {};
}

/**
 * Writes the aggregated task data to the spreadsheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 
 * @param {any[][]} results 
 * @param {number} colCount 
 */
function exportResultsToSheet(sheet, results, colCount) {
  if (results.length > 0) {
    const existingLastRow = Math.max(sheet.getLastRow(), 2);
    // Clear all existing data, including the hidden ID columns
    sheet.getRange(2, 1, existingLastRow, colCount).clearContent();
    sheet.getRange(2, 1, results.length, colCount).setValues(results);
    console.log(`Exported ${results.length} rows. Ready for revision.`);
  } else {
    console.log("No tasks found to export.");
  }
}

/**
 * Scans the spreadsheet for revisions and pushes updates back to Google Tasks.
 * This forms the "Import" side of the Bi-Directional Sync.
 */
function syncRevisionsToTasks() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CONFIG.targetGid);
  if (!sheet) {
    console.error("Error: Target GID not found.");
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log("No data to sync.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  const titleIdx = headers.indexOf("Task Title");
  const titleRevIdx = headers.indexOf("Task (Revised)");
  const notesIdx = headers.indexOf("Notes");
  const notesRevIdx = headers.indexOf("Notes (Revised)");
  const statusIdx = headers.indexOf("Status");
  const dateIdx = headers.indexOf("Date");
  const deadlineRevIdx = headers.indexOf("Deadline (Revised)");
  const taskIdIdx = headers.indexOf("Task ID");
  const taskListIdIdx = headers.indexOf("Task List ID");
  const originalStatusIdx = headers.indexOf("Original Status");

  if (taskIdIdx === -1 || taskListIdIdx === -1) {
    console.error("Task ID or Task List ID columns missing. Cannot sync.");
    return;
  }

  let updateCount = 0;

  data.forEach((row, i) => {
    const taskId = row[taskIdIdx];
    const taskListId = row[taskListIdIdx];
    
    if (!taskId || !taskListId) return;

    let hasUpdates = false;
    const resource = {};

    const newTitle = row[titleRevIdx];
    const newNotes = row[notesRevIdx];
    const newDeadline = row[deadlineRevIdx];
    const currentStatus = row[statusIdx];
    const originalStatus = row[originalStatusIdx];
    
    if (newTitle && newTitle.toString().trim() !== "") {
      resource.title = newTitle;
      hasUpdates = true;
    }
    
    if (newNotes && newNotes.toString().trim() !== "") {
      resource.notes = newNotes;
      hasUpdates = true;
    }

    if (newDeadline && newDeadline.toString().trim() !== "") {
      const parsedDate = new Date(newDeadline);
      if (!isNaN(parsedDate.getTime())) {
        resource.due = parsedDate.toISOString();
        hasUpdates = true;
      }
    }

    if (currentStatus !== originalStatus && (currentStatus === "completed" || currentStatus === "needsAction")) {
      resource.status = currentStatus;
      hasUpdates = true;
    }

    if (hasUpdates) {
      try {
        Tasks.Tasks.patch(resource, taskListId, taskId);
        
        const rowNum = i + 2;
        
        // Mark as synced by clearing the revised columns
        if (newTitle) sheet.getRange(rowNum, titleRevIdx + 1).clearContent();
        if (newNotes) sheet.getRange(rowNum, notesRevIdx + 1).clearContent();
        if (newDeadline) sheet.getRange(rowNum, deadlineRevIdx + 1).clearContent();
        
        // Update the original data columns to reflect the new state
        if (newTitle) sheet.getRange(rowNum, titleIdx + 1).setValue(newTitle);
        if (newNotes) sheet.getRange(rowNum, notesIdx + 1).setValue(newNotes);
        if (newDeadline) sheet.getRange(rowNum, dateIdx + 1).setValue(newDeadline);
        
        // Update the original status column if status was changed
        if (resource.status) sheet.getRange(rowNum, originalStatusIdx + 1).setValue(resource.status);

        updateCount++;
        // Small delay to avoid Tasks API rate limits during bulk updates
        Utilities.sleep(100); 
      } catch (e) {
        console.error(`Failed to patch task ${taskId}: ${e.message}`);
      }
    }
  });

  console.log(`Sync complete. Updated ${updateCount} tasks.`);
}

/**
 * Exports the extracted tasks to a Markdown file in a specific Google Drive folder.
 * 
 * @param {any[][]} results The rows containing extracted task data
 */
function exportTasksToMarkdownDrive(results) {
  const TARGET_FOLDER_ID = "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc";
  const fileName = "Google Tasks.md";
  
  let mdContent = `# Google Tasks\n\n`;
  mdContent += `*Last Updated: ${new Date().toUTCString()}*\n\n`;

  let currentList = null;

  results.forEach(row => {
    // Schema Indices:
    // 1: Task List, 3: Task Title, 5: Notes, 7: Status, 8: Date
    // 16: AI Context Summary, 17: AI Proposed Category
    const listName = row[1];
    const title = row[3];
    const notes = row[5];
    const status = row[7];
    const date = row[8];
    const aiSummary = row[16];
    const aiCategory = row[17];

    if (listName !== currentList) {
      mdContent += `\n## ${listName}\n\n`;
      currentList = listName;
    }

    const checkbox = status === "completed" ? "[x]" : "[ ]";
    mdContent += `- ${checkbox} **${title}**`;
    if (date) mdContent += ` *(Due: ${date})*`;
    mdContent += `\n`;

    if (notes) {
      mdContent += `  - **Notes:** ${notes.replace(/\n/g, ' ')}\n`;
    }
    if (aiSummary && aiSummary !== "N/A" && aiSummary !== "") {
      mdContent += `  - **AI Context:** ${aiSummary.replace(/\n/g, ' ')}\n`;
    }
    if (aiCategory && aiCategory !== "N/A" && aiCategory !== "") {
      mdContent += `  - **Category:** ${aiCategory.replace(/\n/g, ' ')}\n`;
    }
  });

  const blob = Utilities.newBlob(mdContent, 'text/plain', fileName);
  
  try {
    const q = "name = '" + fileName + "' and '" + TARGET_FOLDER_ID + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
    
    if (existingFiles && existingFiles.length > 0) {
      const fileId = existingFiles[0].id;
      Drive.Files.update({}, fileId, blob);
      console.log(`Updated Markdown file in Drive: ${fileId}`);
    } else {
      const resource = {
        name: fileName,
        mimeType: 'text/plain',
        parents: [TARGET_FOLDER_ID]
      };
      const file = Drive.Files.create(resource, blob);
      console.log(`Created new Markdown file in Drive: ${file.id}`);
    }
  } catch (e) {
    console.error("Failed to save Markdown to Drive: " + e.message);
  }
}