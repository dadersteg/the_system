// ==========================================
// SYSTEM CONFIGURATION
// Centralized configuration for all Google Apps Script files.
// ==========================================

const SYSTEM_CONFIG = {
  // 1. SENSITIVE SECRETS (Fetched dynamically from Script Properties)
  SECRETS: {
    GEMINI_API_KEY: PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"),
    GEMINI_MODEL_PRO: PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL_PRO") || "gemini-pro-latest",
    GEMINI_MODEL_FLASH: PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL_FLASH") || "gemini-flash-lite-latest",
    GEMINI_RETRO_MODEL: PropertiesService.getScriptProperties().getProperty("GEMINI_RETRO_MODEL") || "gemini-flash-latest",
  },
  
  // 2. ROOT SYSTEM IDs (Fetched from Script Properties to prevent leaking)
  ROOTS: {
    MASTER_SHEET_ID: PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID"),
    WORKSPACE_FOLDER_ID: PropertiesService.getScriptProperties().getProperty("WORKSPACE_FOLDER_ID"),
    DRIVE_RETRO_ROOT_ID: PropertiesService.getScriptProperties().getProperty("DRIVE_RETRO_ROOT_ID"),
  },
  
  // 3. STRUCTURAL IDs (Hardcoded here so they are easily version-controlled in GitHub)
  DOCS: {
    TASK_MASTER_PROMPT_ID: "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar",
    TAXONOMY_DOC_ID: "1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf",
    PROMPT_VANTAGE: "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
    PERSONAL_GOALS_FILE_ID: "", 
    WORK_GOALS_FILE_ID: ""      
  },
  
  TASKS: {
    IMPORTER_LIST_ID: "MDI4NDE2MzU3Nzc0OTkzOTU4NzQ6MDow",
    TODO_LIST_ID: "RWNzLU50Qmp1QUZpalhqSg",
    BACKLOG_LIST_ID: "RVVPcGdsYkQ2WV90bzhOcA",
    TO_BE_DELETED_LIST_ID: "QWkyNE1sdlVXMzMwbjhFQw"
  },
  
  SHEET_GIDS: {
    TASK_REVIEW: "1580572397",
    LOS_TAXONOMY: "1287896098",
    EMAIL_RULES_RECEIVER: "1799689202",
    EXECUTION_LOG: "2140417240", // From Task Pipeline
    DRIVE_LOG: "809034738",      // If used
    EMAIL_LOG: "2131515996"      // If used
  },
  
  STATE: {
    THREAD_STATE: PropertiesService.getScriptProperties().getProperty("THREAD_STATE"),
    TAXONOMY_SYNC_INDEX: PropertiesService.getScriptProperties().getProperty("TAXONOMY_SYNC_INDEX") || "0",
    ACTIVE_BATCH_JOB: PropertiesService.getScriptProperties().getProperty("ACTIVE_BATCH_JOB"),
    ACTIVE_BATCH_MANIFEST: PropertiesService.getScriptProperties().getProperty("ACTIVE_BATCH_MANIFEST")
  }
};
