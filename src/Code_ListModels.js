/**
 * THE SYSTEM: GEMINI MODEL EXPORTER
 * Fetches available Gemini models from the API and populates the dedicated sheet tab.
 */
function updateModelList() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID"));
  const targetGid = 1704335578;
  const sheets = ss.getSheets();
  let sheet = null;
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == targetGid) {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) throw new Error("Target sheet with GID " + targetGid + " not found.");

  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || PropertiesService.getScriptProperties().getProperty("gemini_api_key");
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

  const jsonOutput = [];

  // Map JSON to Rows
  models.forEach(model => {
    let modelId = model.name.replace("models/", "");
    tableData.push([
      modelId, 
      model.version || "N/A",
      model.displayName || "",
      model.description || "",
      model.inputTokenLimit || 0,
      model.outputTokenLimit || 0,
      model.thinking ? "Yes" : "No"
    ]);

    jsonOutput.push({
      id: modelId,
      version: model.version || "N/A",
      displayName: model.displayName || "",
      description: model.description || "",
      inputLimit: model.inputTokenLimit || 0,
      outputLimit: model.outputTokenLimit || 0,
      thinking: model.thinking ? true : false
    });
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
  
  // Export to Google Drive as JSON
  const TARGET_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("WORKSPACE_FOLDER_ID"); // Main Docs Workspace
  const fileName = "Actual_Gemini_Models.json";
  
  try {
    const targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const jsonBlob = Utilities.newBlob(JSON.stringify(jsonOutput, null, 2), "application/json", fileName);
    
    const existingFiles = targetFolder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setContent(jsonBlob.getDataAsString());
    } else {
      targetFolder.createFile(jsonBlob);
    }
    console.log(`Successfully updated ${models.length} models and exported to Drive.`);
  } catch (e) {
    console.error("Failed to write JSON to Drive: " + e.message);
  }
}
