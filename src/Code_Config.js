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
    DRIVE_RULES_SHEET_ID: PropertiesService.getScriptProperties().getProperty("DRIVE_RULES_SHEET_ID") || PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID"),
  },
  
  // 3. STRUCTURAL IDs (Hardcoded here so they are easily version-controlled in GitHub)
  DOCS: {
    TASK_MASTER_PROMPT_ID: "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar",
    PROMPT_TASKMASTER_OLD: "1BgYouMZhPq9XPj73fxQZRCfrSTwWfvehdYzll5YuNVw", // Fallback for old prompt reference
    PROMPT_TASKMASTER_DOC_ID: PropertiesService.getScriptProperties().getProperty("PROMPT_TASKMASTER_DOC_ID") || "1_qa0MsqPL6KLea8UJkwBzw2KzWO9WNNe",
    TAXONOMY_DOC_ID: "1CWiCihx-aR9U-UBh04F6XjITfB8aSxrf",
    TAXONOMY_JSON_ID: "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
    PROMPT_VANTAGE: "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
    PERSONAL_GOALS_FILE_ID: "1bj6AmZRRaHh4r2fBG2A9V1rtnXa707Qg", 
    WORK_GOALS_FILE_ID: "14k8NX8vLdA7EjEujYRk0a0V3UKCLfI1I",
    CLERK_DRIVE_INSTRUCTIONS: "1BgYouMZhPq9XPj73fxQZRCfrSTwWfvehdYzll5YuNVw",
    CLERK_DRIVE_PROTOCOL: "1rL1zqmSbzm9jjz2gJ2dewHxBRwX-cWIgN9gy3L-4idI"
  },
  
  TASKS: {
    IMPORTER_LIST_ID: "MDI4NDE2MzU3Nzc0OTkzOTU4NzQ6MDow",
    TODO_LIST_ID: "RWNzLU50Qmp1QUZpalhqSg",
    BACKLOG_LIST_ID: "RVVPcGdsYkQ2WV90bzhOcA",
    TO_BE_DELETED_LIST_ID: "QWkyNE1sdlVXMzMwbjhFQw",
    TASK_MASTER_INDEX: PropertiesService.getScriptProperties().getProperty("TASK_MASTER_INDEX") || "0"
  },
  
  SHEET_GIDS: {
    TASK_REVIEW: "1580572397",
    LOS_TAXONOMY: "1287896098",
    EMAIL_RULES_RECEIVER: "1799689202",
    EXECUTION_LOG: "2140417240", // From Task Pipeline
    DRIVE_LOG: "809034738",      // If used
    EMAIL_LOG: "2131515996",      // If used
    LABEL_MANAGEMENT: "1007497112",
    ALIAS_WHITELIST: "1799689202",
    EMAIL_RETRO_LOG: "67786861",
    EMAIL_SUBJECT_RULES: "631446789",
    EMAIL_SENDER_RULES: "1679876125",
    COMPLETED_TASKS_LOG: "1559346038",
    MAPPER: "536537641",
    RESET: "1835375017",
    CLEANUP: "1593358623",
    DRIVE_SESSION_LOG: "1657749758",
    DRIVE_FILENAME_RULES: "938516466",
    DRIVE_FOLDER_RULES: "1297520241"
  },
  
  STATE: {
    THREAD_STATE: PropertiesService.getScriptProperties().getProperty("THREAD_STATE"),
    TAXONOMY_SYNC_INDEX: PropertiesService.getScriptProperties().getProperty("TAXONOMY_SYNC_INDEX") || "0",
    ACTIVE_BATCH_JOB: PropertiesService.getScriptProperties().getProperty("ACTIVE_BATCH_JOB"),
    ACTIVE_BATCH_MANIFEST: PropertiesService.getScriptProperties().getProperty("ACTIVE_BATCH_MANIFEST")
  },

  DRIVE_FOLDERS: {
    STND_SOURCES: ["1XossC1cdOZE82efew3qH48LJnhl6ng4i", "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", "17uUH01ihipNeRfTQQcD61zzjORpWFCRY"],
    STND_DEST: "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb",
    REVIEW: "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY",
    REVIEW_RETRO: "1_8KvOZLpconYgc16-s6_uD8iCMlwVzd0"
  }
};
