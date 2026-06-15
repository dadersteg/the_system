/**
 * @file Code_TheClerk_Email.js
 * @description THE CLERK: EMAIL TRIAGE ENGINE. Sweeps unprocessed emails, applies deterministic rules via Google Sheets, infers context via Gemini AI, and auto-labels or temp-deletes them.
 *
 * @version 1.0.2
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Hoisted API calls for configs to runTheClerkEmailOngoing to avoid redundant requests. Refactored log writing to batch operations (writeBatchLogEntries) to prevent timeouts.
 * - 1.0.2: Added comprehensive JSDoc comment for the PROCESS_LIMIT constant.
 */

// --- CONFIGURATION ---
const MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE;
const RETRO_MODEL_NAME = SYSTEM_CONFIG.SECRETS.GEMINI_RETRO_MODEL;
const API_KEY = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;

// Drive File ID for the AI Prompt provided by the user.
const DOC_ID = SYSTEM_CONFIG.DOCS.CLERK_EMAIL_PROMPT_ID;
const TAXONOMY_JSON_ID = SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID;

const SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;

const AUDIT_GID = SYSTEM_CONFIG.SHEETS.LABEL_MANAGEMENT; // Label Management Tab
const ALIAS_GID = SYSTEM_CONFIG.SHEETS.ALIAS_WHITELIST; // Alias Whitelist Tab
const LOG_GID = SYSTEM_CONFIG.SHEETS.EMAIL_LOG;   // Granular Execution Log (Ongoing)
const RETRO_LOG_GID = SYSTEM_CONFIG.SHEETS.EMAIL_RETRO_LOG;       // Retro Execution Log (Leave blank to auto-create)
const DETERMINISTIC_RULES_GID = SYSTEM_CONFIG.SHEETS.EMAIL_DETERMINISTIC_RULES; // Combined Rules Tab

// System Labels
const PROCESSED_FLAG = '99 Label_Reviewed'; 
const TEMP_DELETE_LABEL = '99 To be deleted';
const MANUAL_REVIEW_LABEL = '00 Manual Review';

let labelIdMap = null;

// =============================================================================
// 1. MAIN AUTOMATION ENGINE
// =============================================================================

function runTheClerkEmailOngoing() {
  getLabelIdByName(PROCESSED_FLAG);
  getLabelIdByName(TEMP_DELETE_LABEL);
  
  // THE SWEEPER: Catch all unprocessed emails (Drops out once labeled, impossible to bury)
  // Temporarily set to 7d to catch up on the 1-week backlog. Can be reduced to 2d later.
  const newEmailQuery = `-label:"${PROCESSED_FLAG}" newer_than:7d`;

  // Hoist API calls outside of the main loop
  const configPayload = {
    deterministicRules: getDeterministicRules(),
    allowedAliases: getAllowedAliases(),
    fullDocPrompt: getSafeDocText(DOC_ID),
    taxonomyJsonStr: getSafeDocText(TAXONOMY_JSON_ID),
    personalGoalsStr: getSafeDocText(SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID),
    workGoalsStr: getSafeDocText(SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID)
  };

  // Run the batch (Limit 15 to prevent timeout)
  executeTriageEngine(newEmailQuery, 15, false, configPayload);
  
  // THE PHOTO EXTRACTOR: Process any new Telegram/Messenger backup photos
  try {
    processGmailPhotos();
  } catch(e) {
    console.warn("processGmailPhotos failed: " + e.message);
  }
  
  return "Successfully swept inbox and executed triage engine.";
}

/**
 * Executes a dedicated recovery pass to process emails missed due to API outages.
 */
function runRecoveryCatchup() {
  console.log("Running recovery catch-up for missed emails...");
  runTheClerkEmailOngoing(); // Just reuse the main sweep logic since it inherently catches up
}

