/**
 * @file src/Code_SystemCore.js
 * @description System core utilities providing centralized AI functions, system triggers, and testing functions.
 *
 * @version 1.0.2
 * @last_modified 2026-06-05
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.2: Wrapped JSON.parse(resultText) in callGemini with a try/catch block to prevent uncaught exceptions. Removed duplicated JSDoc header above _cachedDocTexts.
 * - 1.0.1: Improved error handling by replacing empty catch blocks with explicit console logging in getMasterSpreadsheet and isPmtAccount.
 * - 1.0.0: Initial creation from split of Code_Utilities.js. Added standardized documentation header, JSDoc descriptions for all functions, aggressive type checking, and error boundaries.
 */

let _cachedMasterSheet = null;

/**
 * Retrieves the Master Spreadsheet. Caches the result to prevent redundant API calls
 * during a single execution context.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getMasterSpreadsheet() {
  if (!_cachedMasterSheet) {
    try {
      _cachedMasterSheet = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      console.error(`getMasterSpreadsheet: getActiveSpreadsheet failed (expected in standalone context) - ${e.message}`);
    }
    if (!_cachedMasterSheet) {
      _cachedMasterSheet = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
    }
  }
  return _cachedMasterSheet;
}

/**
 * Programmatically clears all existing triggers and provisions the master schedule.
 * Run this function once from the Apps Script editor to lock in the automated pipelines.
 * @returns {void}
 */
function setupSystemTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();

    console.log(`[INIT] Found ${triggers.length} existing triggers. Wiping slate clean for ${IS_PMT_ENV ? 'PMT' : 'PRIVATE'} environment...`);
    for (let i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }

    // ========================================================
    // 1. THE CLERK (Email, Drive, Notes Extraction Engine)
    // ========================================================
    ScriptApp.newTrigger("runTheClerkEmailOngoing").timeBased().everyMinutes(10).create();
    ScriptApp.newTrigger("runTheClerkDriveOngoing").timeBased().everyMinutes(1).create();
    ScriptApp.newTrigger("runTheClerkNotes").timeBased().everyMinutes(15).create();
    ScriptApp.newTrigger("runDriveArchaeologist").timeBased().everyDays(1).atHour(2).create();

    // ========================================================
    // 2. TASK ENGINE & REVIEWS (AI Analysis and Gating)
    // ========================================================
    ScriptApp.newTrigger("runTaskMasterEngine").timeBased().everyMinutes(15).create();
    ScriptApp.newTrigger("hourlyReviewTriggerWrapper").timeBased().everyHours(1).create();
    ScriptApp.newTrigger("weeklyReviewTriggerWrapper").timeBased().everyHours(1).create();
    ScriptApp.newTrigger("monthlyReviewTriggerWrapper").timeBased().everyHours(1).create();
    ScriptApp.newTrigger("quarterlyReviewTriggerWrapper").timeBased().everyHours(1).create();

    // ========================================================
    // 3. TAXONOMY & SPREADSHEET SYNC
    // ========================================================
    ScriptApp.newTrigger("updateModelList").timeBased().everyDays(1).atHour(2).create();
    ScriptApp.newTrigger("updateLabelList").timeBased().everyDays(1).atHour(2).create();
    ScriptApp.newTrigger("updateTaskList").timeBased().everyDays(1).atHour(2).create();
    ScriptApp.newTrigger("syncTaxonomyToSheet").timeBased().everyHours(1).create();
    ScriptApp.newTrigger("exportTrackers").timeBased().everyHours(1).create();

    // ========================================================
    // 4. EXCLUDED PIPELINES (Managed by Python / User)
    // ========================================================
    // The following scripts are explicitly idled because the local MacMini 
    // Python script (sync_tasks_combined.py) manages the markdown generation 
    // and bi-directional cross-LOS routing autonomously.
    // 
    // - extractTasksWithConversationDetails
    // - run1DayTaskMaintenance
    // - runTheClerkDriveRetro

    console.log(`[SUCCESS] All valid system triggers have been provisioned for the ${IS_PMT_ENV ? 'PMT' : 'PRIVATE'} environment.`);
  } catch (e) {
    console.error(`setupSystemTriggers failed: ${e.message}`);
  }
}

