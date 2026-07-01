/**
 * @file src/Code_ListModels.js
 * @description THE SYSTEM: GEMINI MODEL EXPORTER. Fetches available Gemini models from the API, populates the dedicated sheet tab, and exports to Google Drive as JSON.
 * @version 1.0.1
 * @last_modified 2026-06-19
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Injected comprehensive JSDoc docstrings, standardized variable casing, and verified syntax.
 * - 1.0.0: Initial version.
 */

/**
 * Fetches available Gemini models from the generative language API, writes the results
 * into the configured Gemini Models spreadsheet, and exports a JSON backup to Google Drive.
 *
 * @returns {void}
 * @throws {Error} If the target sheet cannot be found or the API request fails.
 */
function updateModelList() {
  const ss = getMasterSpreadsheet();
  const targetGid = parseInt(SYSTEM_CONFIG.SHEETS.GEMINI_MODELS, 10);
  const sheets = ss.getSheets();
  
  const sheet = sheets.find(s => s.getSheetId() === targetGid);
  if (!sheet) throw new Error("Target sheet with GID " + targetGid + " not found.");

  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing Gemini API Key in Script Properties");
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  if (response.getResponseCode() !== 200) {
      throw new Error("Failed to fetch models: " + response.getContentText());
  }
  
  const json = JSON.parse(response.getContentText());
  const models = json.models;

  // Prepare Table Headers
  const tableData = [["Model ID (Copy this)", "Version", "Display Name", "Description", "Input Limit", "Output Limit", "Thinking"]];

  // Map JSON to Rows and Data
  const jsonOutput = models.map(model => {
    const modelId = model.name.replace("models/", "");
    
    tableData.push([
      modelId, 
      model.version || "N/A",
      model.displayName || "",
      model.description || "",
      model.inputTokenLimit || 0,
      model.outputTokenLimit || 0,
      model.thinking ? "Yes" : "No"
    ]);

    return {
      id: modelId,
      version: model.version || "N/A",
      displayName: model.displayName || "",
      description: model.description || "",
      inputLimit: model.inputTokenLimit || 0,
      outputLimit: model.outputTokenLimit || 0,
      thinking: model.thinking ? true : false
    };
  });

  // Write to Sheet
  sheet.clear();
  const range = sheet.getRange(1, 1, tableData.length, tableData[0].length);
  range.setValues(tableData);
  
  // Format Headers
  const headerRange = sheet.getRange(1, 1, 1, tableData[0].length);
  headerRange.setFontWeight("bold"); 
  headerRange.setBackground("#f3f3f3");
  
  sheet.autoResizeColumns(1, tableData[0].length);
  
  // Export to Google Drive as Markdown
  try {
    const fileId = SYSTEM_CONFIG.DOCS.GEMINI_MODELS_JSON_ID;
    
    let mdString = "# Actual Gemini Models\n\n";
    mdString += "This document contains the latest technical specifications and context windows of the Gemini model ecosystem.\n\n";
    
    jsonOutput.forEach(model => {
      mdString += `## ${model.displayName || model.id}\n`;
      mdString += `- **ID**: \`${model.id}\`\n`;
      mdString += `- **Version**: ${model.version}\n`;
      mdString += `- **Description**: ${model.description}\n`;
      mdString += `- **Input Limit**: ${model.inputLimit} tokens\n`;
      mdString += `- **Output Limit**: ${model.outputLimit} tokens\n`;
      mdString += `- **Thinking Capabilities**: ${model.thinking ? 'Yes' : 'No'}\n\n`;
    });
    
    const file = DriveApp.getFileById(fileId);
    file.setName("Actual_Gemini_Models.md");
    file.setContent(mdString);
    console.log(`Successfully updated ${models.length} models and exported as Markdown to Drive ID: ${fileId}.`);
  } catch (e) {
    console.error("Failed to write Markdown to Drive: " + e.message);
  }
}

/**
 * Fetches available Gemini models from the generative language API for CLI usage.
 *
 * @returns {Array<string>|string} An array of model names on success, or an error message string on failure.
 */
function getModelsForCLI() {
  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  const data = JSON.parse(response.getContentText());
  if (data.models) {
    return data.models.map(m => m.name);
  }
  return "Error: " + response.getContentText();
}