function executeTriageEngine(searchQuery, searchLimit, isRetro, configPayload) {
  const threads = GmailApp.search(searchQuery, 0, searchLimit); 
  
  const runTimestamp = new Date();
  const currentModel = isRetro ? RETRO_MODEL_NAME : MODEL_NAME;
  console.log(`Found ${threads.length} threads. Syncing with ${currentModel}.`);
  if (threads.length === 0) return;

  const deterministicRules = configPayload ? configPayload.deterministicRules : getDeterministicRules();
  const allowedAliases = configPayload ? configPayload.allowedAliases : getAllowedAliases();
  const fullDocPrompt = configPayload ? configPayload.fullDocPrompt : getSafeDocText(DOC_ID);
  const taxonomyJsonStr = configPayload ? configPayload.taxonomyJsonStr : getSafeDocText(TAXONOMY_JSON_ID);
  const personalGoalsStr = configPayload ? configPayload.personalGoalsStr : getSafeDocText(SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID);
  const workGoalsStr = configPayload ? configPayload.workGoalsStr : getSafeDocText(SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID);
  
  const labelToPathMap = {};
  try {
    const parsedTaxonomy = JSON.parse(taxonomyJsonStr);
    parsedTaxonomy.forEach(item => {
      if (item["Concat (Label)"] && item["Concat (Path)"]) {
        labelToPathMap[item["Concat (Label)"]] = item["Concat (Path)"];
      }
    });
  } catch(e) {
    console.error("Failed to parse taxonomy: " + e.message);
  }
  const activeTaskMap = getActiveThreadTaskMap();

  let processedCount = 0;
  const batchLogs = [];
  const cleanupBuffer = [];

  /**
   * @constant {number} PROCESS_LIMIT
   * @description Restricts the total number of email threads processed in a single execution.
   * This limit acts as a critical safety valve to prevent the script from exceeding the
   * Google Apps Script 6-minute hard execution timeout, ensuring state changes and logs
   * are successfully committed before the script terminates.
   */
  const PROCESS_LIMIT = 15; // Max AI calls per run to prevent 6-min timeout
  const sessionStart = Date.now();

  for (let index = 0; index < threads.length; index++) {
    if (processedCount >= PROCESS_LIMIT || (Date.now() - sessionStart > 280000)) {
      console.log(`Hit processing limit or approaching timeout. Stopping safely.`);
      break;
    }
    
    const thread = threads[index];
    const threadId = thread.getId();
    
    const messages = thread.getMessages();
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];
    
    const lastMsgId = lastMsg.getId();
    
    // Stateful Memory Check (Removed as per user request to simplify)
    
    const subject = firstMsg.getSubject();
    const sender = firstMsg.getFrom().toLowerCase();
    
    let body = "";
    let systemNotes = "";
    if (messages.length === 1) {
      body = messages[0].getPlainBody().substring(0, 3000);
    } else {
      // Feed the last 3 messages to ensure multiple rapid-fire requests are caught
      const recentMessages = messages.slice(-3);
      const bodies = recentMessages.map((m, i) => `--- MSG ${i+1} (FROM: ${m.getFrom()}) ---\n${m.getPlainBody().substring(0, 1500)}`);
      body = bodies.join('\n\n');
    }
    
    // ATTACHMENT EXTRACTION (MULTIMODAL SUPPORT FOR RECEIPTS, FLYERS, PDFs)
    let inlineImages = [];
    try {
      const attachments = lastMsg.getAttachments();
      for (let att of attachments) {
        const mime = att.getContentType();
        const size = att.getSize();
        
        // Conditions for valid multimodal attachments:
        // 1. Image: Ignore tiny signatures (< 10KB)
        // 2. PDF: Restrict size to < 4MB to prevent Google Apps Script memory crashes
        const isImage = mime.startsWith('image/') && size > 10240;
        const isSmallPdf = mime === 'application/pdf' && size < 4 * 1024 * 1024;
        const isHugePdf = mime === 'application/pdf' && size >= 4 * 1024 * 1024;
        
        if (isImage || isSmallPdf) {
          inlineImages.push({
            mimeType: mime,
            data: Utilities.base64Encode(att.getBytes())
          });
          if (inlineImages.length >= 2) break; // Cap at 2 attachments per run to prevent payload bloat
        } else if (isHugePdf) {
          // If the PDF is too large, pass a system note explicitly OUTSIDE the body
          systemNotes += `\n- This email contains a large PDF attachment ("${att.getName()}", ${(size / (1024 * 1024)).toFixed(2)} MB) which exceeds the automated processing limit. You MUST extract an action item to "Manually review large PDF attachment: ${att.getName()}".`;
        }
      }
    } catch (e) {
      console.warn(`Failed to extract images for thread ${threadId}: ${e.message}`);
    }
    const threadUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
    
    const firstMsgDate = Utilities.formatDate(firstMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
    const lastMsgDate = Utilities.formatDate(lastMsg.getDate(), "GMT", "yyyy-MM-dd HH:mm:ss");
    
    console.log(`[${index + 1}/${threads.length}] Analyzing: ${subject}`);
    
    // 1. Alias Detection
    const targetAliases = getWhitelistedAliases(firstMsg, allowedAliases);

    // 2. Legacy Context
    const existingLabels = thread.getLabels()
      .map(l => l.getName())
      .filter(n => n !== PROCESSED_FLAG);
    
    // 3. Spreadsheet Logic (Deterministic Override)
    let tempLabels = [];
    let keepInInboxVals = [];
    let markAsReadVals = [];
    let skipAIVals = [];
    
    // Evaluate combined deterministic rules
    const lowerSender = sender.toLowerCase();
    const lowerSubject = subject.toLowerCase();
    const lowerBody = body.toLowerCase();
    
    deterministicRules.forEach(rule => {
      let isMatch = true;
      
      // Check each non-null condition using AND logic
      if (rule.sender && !lowerSender.includes(rule.sender)) {
        isMatch = false;
      }
      if (rule.subject && !lowerSubject.includes(rule.subject)) {
        isMatch = false;
      }
      if (rule.emailContains && !lowerBody.includes(rule.emailContains)) {
        isMatch = false;
      }
      
      if (isMatch) {
        if (rule.labels && rule.labels.length > 0) tempLabels.push(...rule.labels);
        keepInInboxVals.push(rule.keepInInbox);
        markAsReadVals.push(rule.markAsRead);
        skipAIVals.push(rule.skipAI);
      }
    });
    
    let ssMatch = null;
    if (tempLabels.length > 0 || keepInInboxVals.length > 0 || skipAIVals.length > 0) {
       ssMatch = {
         labels: [...new Set(tempLabels)],
         keepInInbox: keepInInboxVals.length > 0 ? keepInInboxVals.some(v => v === true) : true,
         markAsRead: markAsReadVals.some(v => v === true),
         skipAI: skipAIVals.some(v => v === true)
       };
    }
    const ssLabels = ssMatch ? ssMatch.labels : [];

    // 4. AI Inference
    let aiMatch = null;
    if (ssMatch && ssMatch.skipAI) {
        console.log(` > Skipping AI Inference due to Spreadsheet Rule (Skip AI = TRUE)`);
        aiMatch = {
            categories: [],
            keepInInbox: ssMatch.keepInInbox,
            markAsRead: ssMatch.markAsRead,
            deleteEmail: ssMatch.labels.includes('99 To be deleted'),
            summary: "Auto-categorized via Spreadsheet Rule (AI Bypassed)",
            actionItems: []
        };
    } else {
        const openTasksStr = activeTaskMap.openTasksForAI.join('\n');
        aiMatch = callLLMWithSourceContext(subject, sender, body, fullDocPrompt, taxonomyJsonStr, existingLabels, ssLabels, isRetro, currentModel, inlineImages, systemNotes, personalGoalsStr, workGoalsStr, openTasksStr);
    }
    
    if (!aiMatch) {
       console.log(` > Skipping thread due to AI failure. Flagging for Manual Review to prevent queue blockage.`);
       
       const manualLabel = GmailApp.getUserLabelByName("00 Manual Review");
       const processedLabel = GmailApp.getUserLabelByName("99 Label_Reviewed");
       
       if (manualLabel) thread.addLabel(manualLabel);
       if (processedLabel) thread.addLabel(processedLabel);
       
       continue; 
    }
    Utilities.sleep(1500); // Increased Rate Limit Protection

    // 5. Logical Merge (Spreadsheet Deterministic Override)
    const finalConfig = mergeConfigs(ssMatch, aiMatch);
    
    // Add aliases to labels
    targetAliases.forEach(alias => {
      if (!finalConfig.labels.includes(alias)) finalConfig.labels.push(alias);
    });

    // Handle Fallback
    const isManual = finalConfig.labels.length === 0 && !finalConfig.deleteEmail;
    if (isManual) {
      finalConfig.labels = [MANUAL_REVIEW_LABEL];
      finalConfig.keepInInbox = true;
      finalConfig.markAsRead = false;
    }

    // 6. Execution (Temp Delete or Labeling)
    if (finalConfig.deleteEmail) {
      if (!finalConfig.labels.includes(TEMP_DELETE_LABEL)) {
        finalConfig.labels.push(TEMP_DELETE_LABEL);
      }
      finalConfig.keepInInbox = false; // Automatically archive items marked for temp deletion
      console.log(` > Flagged for deletion: ${subject}`);
    }
    
    cleanupBuffer.push({ thread: thread, config: finalConfig });

    // 7. Granular Log Entry & Task Push
    const summaryLog = aiMatch.summary || "";
    let actionItemsLog = "";
    let syncedTaskIds = [];

    // Filter out hallucinations like ["None"], ["N/A"]
    let validActions = [];
    if (aiMatch.actionItems && Array.isArray(aiMatch.actionItems)) {
       validActions = aiMatch.actionItems.filter(a => {
          if (typeof a !== 'object') return false;
          const str = (a.title || "").toLowerCase().trim();
          return str !== "" && str !== "none" && str !== "n/a" && str !== "null";
       });
    }

    if (validActions.length > 0) {
      actionItemsLog = validActions.map(a => a.title).join('; ');
      
      const primaryCategoryLabel = (aiMatch.categories && aiMatch.categories.length > 0) ? aiMatch.categories[0] : "00 Manual Review";
      const categoryPath = labelToPathMap[primaryCategoryLabel] || primaryCategoryLabel;
      
      const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
      
      validActions.forEach(actionObj => {
         const actionTitle = actionObj.title;
         const cleanTitle = actionTitle.split(' - ')[0] || actionTitle;
         const lookupTitle = cleanTitle.toLowerCase().trim();
         
         let existingRef = activeTaskMap.byThread[threadId] || activeTaskMap.byTitle[lookupTitle] || (actionObj.mapped_task_id && actionObj.mapped_task_id !== "None" ? activeTaskMap.byId[actionObj.mapped_task_id] : null);
         
         if (existingRef) {
             console.log(` > Task already exists or was mapped by AI. Appending action item.`);
             try {
                 let existingTask = existingRef.taskObj;
                 existingTask.notes = (existingTask.notes || "") + `\n\n[UPDATE]: ${actionTitle}\nLink: ${threadUrl}`;
                 
                 if (actionObj.mark_completed_reason && actionObj.mark_completed_reason !== "None") {
                    if (!existingTask.title.startsWith("99 Done ")) {
                       existingTask.title = "99 Done - " + existingTask.title;
                    }
                    existingTask.notes += `\n\nSYS: To be marked as Done because: ${actionObj.mark_completed_reason}`;
                 }
                 
                 Tasks.Tasks.patch({ notes: existingTask.notes, title: existingTask.title }, existingRef.listId, existingTask.id);
                 console.log(` > Successfully appended to existing task.`);
             } catch (e) {
                 console.error(`Failed to append to existing task: ${e.message}`);
             }
         } else {
             const aiCategory = actionObj.category_path || primaryCategoryLabel;
             const finalCategoryPath = labelToPathMap[aiCategory] || aiCategory;
             
             let deadlineVal = actionObj.deadline && actionObj.deadline !== "None" ? actionObj.deadline : "None";
             
             const metadata = {
                duration: "15m",
                goal: actionObj.goal_urn && actionObj.goal_urn.startsWith("2026-") ? actionObj.goal_urn : "Maintenance",
                category_path: finalCategoryPath,
                created_at: new Date().toISOString()
             };
             if (deadlineVal !== "None") {
                 metadata.deadline = deadlineVal;
             }
             
             const notes = `${threadUrl}\nContext: ${finalCategoryPath}\n\n${actionTitle}\n\nSYS: Pending initial review.\nDA:\n\n---SYSTEM_METADATA---\n${JSON.stringify(metadata)}`;
             
             try {
                const taskPayload = {
                   title: cleanTitle,
                   notes: notes
                };
                if (deadlineVal !== "None") {
                   taskPayload.due = deadlineVal + "T00:00:00.000Z";
                }
                const created = Tasks.Tasks.insert(taskPayload, importerListId);
                syncedTaskIds.push(created.id);
                console.log(` > Pushed task to Importer: ${cleanTitle}`);
             } catch(e) {
                console.error("Failed to push task to Importer: " + e.message);
             }
         }
      });
    }

    batchLogs.push({
      "Timestamp": runTimestamp, 
      "Received First Message": firstMsgDate,
      "Received Last Message": lastMsgDate,
      "Subject": subject, 
      "AI Categories": aiMatch.categories.join(', '), 
      "SS Labels": ssLabels.join(', '),           
      "Alias Labels": targetAliases.join(', '),      
      "Final Label Set": finalConfig.labels.join(', '), 
      "Link": threadUrl, 
      "Inbox Status": finalConfig.deleteEmail ? "TEMP_DELETE" : (finalConfig.keepInInbox ? "INBOX" : "ARCHIVED"), 
      "Read State": finalConfig.markAsRead ? "READ" : "UNREAD",
      "Sender": sender,
      "AI Summary": summaryLog,
      "AI Action Items": actionItemsLog,
      "Task Synced": syncedTaskIds.join(', '),
      "Revised Labels (Override)": "",
      "Override Status": ""
    });
    
    // Stateful Cache Save (Removed as per user request to simplify)
    
    processedCount++;
  } // End of for-loop

  if (batchLogs.length > 0) {
    writeBatchLogEntries(batchLogs, isRetro);
  }

  if (cleanupBuffer.length > 0) {
    cleanupBuffer.forEach(item => {
      executeAtomicCleanup(item.thread, item.config);
    });
  }
}