/**
 * Logs a system heartbeat to the Session Stats Log to monitor pipeline health.
 * @param {string} scriptName - The name of the script or pipeline.
 * @param {string} status - The status, typically 'SUCCESS'.
 */
function logSystemHeartbeat(scriptName, status) {
  try {
    const ss = getMasterSpreadsheet();
    const sheet = ss.getSheetByName("5 Import - Session Stats Log");
    if (sheet) {
      sheet.appendRow([new Date(), scriptName, status]);
    } else {
      console.warn(`logSystemHeartbeat: Could not find '5 Import - Session Stats Log' tab.`);
    }
  } catch (e) {
    console.error(`logSystemHeartbeat failed: ${e.message}`);
  }
}

/**
 * Determines the best Gemini model to use based on the estimated token count of the payload.
 * Provides a fallback to the 2M context model (1.5 Pro) if the 1M reasoning flagship (3.1 Pro) is insufficient.
 * @param {string} payloadStr - The stringified payload to analyze.
 * @param {string} [preferredModel] - The default model if tokens < 900k.
 * @returns {string} The recommended model name.
 */
function selectModelForPayload(payloadStr, preferredModel) {
  if (typeof payloadStr !== 'string') return preferredModel || SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO;
  
  // High-level estimation (4 chars per token).
  const estimatedTokens = payloadStr.length / 4;
  const buffer = 100000; // 100k safety buffer
  const tier1Limit = 1000000 - buffer;

  if (estimatedTokens > tier1Limit) {
    console.warn(`Payload estimated at ${Math.round(estimatedTokens)} tokens. This exceeds the 1M limit of Tier 1 models. Diverting to Tier 2 (2M Context) model: ${SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_2M_RETRO}`);
    return SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_2M_RETRO;
  }
  
  return preferredModel || SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_PRO;
}

/**
 * Calls the Gemini AI API with the specified prompt and system instructions.
 * @param {string} promptText - The prompt to send to Gemini.
 * @param {string} modelName - The Gemini model to use.
 * @param {string} systemInstruction - The system instruction or context.
 * @param {Object} [schema] - An optional schema to force JSON formatting.
 * @returns {Object} The parsed JSON response from Gemini, or an error object.
 */
function callGemini(promptText, modelName, systemInstruction, schema) {
  if (typeof promptText !== 'string' || !promptText.trim()) {
    return { error: "callGemini failed: Invalid promptText provided." };
  }
  if (typeof modelName !== 'string' || !modelName.trim()) {
    return { error: "callGemini failed: Invalid modelName provided." };
  }
  if (typeof systemInstruction !== 'string') {
    return { error: "callGemini failed: Invalid systemInstruction provided." };
  }

  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.SECRETS) {
    return { error: "callGemini failed: SYSTEM_CONFIG or SYSTEM_CONFIG.SECRETS is undefined." };
  }

  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) return { error: "Missing GEMINI_API_KEY" };

  let currentModelName = modelName;
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModelName}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: Array.isArray(promptText) ? promptText : [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  if (schema) {
    payload.generationConfig.responseSchema = schema;
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let delay = 5000; // Start with a 5 second backoff
  for (let i = 0; i < 4; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();

      if (statusCode === 200) {
        const json = JSON.parse(response.getContentText());
        if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts.length > 0) {
          let resultText = json.candidates[0].content.parts[0].text;
          try {
            resultText = resultText.replace(/^```[a-z]*\n?/im, "").replace(/\n?```$/im, "").trim();
            const match = resultText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (match) resultText = match[0];
            resultText = resultText.replace(/,\s*([\}\]])/g, "$1");
            const parsed = JSON.parse(resultText);
            if (typeof parsed === 'object' && parsed !== null) {
              parsed._raw_tokens = json.usageMetadata ? json.usageMetadata.totalTokenCount : 0;
            }
            return parsed;
          } catch (parseErr) {
            console.error(`callGemini failed to parse JSON response: ${parseErr.message}`);
            return { error: `callGemini failed to parse JSON response: ${parseErr.message}` };
          }
        } else {
          return { error: "callGemini response payload is missing candidate parts." };
        }
      } else if (statusCode === 429 || statusCode >= 500) {
        console.warn(`Gemini Error ${statusCode} on ${currentModelName} (Attempt ${i+1}/4): ${response.getContentText()}`);
        if (i < 3) {
          console.log(`Waiting ${delay}ms before retrying...`);
          Utilities.sleep(delay);
          delay *= 2; // 5s -> 10s -> 20s
        }
      } else {
        return { error: `HTTP ${statusCode}: ${response.getContentText()}` };
      }
    } catch(e) {
      console.warn(`UrlFetchApp exception on attempt ${i+1}/4: ${e.message}`);
      if (i === 3) return { error: e.message };
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return { error: `Exhausted retries due to API errors on model: ${currentModelName}` };
}

