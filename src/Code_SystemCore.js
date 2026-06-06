/**
 * @file src/Code_SystemCore.js
 * @description System core utilities providing centralized AI functions, system triggers, and testing functions.
 *
 * @version 1.0.0
 * @last_modified 2026-05-04
 * @modified_by Jules
 *
 * @changelog
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
    _cachedMasterSheet = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
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

    console.log(`[INIT] Found ${triggers.length} existing triggers. Wiping slate clean for ${IS_WORK_ENV ? 'WORK' : 'PRIVATE'} environment...`);
    for (let i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }

    // ========================================================
    // 1. THE CLERK (Email, Drive, Notes Extraction Engine)
    // ========================================================
    ScriptApp.newTrigger("runTheClerkEmailOngoing").timeBased().everyMinutes(10).create();
    ScriptApp.newTrigger("runTheClerkDriveOngoing").timeBased().everyMinutes(1).create();
    ScriptApp.newTrigger("runTheClerkNotes").timeBased().everyMinutes(15).create();

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
    ScriptApp.newTrigger("exportTriageTasksToDrive").timeBased().everyDays(1).atHour(2).create();

    // ========================================================
    // 4. EXCLUDED PIPELINES (Managed by Python / User)
    // ========================================================
    // The following scripts are explicitly idled because the local MacMini 
    // Python script (sync_tasks_combined.py) manages the markdown generation 
    // and bi-directional cross-LOS routing autonomously.
    // 
    // - extractTasksWithConversationDetails
    // - syncRevisionsToTasks
    // - run1DayTaskMaintenance
    // - runTheClerkDriveRetro

    console.log(`[SUCCESS] All valid system triggers have been provisioned for the ${IS_WORK_ENV ? 'WORK' : 'PRIVATE'} environment.`);
  } catch (e) {
    console.error(`setupSystemTriggers failed: ${e.message}`);
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
    contents: [{ parts: [{ text: promptText }] }],
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
          const resultText = json.candidates[0].content.parts[0].text;
          return JSON.parse(resultText);
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
function testTaskMasterDryRun() {
  try {
    console.log("Starting DRY RUN of Task Master...");
    const now = new Date();

    if (typeof extractCalendarCapacity !== 'function' ||
        typeof extractTasksBacklog !== 'function' ||
        typeof getSystemGoals !== 'function' ||
        typeof callTaskMasterAI !== 'function' ||
        typeof updateOnePagerMarkdown !== 'function') {
      console.error("testTaskMasterDryRun failed: Required global functions are not defined.");
      return;
    }

    const capacityData = extractCalendarCapacity(now);
    const taskData = extractTasksBacklog();
    const goalsData = getSystemGoals();

    const payload = {
      currentTime: now.toISOString(),
      goals: goalsData,
      capacity: capacityData,
      tasks: taskData
    };

    console.log("Fetching AI recommendations...");
    const aiResponse = callTaskMasterAI(payload);
    if (!aiResponse) {
      console.error("testTaskMasterDryRun: AI response is empty.");
      return;
    }

    console.log("=== AI RECOMMENDED TASK UPDATES (SKIPPED) ===");
    console.log(JSON.stringify(aiResponse.taskUpdates || {}, null, 2));

    console.log("=== ONE-PAGER PRIORITY OUTPUT ===");
    console.log(aiResponse.onePagerMarkdown || "");

    if (aiResponse.onePagerMarkdown) {
      updateOnePagerMarkdown(aiResponse.onePagerMarkdown);
      console.log("Dry run complete. Check Google Drive for the One-Pager.");
    } else {
      console.error("testTaskMasterDryRun: onePagerMarkdown is missing from the response.");
    }
  } catch (e) {
    console.error(`testTaskMasterDryRun failed: ${e.message}`);
  }
}

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

/**
 * Safely fetches the text content of a Google Document or File by ID.
 * Falls back to fetching the raw blob as string if DocumentApp fails.
 * @param {string} id - The ID of the Google Drive document.
 * @returns {string} The text content of the document.
 */
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
      text = DriveApp.getFileById(id).getBlob().getDataAsString();
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
 * Checks if the executing account is the Work account (daniel@playmetech.net).
 * Memoized to prevent redundant PropertiesService and Session API calls.
 * @returns {boolean} True if Work account, false otherwise.
 */
function isWorkAccount() {
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
    // Ignore
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
    // Ignore
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
 * Dynamically translates LOS references to WoS references when running on the Work account.
 * 
 * @param {string} textStr The prompt template text.
 * @returns {string} The translated prompt template text.
 */
function processPromptText(textStr) {
  if (!textStr) return "";
  if (typeof isWorkAccount === 'function' && isWorkAccount()) {
    return textStr
      .replace(/\bLife Organisation System \(LOS\)/g, "Work Organisation System (WoS)")
      .replace(/\bLife Organisation System\b/g, "Work Organisation System")
      .replace(/\bLOS_Taxonomy\b/g, "PMTOS_Taxonomy")
      .replace(/\bLOS taxonomy\b/g, "WoS taxonomy")
      .replace(/\bLOS Taxonomy\b/g, "WoS Taxonomy")
      .replace(/\bLOS\b/g, "WoS")
      .replace(/\blos\b/g, "wos");
  }
  return textStr;
}

/**
 * Resolves the Google Drive File ID for the 1 Day Execution Plan.
 * Dynamically queries and saves the ID to UserProperties if not set.
 * @returns {string} The Google Drive File ID.
 */
function getExecutionPlanId() {
  try {
    const props = PropertiesService.getUserProperties();
    let id = props.getProperty("EXECUTION_PLAN_ID");
    if (id && id.trim() !== "") {
      return id;
    }
    
    // Auto-discover the ID in the workspace folder
    const folderId = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
    if (!folderId) return null;
    
    const folder = DriveApp.getFolderById(folderId);
    const suffix = isWorkAccount() ? " (Work)" : " (Private)";
    const fileName = "TS - Task Master > 1 Day Execution Plan" + suffix + ".md";
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      id = file.getId();
      props.setProperty("EXECUTION_PLAN_ID", id);
      console.log(`Saved EXECUTION_PLAN_ID to UserProperties: ${id}`);
      return id;
    }
  } catch (e) {
    console.error("Error in getExecutionPlanId:", e.message);
  }
  return null;
}