/**
 * Merges SS and AI data. Spreadsheet rules take deterministic precedence.
 */
function mergeConfigs(ss, ai) {
  const config = { 
    labels: [], 
    keepInInbox: true, 
    markAsRead: false,
    deleteEmail: false
  };
  
  if (ai) {
    ai.categories.forEach(cat => {
      if (cat && cat !== "Skip" && !cat.includes('99 To be deleted') && !config.labels.includes(cat)) {
        config.labels.push(cat);
      }
    });
    config.keepInInbox = ai.keepInInbox ?? true;
    config.markAsRead = ai.markAsRead ?? false;
    config.deleteEmail = ai.deleteEmail ?? false;
  }

  // Deterministic override (Spreadsheet overrides AI guesses)
  if (ss) {
    if (ss.labels && ss.labels.length > 0) {
      // If the spreadsheet labels are strictly operational (starts with "99 "), we COMBINE them with the AI context labels.
      // If it's a hard category (like "01 Private..."), it OVERWRITES the AI.
      const isOnlyOperational = ss.labels.every(l => l.startsWith('99 '));
      
      if (isOnlyOperational) {
        config.labels = [...new Set([...config.labels, ...ss.labels])];
      } else {
        config.labels = [...ss.labels];
      }
      
      // Deletion Logic: 
      // If the spreadsheet explicitly demands deletion, enforce it.
      if (ss.labels.includes('99 To be deleted')) {
        config.deleteEmail = true;
      }
      
      // Explicit Protection: If the spreadsheet explicitly categorized this as a Newsletter, NEVER delete it.
      // This protects your curated reading list while still allowing the AI to delete Bank 2FA codes.
      if (ss.labels.some(l => l.includes('Newsletters'))) {
        config.deleteEmail = false;
      }
    }
    config.keepInInbox = ss.keepInInbox;
    config.markAsRead = ss.markAsRead;
  }
  
  return config;
}