/**
 * Retrieves and logs the IDs for all Google Task lists.
 * @returns {void}
 */
function getMyTaskListIds() {
  try {
    const listsResponse = Tasks.Tasklists.list();
    if (listsResponse && listsResponse.items) {
      console.log("=== YOUR GOOGLE TASK LIST IDs ===");
      listsResponse.items.forEach(list => {
        console.log(`${list.title}: ${list.id}`);
      });
      console.log("=================================");
    } else {
      console.error("getMyTaskListIds failed: No items found or Tasks API unavailable.");
    }
  } catch (e) {
    console.error(`getMyTaskListIds failed: ${e.message}`);
  }
}

/**
 * Runs a safe dry-run for Task Master, extracting data and hitting Gemini without modifying real Google Tasks.
 * @returns {void}
 */


let _cachedActiveThreadTaskMap = null;

/**
 * Retrieves a map of active Google Tasks from both the ToDo and Importer lists.
 * Implements internal memoization to avoid redundant API calls during the same execution.
 * @returns {Object} A map containing task indices grouped by Thread ID, Title, and ID.
 */
function getActiveThreadTaskMap() {
  if (_cachedActiveThreadTaskMap) {
    return _cachedActiveThreadTaskMap;
  }

  const map = { byThread: {}, byTitle: {}, byId: {}, openTasksForAI: [] };
  const lists = [SYSTEM_CONFIG.TASKS.TODO_LIST_ID, SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID];
  
  lists.forEach(listId => {
    let pageToken;
    do {
      try {
        const res = Tasks.Tasks.list(listId, {
           showCompleted: false, 
           showHidden: false, showAssigned: true, 
           maxResults: 100, 
           pageToken: pageToken
        });
        const items = res.items || [];
        items.forEach(t => {
          map.byId[t.id] = { taskId: t.id, listId: listId, taskObj: t };
          if (t.title) {
              map.byTitle[t.title.toLowerCase().trim()] = { taskId: t.id, listId: listId, taskObj: t };
              map.openTasksForAI.push(`ID: ${t.id} | Title: ${t.title}`);
          }
          if (t.notes) {
            // Find the thread ID at the end of the URL
            const match = t.notes.match(/https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/([a-zA-Z0-9]+)/);
            if (match) map.byThread[match[1]] = { taskId: t.id, listId: listId, taskObj: t };
          }
        });
        pageToken = res.nextPageToken;
      } catch (e) {
        console.error(`Failed to fetch tasks for duplicate prevention mapping: ${e.message}`);
        pageToken = null;
      }
    } while (pageToken);
  });

  _cachedActiveThreadTaskMap = map;
  return map;
}

let _cachedDocTexts = {};

/**
 * Safely fetches the text content of a Google Document or File by ID.
 * Falls back to fetching the raw blob as string if DocumentApp fails.
 * Memoizes results to prevent redundant document loads in a single run.
 * @param {string} id - The ID of the Google Drive document.
 * @returns {string} The text content of the document.
 */
