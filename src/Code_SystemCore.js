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

/**
 * Programmatically clears all existing triggers and provisions the master schedule.
 * Run this function once from the Apps Script editor to lock in the automated pipelines.
 * @returns {void}
 */
function setupSystemTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();

    console.log(`Found ${triggers.length} existing triggers. Wiping slate clean...`);
    for (let i = 0; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
    }

    // 1. The Clerk (Email) - Every 10 Minutes
    ScriptApp.newTrigger("runTheClerkEmailOngoing")
      .timeBased()
      .everyMinutes(10)
      .create();

    // 2. The Clerk (Drive Ongoing) - Every 1 Minute
    ScriptApp.newTrigger("runTheClerkDriveOngoing")
      .timeBased()
      .everyMinutes(1)
      .create();

    // 3. Task Execution Pipeline (Harmonizer) - Every 15 Minutes
    ScriptApp.newTrigger("runTaskExecutionPipeline")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 3b. Bi-Directional Task Export - Every 15 Minutes
    ScriptApp.newTrigger("extractTasksWithConversationDetails")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 3c. Bi-Directional Task Import (Spreadsheet to Tasks) - Every 15 Minutes
    ScriptApp.newTrigger("syncRevisionsToTasks")
      .timeBased()
      .everyMinutes(15)
      .create();

    // 4. Task Master Engine (D.5-D.7) - Every 1 Hour
    ScriptApp.newTrigger("runTaskMasterEngine")
      .timeBased()
      .everyHours(1)
      .create();

    // 4. Manual Revisions Sync (Email) - Every 1 Hour
    ScriptApp.newTrigger("applyManualRevisionsEmail")
      .timeBased()
      .everyHours(1)
      .create();

    // 5. Manual Revisions Sync (Drive) - Every 1 Hour
    ScriptApp.newTrigger("applyManualRevisionsDrive")
      .timeBased()
      .everyHours(1)
      .create();

    // 6. The Clerk (Drive Retro) - Every 2 Hours (Slow Burn)
    ScriptApp.newTrigger("runTheClerkDriveRetro")
      .timeBased()
      .everyHours(2)
      .create();

    console.log("SUCCESS: All system triggers have been provisioned according to the master schedule.");
  } catch (e) {
    console.error(`setupSystemTriggers failed: ${e.message}`);
  }
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

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

  let delay = 2000;
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
        Utilities.sleep(delay);
        delay *= 2;
      } else {
        return { error: `HTTP ${statusCode}: ${response.getContentText()}` };
      }
    } catch(e) {
      if (i === 3) return { error: e.message };
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return { error: "Exhausted retries due to 429/500 errors" };
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