/**
 * Writes granular logs to the Spreadsheet in a single batch
 */
function writeBatchLogEntries(batchLogsArray, isRetro) {
  if (!batchLogsArray || batchLogsArray.length === 0) return;

  const ss = getMasterSpreadsheet();
  
  const targetGid = isRetro ? RETRO_LOG_GID : LOG_GID;
  const fallbackName = isRetro ? "Execution Log - Retro" : "Execution Log";
  
  let sheet = null;
  if (targetGid) {
    sheet = ss.getSheets().find(s => s.getSheetId().toString() === targetGid);
  }
  
  if (!sheet) {
    sheet = ss.getSheetByName(fallbackName);
    if (!sheet) {
      sheet = ss.insertSheet(fallbackName);
      sheet.appendRow([
        "Timestamp", "Received First Message", "Received Last Message", "Subject", "AI Categories", "SS Labels", "Alias Labels", 
        "Final Label Set", "Link", "Inbox Status", "Read State", "Sender",
        "AI Summary", "AI Action Items", "Task Synced", "Revised Labels (Override)", "Override Status"
      ]);
      sheet.getRange("A1:Q1").setFontWeight("bold").setBackground("#cfe2f3");
    }
  }

  const data = sheet.getDataRange().getValues();
  let headerRowIdx = 0;
  if (data.length > 1 && data[0].findIndex(h => h.toString().trim().toLowerCase() === "link") === -1) {
    headerRowIdx = 1;
  }
  
  let headers = data.length > 0 ? data[headerRowIdx] : [];
  if (headers.length === 0) {
    headers = Object.keys(batchLogsArray[0]);
    sheet.appendRow(headers);
    headerRowIdx = sheet.getLastRow() - 1;
  }

  const rowsToWrite = [];

  batchLogsArray.forEach(rowObj => {
    const newRow = new Array(headers.length).fill("");
    Object.keys(rowObj).forEach(key => {
      let idx = headers.findIndex(h => h.toString().trim().toLowerCase() === key.toLowerCase());
      if (idx !== -1) {
        newRow[idx] = rowObj[key];
      } else {
        headers.push(key);
        newRow.push(rowObj[key]);
        sheet.getRange(headerRowIdx + 1, headers.length).setValue(key);
      }
    });
    rowsToWrite.push(newRow);
  });

  if (rowsToWrite.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
  }
}