function getSafeDocText(id) {
  if (!id) return "";
  if (_cachedDocTexts[id] !== undefined) {
    return _cachedDocTexts[id];
  }
  let text = "";
  try {
    text = DocumentApp.openById(id).getBody().getText();
  } catch (e) {
    try {
      const file = DriveApp.getFileById(id);
      const mime = file.getMimeType();
      if (mime === MimeType.GOOGLE_SHEETS) {
        console.warn(`getSafeDocText: Skipping getDataAsString() for unsupported MIME type (Google Sheets) on file ID ${id}.`);
      } else {
        text = file.getBlob().getDataAsString();
      }
    } catch (err) {
      console.error(`Failed to fetch file/doc ${id}: ${err.message}`);
    }
  }
  const processed = processPromptText(text);
  _cachedDocTexts[id] = processed;
  return processed;
}

/**
 * Helper to fetch the taxonomy JSON string from Drive.
 * @returns {string} The raw taxonomy JSON string.
 */
function getTaxonomyStr() {
  return getSafeDocText(SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID);
}

/**
 * Helper to fetch the Drive instructions document text.
 * @returns {string} The instructions document text.
 */
function getDrivePromptStr() {
  return getSafeDocText(SYSTEM_CONFIG.DOCS.CLERK_DRIVE_INSTRUCTIONS);
}

let _cachedIsWorkAccount = null;

/**
 * Checks if the executing account is the PMT account (daniel@playmetech.net).
 * Memoized to prevent redundant PropertiesService and Session API calls.
 * @returns {boolean} True if PMT account, false otherwise.
 */
function isPmtAccount() {
  if (_cachedIsWorkAccount !== null) {
    return _cachedIsWorkAccount;
  }
  
  try {
    const props = typeof PropertiesService !== 'undefined' ? PropertiesService.getUserProperties() : null;
    if (props) {
      if (props.getProperty("IS_WORK_ACCOUNT") === "true") {
        _cachedIsWorkAccount = true;
        return true;
      }
      const folderId = props.getProperty("WORKSPACE_FOLDER_ID");
      if (folderId === "1Jb5PhZnrqsP3uoUE20Lv75eO4zySPyTr" || folderId === "1W1VyU1ANNNgoq3KrIq1spT_DOpDFyq3A") {
        _cachedIsWorkAccount = true;
        return true;
      }
    }
  } catch(e) {
    console.warn(`isPmtAccount: Failed to fetch user properties - ${e.message}`);
  }
  try {
    const scriptProps = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
    if (scriptProps) {
      const folderId = scriptProps.getProperty("WORKSPACE_FOLDER_ID");
      if (folderId === "1Jb5PhZnrqsP3uoUE20Lv75eO4zySPyTr" || folderId === "1W1VyU1ANNNgoq3KrIq1spT_DOpDFyq3A") {
        _cachedIsWorkAccount = true;
        return true;
      }
    }
  } catch(e) {
    console.warn(`isPmtAccount: Failed to fetch script properties - ${e.message}`);
  }
  try {
    var email = Session.getEffectiveUser().getEmail();
    const result = !!(email && (email.indexOf("playmetech.net") !== -1 || email.indexOf("playmetech.com") !== -1 || email.indexOf("work") !== -1));
    _cachedIsWorkAccount = result;
    return result;
  } catch(e) {
    _cachedIsWorkAccount = false;
    return false;
  }
}

/**
 * Dynamically translates LOS references to PMTOS references when running on the PMT account.
 * 
 * @param {string} textStr The prompt template text.
 * @returns {string} The translated prompt template text.
 */
