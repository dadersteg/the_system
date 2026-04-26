/** * CELLSIOR V5.6: GMAIL AI ARCHITECT (GRANULAR AUDIT)
 * ---------------------------------------------------------
 * Logic: Merged SS + Gemma 3 AI + Whitelisted Alias + Atomic API + Granular Logging
 * Requirement: Enable "Gmail API" under Services.
 */

// --- CONFIGURATION ---
const API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const MODEL_NAME = 'models/gemma-3-27b-it'; 
const DOC_ID = '1OcpxtrbmzCIP5Rg9Rv200R_LvmM3C24osuvmu6BQJO0';
const SHEET_ID = '1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4';

const AUDIT_GID = '1007497112'; // Label Management Tab
const ALIAS_GID = '1799689202'; // Alias Whitelist Tab
const LOG_GID = '2131515996';   // Granular Execution Log

const PRIMARY_EMAIL = 'adersteg.daniel@gmail.com';
const PROCESSED_FLAG = 'Label_Reviewed'; 
const MANUAL_REVIEW_LABEL = 'Manual Review';

let labelIdMap = null;

// =============================================================================
// 1. MAIN AUTOMATION ENGINE
// =============================================================================

function runAutoLabeler() {
  const searchQuery = `label:"00 Test" -label:"${PROCESSED_FLAG}"`;
  const threads = GmailApp.search(searchQuery, 0, 20); 
  
  const runTimestamp = new Date();
  console.log(`Found ${threads.length} threads. Syncing with Gemma 3.`);
  if (threads.length === 0) return;

  const sheetRules = getSheetRules();
  const allowedAliases = getAllowedAliases();
  const fullDocPrompt = DocumentApp.openById(DOC_ID).getBody().getText();
  
  const logData = []; 

  threads.forEach((thread, index) => {
    const firstMsg = thread.getMessages()[0];
    const threadId = thread.getId();
    const subject = firstMsg.getSubject();
    const sender = firstMsg.getFrom().toLowerCase();
    const body = firstMsg.getPlainBody().substring(0, 1500);
    const threadUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
    
    console.log(`[${index + 1}/${threads.length}] Analyzing: ${subject}`);
    
    // 1. Alias Detection
    const targetAliases = getWhitelistedAliases(firstMsg, allowedAliases);

    // 2. Legacy Context
    const existingLabels = thread.getLabels()
      .map(l => l.getName())
      .filter(n => n !== "00 Test" && n !== PROCESSED_FLAG);
    
    // 3. Spreadsheet Logic
    let ssMatch = null;
    for (let ruleEmail in sheetRules) {
      if (sender.includes(ruleEmail)) {
        ssMatch = sheetRules[ruleEmail];
        break;
      }
    }
    const ssLabels = ssMatch ? ssMatch.labels : [];

    // 4. AI Inference (Supports multiple categories)
    const aiMatch = callGemmaWithSourceContext(subject, sender, body, fullDocPrompt, existingLabels, ssLabels);
    Utilities.sleep(500); 

    // 5. Logical Merge
    const finalConfig = mergeConfigs(ssMatch, aiMatch);
    
    // Add aliases to labels
    targetAliases.forEach(alias => {
      if (!finalConfig.labels.includes(alias)) finalConfig.labels.push(alias);
    });

    // Handle Fallback
    const isManual = finalConfig.labels.length === 0;
    if (isManual) {
      finalConfig.labels = [MANUAL_REVIEW_LABEL];
      finalConfig.keepInInbox = true;
      finalConfig.markAsRead = false;
    }

    // 6. Atomic Execution (API)
    executeAtomicCleanup(thread, finalConfig);

    // 7. Granular Log Entry
    logData.push([
      runTimestamp, 
      subject, 
      aiMatch.categories.join(', '), // AI Source
      ssLabels.join(', '),           // Spreadsheet Source
      targetAliases.join(', '),      // Alias Source
      finalConfig.labels.join(', '), // Final Result
      threadUrl, 
      finalConfig.keepInInbox ? "INBOX" : "ARCHIVED", 
      finalConfig.markAsRead ? "READ" : "UNREAD",
      sender
    ]);
  });

  writeToLogSheet(logData);
}

/**
 * Merges SS and AI data. Support for multiple AI categories.
 */