// --- CORE UTILITIES ---

function callLLMWithSourceContext(subject, from, body, docInstructions, taxonomyJson, existing, ss, isRetro, modelName, inlineImages, systemNotes, personalGoalsStr, workGoalsStr, openTasksStr) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
  
  // 1. Fetch prompt from docInstructions (which now contains placeholders)
  let finalPrompt = docInstructions;

  // 2. Dynamic Replacements
  const systemTime = new Date().toISOString();
  finalPrompt = finalPrompt.replace('{{SYSTEM_TIME}}', systemTime);

  if (isRetro) {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "*** RETRO MODE ACTIVE: Do NOT generate 'actionItems'. Leave it as an empty array to save tokens. Focus ONLY on categorisation, deletion logic, and summary. ***");
  } else {
      finalPrompt = finalPrompt.replace('{{RETRO_MODE}}', "");
  }

  // 3. Append JSON context and Goal Lists
  finalPrompt += `\n\n--- OPEN TASKS ---\n${openTasksStr}\n\n--- VALID TAXONOMY CATEGORIES (Use 'Concat' logic or textual names) ---\n${taxonomyJson}\n\n--- MASTER GOAL LISTS ---\n**PERSONAL GOALS:**\n${personalGoalsStr}\n\n**PMT GOALS:**\n${workGoalsStr}\n\n--- CONTEXT: PRE-EXISTING LABELS --- [ ${existing.join(', ') || "None"} ]\n--- CONTEXT: SPREADSHEET RULES --- [ ${ss.join(', ') || "None"} ]\n--- SYSTEM DIRECTIVES ---\n${systemNotes || "None"}\n--- EMAIL DATA ---\nFROM: ${from} | SUBJECT: ${subject} | BODY: ${body}\nJSON:`;
  
  const parts = [{ "text": finalPrompt }];
  if (inlineImages && inlineImages.length > 0) {
    inlineImages.forEach(img => {
      parts.push({
        "inlineData": {
          "mimeType": img.mimeType,
          "data": img.data
        }
      });
    });
  }
  
  const payload = { 
    "contents": [{ "parts": parts }], 
    "generationConfig": { 
      "responseMimeType": "application/json", 
      "temperature": 0.1,
      "responseSchema": {
        "type": "OBJECT",
        "properties": {
          "categories": { "type": "ARRAY", "items": { "type": "STRING" } },
          "keepInInbox": { "type": "BOOLEAN" },
          "markAsRead": { "type": "BOOLEAN" },
          "deleteEmail": { "type": "BOOLEAN" },
          "summary": { "type": "STRING" },
          "actionItems": { 
            "type": "ARRAY", 
            "items": { 
              "type": "OBJECT",
              "properties": {
                "title": { "type": "STRING" },
                "goal_urn": { "type": "STRING" },
                "category_path": { "type": "STRING" },
                "deadline": { "type": "STRING", "description": "YYYY-MM-DD or None" },
                "mapped_task_id": { "type": "STRING", "description": "If this email is a confirmation or update for an existing OPEN TASK, output its EXACT ID here. Otherwise 'None'."},
                "mark_completed_reason": { "type": "STRING", "description": "If this email confirms the mapped task is complete, provide a detailed reason why (e.g. 'Flight confirmation received'). Otherwise 'None'."}
              },
              "required": ["title", "goal_urn", "category_path", "deadline"]
            } 
          }
        },
        "required": ["categories", "keepInInbox", "markAsRead", "deleteEmail", "summary", "actionItems"]
      }
    } 
  };
  
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
      
      if (response.getResponseCode() !== 200) {
        console.error(`[Attempt ${attempt}/${maxRetries}] LLM API Error: ${response.getContentText()}`);
        if (response.getResponseCode() >= 500 || response.getResponseCode() === 429) {
           if (attempt < maxRetries) {
             Utilities.sleep(attempt * 2500); // 2.5s, 5.0s backoff
             continue;
           }
        }
        return null; // Fatal failure
      }
      
      const rawText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
      
      // Fix: Use greedy regex to match the full JSON object, or just strip markdown and parse.
      let cleanText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      
      // Try parsing directly first
      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch (e) {
        // Fallback: extract from first { to last }
        const match = cleanText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON object found in response");
        
        let jsonStr = match[0];
        // Clean common LLM hallucinations like trailing commas
        jsonStr = jsonStr.replace(/,\s*([\}\]])/g, '$1');
        parsed = JSON.parse(jsonStr);
      }
      
      let cats = [];
      if (parsed.categories && Array.isArray(parsed.categories)) cats = parsed.categories;
      else if (parsed.category && parsed.category !== "Skip") cats = [parsed.category];

      return { 
        categories: cats, 
        keepInInbox: parsed.keepInInbox ?? true, 
        markAsRead: parsed.markAsRead ?? false,
        deleteEmail: parsed.deleteEmail ?? false,
        summary: parsed.summary || "",
        actionItems: parsed.actionItems || []
      };
    } catch (e) { 
      console.error(`[Attempt ${attempt}/${maxRetries}] Error parsing LLM response: ${e.message}`);
      if (attempt < maxRetries) {
          Utilities.sleep(attempt * 2500);
          continue;
      }
      return null; 
    }
  }
  return null;
}