function processPromptText(textStr) {
  if (!textStr) return "";
  if (typeof isPmtAccount === 'function' && isPmtAccount()) {
    let pmtStr = textStr
      .replace(/\bLife Organisation System \(LOS\)/g, "Playmetech Organisation System (PMTOS)")
      .replace(/\bLife Organisation System\b/g, "Playmetech Organisation System")
      .replace(/\bLOS_Taxonomy\b/g, "PMTOS_Taxonomy")
      .replace(/\bLOS taxonomy\b/g, "PMTOS taxonomy")
      .replace(/\bLOS Taxonomy\b/g, "PMTOS Taxonomy")
      .replace(/\bLOS\b/g, "PMTOS")
      .replace(/\blos\b/g, "wos");
      
    pmtStr += "\n\n[SYSTEM DIRECTIVE: STRICT PMTOS BOUNDARY]\nYou are operating exclusively within the Playmetech Organisation System (PMTOS). Do NOT reference or route files to private/personal LOS categories. All operations must remain strictly within the 01-05 PMTOS business boundaries.";
    return pmtStr;
  } else {
    let losStr = textStr;
    losStr += "\n\n[SYSTEM DIRECTIVE: PMTOS BRIDGE]\nWhile operating in the Life Organisation System (LOS), be aware that Playmetech business files are physically separated into the PMTOS. However, Daniel's personal employment contracts and Playmetech employment documents must be routed across the bridge to the exact label: '02 Work/01 Employment/01 Playmetech/01 Playmetech Admin/Contract, Personal Documents'.";
    return losStr;
  }
}

/**
 * Resolves the Google Drive File ID for the 1 Day Execution Plan.
 * @returns {string} The Google Drive File ID.
 */
function getExecutionPlanId() {
  return SYSTEM_CONFIG.GENERATED_OUTPUTS.DAY_1_EXECUTION_PLAN;
}

/**
 * Unifies the grammar and generation of task notes across The Clerk suite.
 * 
 * @param {string} sourceUrl The source URL.
 * @param {string} sourceName The display name or category path of the source.
 * @param {string} existingNotes Any existing task notes.
 * @param {Object} metadata The system metadata to append.
 * @param {string} [sysComment="SYS: Pending initial review."] System routing comments.
 * @param {string} [daComment="DA:"] User directives or comments.
 * @param {string} [contextPrefix="[Source: "] The prefix for the source name (e.g. "Context: " or "[Source: ").
 * @param {string} [contextSuffix="]"] The suffix for the source name.
 * @returns {string} The fully serialized task notes.
 */
function buildTaskNotes(sourceUrl, sourceName, existingNotes, metadata, sysComment = "SYS: Pending initial review.", daComment = "DA:", contextPrefix = "[Source: ", contextSuffix = "]") {
  const baseNotes = `${sourceUrl}\n${contextPrefix}${sourceName}${contextSuffix}\n\n${existingNotes || ""}\n\n${sysComment}\n${daComment}\n\n`;
  return `${baseNotes}---SYSTEM_METADATA---\n${JSON.stringify(metadata)}`;
}

/**
 * Parses a standard task notes string into its components.
 * 
 * @param {string} rawNotes The full task notes string.
 * @returns {Object} Parsed components: { cleanNotes, metadata, sysComment, daComment, baseNotes }
 */
function parseTaskNotes(rawNotes) {
  rawNotes = rawNotes || "";
  let metadata = {};
  
  const metaSplit = rawNotes.split('---SYSTEM_METADATA---');
  const baseNotes = metaSplit[0];
  let cleanNotes = baseNotes;
  
  if (metaSplit.length > 1) {
    try {
       metadata = JSON.parse(metaSplit[1].trim());
    } catch(e) {}
  }
  
  const sysMatch = cleanNotes.match(/^SYS:\s*(.*)$/m);
  const sysComment = sysMatch ? sysMatch[1].trim() : "";
  
  const daMatch = cleanNotes.match(/^DA:\s*(.*)$/m);
  const daComment = daMatch ? daMatch[1].trim() : "";
  
  return {
    baseNotes: baseNotes,
    cleanNotes: cleanNotes.trim(),
    metadata: metadata,
    sysComment: sysComment,
    daComment: daComment
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.parseTaskNotes = parseTaskNotes;
  globalThis.buildTaskNotes = buildTaskNotes;
}