function mergeConfigs(ss, ai) {
  const config = { labels: [], keepInInbox: true, markAsRead: false };
  
  if (ss) {
    config.labels = [...ss.labels];
    config.keepInInbox = ss.keepInInbox;
    config.markAsRead = ss.markAsRead;
  }
  
  if (ai && ai.categories.length > 0) {
    ai.categories.forEach(cat => {
      if (cat !== "Skip" && !config.labels.includes(cat)) {
        config.labels.push(cat);
      }
    });
    // AI decisions on status override or merge
    config.keepInInbox = config.keepInInbox && ai.keepInInbox;
    config.markAsRead = config.markAsRead || ai.markAsRead;
  }
  return config;
}

/**
 * Writes granular logs to the Spreadsheet
 */
function writeToLogSheet(dataRows) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheets().find(s => s.getSheetId().toString() === LOG_GID);
  
  if (!sheet) {
    sheet = ss.insertSheet("Execution Log");
    sheet.appendRow(["Timestamp", "Subject", "AI Categories", "SS Labels", "Alias Labels", "Final Label Set", "Link", "Inbox Status", "Read State", "Sender"]);
    sheet.getRange("A1:J1").setFontWeight("bold").setBackground("#cfe2f3");
  }

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, dataRows.length, 10).setValues(dataRows);
  console.log(`Logged ${dataRows.length} threads to the granular log.`);
}

// --- CORE UTILITIES ---

function callGemmaWithSourceContext(subject, from, body, docInstructions, existing, ss) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  const finalPrompt = `${docInstructions}\n--- CONTEXT: PRE-EXISTING LABELS --- [ ${existing.join(', ') || "None"} ]\n--- CONTEXT: SPREADSHEET RULES --- [ ${ss.join(', ') || "None"} ]\n--- EMAIL DATA ---\nFROM: ${from} | SUBJECT: ${subject} | BODY: ${body}\nJSON:`;
  
  const payload = { "contents": [{ "parts": [{ "text": finalPrompt }] }], "generationConfig": { "responseMimeType": "application/json", "temperature": 0.1 } };
  
  try {
    const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    const rawText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
    const parsed = JSON.parse(rawText.match(/\{[\s\S]*?\}/)[0]);
    
    // Support both singular "category" and array "categories"
    let cats = [];
    if (parsed.categories && Array.isArray(parsed.categories)) cats = parsed.categories;
    else if (parsed.category && parsed.category !== "Skip") cats = [parsed.category];

    return { 
      categories: cats, 
      keepInInbox: parsed.keepInInbox ?? true, 
      markAsRead: parsed.markAsRead ?? false 
    };
  } catch (e) { return { categories: [], keepInInbox: true, markAsRead: false }; }
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

function getSheetRules() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = ss.getSheets()[0].getDataRange().getValues();
  const rules = {};
  data.forEach((row, i) => { if (row[0] && i > 0) rules[row[0].toString().trim().toLowerCase()] = { labels: row[1] ? row[1].toString().split(',').map(s => s.trim()) : [], keepInInbox: row[2] === true || row[2].toString().toUpperCase() === 'T', markAsRead: row[3] === true || row[3].toString().toUpperCase() === 'T' }; });
  return rules;
}

function getAllowedAliases() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === ALIAS_GID);
  if (!sheet) return [];
  const data = sheet.getRange("A:A").getValues();
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

function processLabelCleanup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === AUDIT_GID);
  const data = sheet.getDataRange().getValues();
  const apiLabels = Gmail.Users.Labels.list("me").labels;
  const map = {};
  apiLabels.forEach(l => map[l.name] = l.id);
  for (let i = data.length - 1; i >= 1; i--) {
    const oldName = data[i][0];
    const keep = data[i][3];
    const newName = data[i][4] ? data[i][4].toString().trim() : null;
    if (!oldName || !map[oldName]) continue;
    try {
      if (keep === false || (typeof keep === "string" && keep.toUpperCase() === "FALSE")) { Gmail.Users.Labels.remove("me", map[oldName]); console.log(`[DELETED] ${oldName}`); continue; }
      if (newName && newName !== "" && newName !== oldName) { Gmail.Users.Labels.patch({ "name": newName }, "me", map[oldName]); console.log(`[RENAMED] ${oldName} -> ${newName}`); }
    } catch (e) { console.error(`[ERROR] ${oldName}: ${e.message}`); }
  }
}

function exportGmailLabelsToSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === AUDIT_GID);
  sheet.clear();
  sheet.appendRow(['Label Name (Old)', 'Thread Count', 'Unread Count', 'Keep', 'Label Name (New)']);
  const labels = GmailApp.getUserLabels();
  const data = labels.map(l => [l.getName(), 0, 0, true, l.getName()]);
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 5).setValues(data).sort({column: 1, ascending: true});
  }
}