function executeAtomicCleanup(thread, config) {
  try {
    const threadId = thread.getId();
    const addIds = [];
    const removeIds = [];

    config.labels.forEach(name => {
      const id = getLabelIdByName(name);
      if (id) addIds.push(id);
    });
    addIds.push(getLabelIdByName(PROCESSED_FLAG));

    thread.getLabels().forEach(l => {
      const n = l.getName();
      if (!config.labels.includes(n) && n !== PROCESSED_FLAG) {
        const rid = getLabelIdByName(n);
        if (rid) removeIds.push(rid);
      }
    });

    if (!config.keepInInbox) removeIds.push('INBOX');
    if (config.markAsRead) removeIds.push('UNREAD');

    Gmail.Users.Threads.modify({
      "addLabelIds": [...new Set(addIds)],
      "removeLabelIds": [...new Set(removeIds)]
    }, "me", threadId);
  } catch (e) { console.error(` > API Error: ${e.message}`); }
}

function getLabelIdByName(name) {
  if (!labelIdMap) {
    labelIdMap = {};
    const response = Gmail.Users.Labels.list("me");
    if (response.labels) response.labels.forEach(l => labelIdMap[l.name] = l.id);
  }
  if (!labelIdMap[name]) {
    try {
      GmailApp.createLabel(name);
      const response = Gmail.Users.Labels.list("me");
      if (response.labels) response.labels.forEach(l => labelIdMap[l.name] = l.id);
    } catch(e) { return null; }
  }
  return labelIdMap[name];
}

