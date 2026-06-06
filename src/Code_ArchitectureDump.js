/**
 * Dumps the exact runtime system configuration to the Architecture Spreadsheet.
 */
function updateArchitectureSpreadsheet() {
  const SPREADSHEET_ID = "1OXe9YylGI3NDqbUs9Vfa6xtEKE-UBYcltdv_NRb1K3w";
  let ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    console.error("Could not open Architecture Spreadsheet: " + e.message);
    return;
  }

  const isWork = isWorkAccount();
  const profileColumn = isWork ? 4 : 3; // D for PMT, C for Private

  const updateCell = (sheetName, rowIndex, link) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    sheet.getRange(rowIndex, profileColumn).setValue(link);
  };

  const getDocLink = (id) => id && id !== "N/A" ? `https://docs.google.com/document/d/${id}/edit` : "N/A";
  const getSheetLink = (id) => id && id !== "N/A" ? `https://docs.google.com/spreadsheets/d/${id}/edit` : "N/A";
  const getFolderLink = (id) => id && id !== "N/A" ? `https://drive.google.com/drive/folders/${id}` : "N/A";
  const getFileLink = (id) => id && id !== "N/A" ? `https://drive.google.com/file/d/${id}/view` : "N/A";

  console.log("Updating Core Roots...");
  updateCell("Core Roots", 2, getSheetLink(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID));
  updateCell("Core Roots", 3, getFolderLink(SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID));
  updateCell("Core Roots", 4, getSheetLink(SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID));

  console.log("Updating Prompts & Instructions...");
  updateCell("Prompts & Instructions", 2, getDocLink(SYSTEM_CONFIG.DOCS.TASK_MASTER_DAILY_PROMPT_ID));
  updateCell("Prompts & Instructions", 3, getDocLink(SYSTEM_CONFIG.DOCS.TASK_MASTER_WEEKLY_PROMPT_ID));
  updateCell("Prompts & Instructions", 4, getDocLink(SYSTEM_CONFIG.DOCS.TASK_MASTER_MONTHLY_PROMPT_ID));
  updateCell("Prompts & Instructions", 5, getDocLink(SYSTEM_CONFIG.DOCS.TASK_MASTER_QUARTERLY_PROMPT_ID));
  updateCell("Prompts & Instructions", 6, getDocLink(SYSTEM_CONFIG.DOCS.PROMPT_VANTAGE));
  updateCell("Prompts & Instructions", 7, getDocLink(SYSTEM_CONFIG.DOCS.VANTAGE_CUSTOM_INSTRUCTIONS));
  updateCell("Prompts & Instructions", 8, getDocLink(SYSTEM_CONFIG.DOCS.TAXONOMY_DOC_ID));
  updateCell("Prompts & Instructions", 9, getFileLink(SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID));
  updateCell("Prompts & Instructions", 10, getDocLink(SYSTEM_CONFIG.DOCS.PERSONAL_GOALS_FILE_ID));
  updateCell("Prompts & Instructions", 11, getDocLink(SYSTEM_CONFIG.DOCS.WORK_GOALS_FILE_ID));
  updateCell("Prompts & Instructions", 12, getDocLink(SYSTEM_CONFIG.DOCS.CLERK_DRIVE_INSTRUCTIONS));
  updateCell("Prompts & Instructions", 13, getDocLink(SYSTEM_CONFIG.DOCS.CLERK_DRIVE_PROTOCOL));
  updateCell("Prompts & Instructions", 14, getDocLink(SYSTEM_CONFIG.DOCS.CLERK_EMAIL_PROMPT_ID));
  updateCell("Prompts & Instructions", 15, getDocLink(SYSTEM_CONFIG.DOCS.MASTER_ASSET_NAMING_PROTOCOL));
  updateCell("Prompts & Instructions", 16, getDocLink(SYSTEM_CONFIG.DOCS.AGENT_PROTOCOL_TIME_FRAMEWORKS));

  console.log("Updating Generated Outputs...");
  updateCell("Generated Outputs", 2, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.DAY_1_EXECUTION_PLAN));
  updateCell("Generated Outputs", 3, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.DAY_7_ROADMAP));
  updateCell("Generated Outputs", 4, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.DAY_28_STRATEGIC));
  updateCell("Generated Outputs", 5, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.DAY_84_STRATEGIC));
  updateCell("Generated Outputs", 6, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.TASKS_EXPORT));
  updateCell("Generated Outputs", 7, getDocLink(SYSTEM_CONFIG.GENERATED_OUTPUTS.TASKS_COMBINED_EXPORT));
  updateCell("Generated Outputs", 8, getFolderLink(SYSTEM_CONFIG.DOCS.RECENT_REFLECTIONS_ID));
  updateCell("Generated Outputs", 9, getFileLink(SYSTEM_CONFIG.DOCS.VANTAGE_LOG_ID));

  console.log("Updating Task Lists...");
  updateCell("Task Lists", 2, SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID);
  updateCell("Task Lists", 3, SYSTEM_CONFIG.TASKS.AI_REVIEW_LIST_ID);
  updateCell("Task Lists", 4, SYSTEM_CONFIG.TASKS.TODO_LIST_ID);
  updateCell("Task Lists", 5, SYSTEM_CONFIG.TASKS.TO_BE_DELETED_LIST_ID);
  updateCell("Task Lists", 6, SYSTEM_CONFIG.TASKS.RECURRING_LIST_ID);

  console.log("Architecture Spreadsheet successfully updated with live, evaluated IDs for " + (isWork ? "Work" : "Private") + " profile!");
}