function getDeterministicRules() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === DETERMINISTIC_RULES_GID);
  if (!sheet) {
    console.error(`ERROR: Deterministic Rules tab with GID ${DETERMINISTIC_RULES_GID} not found!`);
    return [];
  }
  const data = sheet.getDataRange().getValues();
  const rules = [];
  if (data.length <= 1) return rules;
  
  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  
  // Find column indices dynamically
  const senderIdx = headers.findIndex(h => h.includes('sender'));
  const subjectIdx = headers.findIndex(h => h.includes('subject'));
  const emailContainsIdx = headers.findIndex(h => h.includes('email contains') || h.includes('body contains') || h.includes('body') || h.includes('contains'));
  const labelsIdx = headers.findIndex(h => h.includes('label'));
  const keepInInboxIdx = headers.findIndex(h => h.includes('keep in inbox') || h.includes('inbox'));
  const markAsReadIdx = headers.findIndex(h => h.includes('mark as read') || h.includes('read'));
  const skipAiIdx = headers.findIndex(h => h.includes('skip') && h.includes('ai'));
  
  data.forEach((row, i) => { 
    if (i > 0) {
      // Only add rule if at least one condition is defined
      const senderVal = (senderIdx !== -1 && row[senderIdx]) ? row[senderIdx].toString().trim().toLowerCase() : null;
      const subjectVal = (subjectIdx !== -1 && row[subjectIdx]) ? row[subjectIdx].toString().trim().toLowerCase() : null;
      const emailContainsVal = (emailContainsIdx !== -1 && row[emailContainsIdx]) ? row[emailContainsIdx].toString().trim().toLowerCase() : null;
      
      if (senderVal || subjectVal || emailContainsVal) {
        rules.push({
          sender: senderVal,
          subject: subjectVal,
          emailContains: emailContainsVal,
          labels: (labelsIdx !== -1 && row[labelsIdx]) ? row[labelsIdx].toString().split(',').map(s => s.trim()) : [], 
          keepInInbox: (keepInInboxIdx !== -1) ? (row[keepInInboxIdx] === true || row[keepInInboxIdx].toString().toUpperCase() === 'T' || row[keepInInboxIdx].toString().toUpperCase() === 'TRUE') : false,
          markAsRead: (markAsReadIdx !== -1) ? (row[markAsReadIdx] === true || row[markAsReadIdx].toString().toUpperCase() === 'T' || row[markAsReadIdx].toString().toUpperCase() === 'TRUE') : false,
          skipAI: (skipAiIdx !== -1) ? (row[skipAiIdx] === true || row[skipAiIdx].toString().toUpperCase() === 'T' || row[skipAiIdx].toString().toUpperCase() === 'TRUE') : false
        });
      }
    }
  });
  return rules;
}

function getAllowedAliases() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === ALIAS_GID);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return [];
  const data = sheet.getRange(1, 1, lastRow, 1).getValues();
  return data.map(row => row[0].toString().trim().toLowerCase()).filter(val => val !== "" && val !== "email");
}

function getWhitelistedAliases(message, allowedList) {
  const found = [];
  const headers = [message.getTo(), message.getCc(), getDeliveredTo(message)];
  headers.forEach(h => {
    if (!h) return;
    const emails = h.toLowerCase().match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g);
    if (emails) {
      emails.forEach(email => {
        const clean = email.trim();
        if (allowedList.includes(clean) && !found.includes(clean)) found.push(clean);
      });
    }
  });
  return found;
}

function getDeliveredTo(message) {
  try { return message.getRawContent().match(/^Delivered-To:\s*(.+)/im)[1].trim().toLowerCase(); } catch (e) { return null; }
}

// =============================================================================
// 2. LABEL MANAGEMENT TOOLSET
// =============================================================================

function exportGmailLabelsToSheet() {
  const ss = getMasterSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === AUDIT_GID);
  sheet.clear();
  sheet.appendRow(['Label Name (Old)', 'Thread Count', 'Unread Count', 'Keep', 'Label Name (New)']);
  const labels = GmailApp.getUserLabels();
  const data = labels.map(l => [l.getName(), 0, 0, true, l.getName()]);
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 5).setValues(data).sort({column: 1, ascending: true});
  }
}

// =============================================================================
// 4. MANUAL OVERRIDE ENGINE
// =============================================================================


