/**
 * @file Code_Config.js
 * @description Centralized configuration mapping for all Google Apps Script files in The System framework.
 *
 * @version 1.1.0
 * @last_modified 2026-06-05
 * @changelog
 * - 1.1.0: V12 Architecture mapping (Private vs PMT isolated logic)
 */

// ==========================================
// SYSTEM CONFIGURATION
// Centralized configuration for all Google Apps Script files.
// ==========================================

let _userPropertiesCache = null;
let _scriptPropertiesCache = null;

const getEnvProp = (key) => {
  try {
    if (_userPropertiesCache === null) {
      _userPropertiesCache = (typeof PropertiesService !== 'undefined') ? (PropertiesService.getUserProperties().getProperties() || {}) : {};
    }
    const val = _userPropertiesCache[key];
    if (val !== undefined && val !== null && val !== "") return val;
  } catch(e) {
    console.warn(`Failed to read user properties batch: ${e.message}`);
  }
  
  try {
    if (_scriptPropertiesCache === null) {
      _scriptPropertiesCache = (typeof PropertiesService !== 'undefined') ? (PropertiesService.getScriptProperties().getProperties() || {}) : {};
    }
    const val = _scriptPropertiesCache[key];
    if (val !== undefined && val !== null && val !== "") return val;
  } catch(e) {
    console.warn(`Failed to read script properties batch: ${e.message}`);
  }
  return null;
};



const IS_PMT_ENV = (getEnvProp("ENV") === "WORK");

const SYSTEM_CONFIG = {
  SECRETS: {
    GEMINI_API_KEY: getEnvProp("GEMINI_API_KEY"),
    GEMINI_MODEL_PRO: "gemini-pro-latest",
    GEMINI_MODEL_FLASH: "gemini-flash-latest",
    GEMINI_MODEL_FLASH_LITE: "gemini-flash-lite-latest",
    GEMINI_RETRO_MODEL: "gemini-flash-lite-latest",
    GEMINI_MODEL_2M_RETRO: "gemini-pro-latest",
  },
  
  ROOTS: {
    MASTER_SHEET_ID: IS_PMT_ENV ? "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
    WORKSPACE_FOLDER_ID: IS_PMT_ENV ? "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx" : "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc",
    DRIVE_RULES_SHEET_ID: IS_PMT_ENV ? "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
    HABITS_SHEET_ID: IS_PMT_ENV ? "1V-w6QtL9e16nnWdi5m58U0iPxfuIVfmyMrHrfZk9iI8" : "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo",
    DRIVE_RETRO_ROOT_ID: IS_PMT_ENV ? "" : "",
  },
  
  DOCS: {
    TASK_MASTER_PROMPT_ID: "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar",
    TASK_MASTER_DAILY_PROMPT_ID: "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW",
    TASK_MASTER_WEEKLY_PROMPT_ID: "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb",
    TASK_MASTER_MONTHLY_PROMPT_ID: "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf",
    TASK_MASTER_QUARTERLY_PROMPT_ID: "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2",
    VANTAGE_LOG_ID: "1Pk_hMSx9-VGGW0Kv77Z30dPztg3wEhAE",
    RECENT_REFLECTIONS_ID: IS_PMT_ENV ? "1okMRrvTSoHg6Hudi0tHniP5Vjnt_PFTE" : "1Ot9fJ5P-Z_O6BOIlWZ2L_oyCIw6Ixeet",
    TAXONOMY_DOC_ID: IS_PMT_ENV ? "1gFvlLGijJ2Z1wbK8L32SFakH66yGXVUo" : "142r2YeV5v209crHS5J5HvWr1s4TOnexp",
    TAXONOMY_JSON_ID: IS_PMT_ENV ? "1txdOFb0fWHc5CrfTkyaG9L_9ucRa7wZ3" : "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
    PROMPT_VANTAGE: "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
    VANTAGE_CUSTOM_INSTRUCTIONS: "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC",
    PERSONAL_GOALS_FILE_ID: "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD",
    WORK_GOALS_FILE_ID: "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N",
    CLERK_DRIVE_INSTRUCTIONS: "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U",
    CLERK_DRIVE_PROTOCOL: "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk",
    CLERK_EMAIL_PROMPT_ID: "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ",
    MASTER_ASSET_NAMING_PROTOCOL: IS_PMT_ENV ? "18vdXyMd4AK5FAqS9fPRDIA1nOIjN12vN" : "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn",
    AGENT_PROTOCOL_TIME_FRAMEWORKS: "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm",
    SYSTEM_ARCHITECTURE_OVERVIEW_ID: "1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8"
  },
  
  GENERATED_OUTPUTS: {
    DAY_1_EXECUTION_PLAN: IS_PMT_ENV ? "1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7" : "1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq",
    DAY_7_ROADMAP: IS_PMT_ENV ? "18rIhK5SX4gS9rNQNvYkXkMFCCVqKcLO_YNJFqqcqEnA" : "1V_iybOjHzp4S9UdTHKWj4QlK-wDUsAU3",
    DAY_28_STRATEGIC: IS_PMT_ENV ? "1TcHyODoMm5zziuu6COD86qQroOFyMz05KtddAEsb0bY" : "1B2jahfmNQt8iwPWHCXnFYwDirJWkyt3u",
    DAY_84_STRATEGIC: IS_PMT_ENV ? "1P0LgSK70Ztn772hrHtTOK7s8IM55llxnaVk_AeZuthA" : "1arJFUz4LPw4SaEfN6aY-0dYUS5ifKD7R",
    TASKS_EXPORT: IS_PMT_ENV ? "1OaW3uaTB7edPYQFXNFzMpvxqlUvCRMG2" : "1FaFZPlbF7vCFRJqF0dS7lA4Zx6_lcgty",
    TASKS_COMBINED_EXPORT: "1fs00OCWVi0kGY404b0Ew_alfd3B4c4Wi"
  },
  
  TASKS: {
    IMPORTER_LIST_ID: IS_PMT_ENV ? "MDYyMjMzMTg0OTMyNDE4MjM4MDk6MDow" : "MDI4NDE2MzU3Nzc0OTkzOTU4NzQ6MDow",
    AI_REVIEW_LIST_ID: IS_PMT_ENV ? "WDVGU1pHd25FTnJuLXJ6dg" : "ZzZ0aHpMNDJzNEJmMnJhUw",
    TODO_LIST_ID: IS_PMT_ENV ? "M05Gb0c1dG91bXlkQUJpVQ" : "RWNzLU50Qmp1QUZpalhqSg",
    TO_BE_DELETED_LIST_ID: IS_PMT_ENV ? "MVlRNkVjUlJwMWpaenVTYQ" : "QWkyNE1sdlVXMzMwbjhFQw",
    RECURRING_LIST_ID: IS_PMT_ENV ? "N01qSEtvZ2ZWLWVMYW1KWQ" : "TnZtbVFtT1FJbktKeWtkUw",
    TASK_MASTER_INDEX: getEnvProp("TASK_MASTER_INDEX") || "0"
  },
  
  SHEETS: {
    HABITS_LOG: "489641630",
    TASK_REVIEW: "1580572397",
    LOS_TAXONOMY: "1287896098",
    EMAIL_RULES_RECEIVER: "1799689202",
    EXECUTION_LOG: "2140417240",
    DRIVE_LOG: "809034738",
    EMAIL_LOG: "2131515996",
    ALIAS_WHITELIST: "1799689202",
    EMAIL_DETERMINISTIC_RULES: "1679876125",
    COMPLETED_TASKS_LOG: "1580572397",
    MAPPER: "536537641",
    RESET: "1835375017",
    DRIVE_SESSION_LOG: "1657749758",
    DRIVE_FILENAME_RULES: "938516466",
    DRIVE_FOLDER_RULES: "1297520241",
    DRIVE_ARCHAEOLOGIST: IS_PMT_ENV ? "131172798" : "783881433",
    NOTES_LOG: "967747913",
    LABEL_MANAGEMENT: "1007497112",
    EMAIL_RETRO_LOG: "",
    GEMINI_MODELS: "1704335578"
  },
  
  STATE: {
    THREAD_STATE: getEnvProp("THREAD_STATE"),
    TAXONOMY_SYNC_INDEX: getEnvProp("TAXONOMY_SYNC_INDEX") || "0",
    ACTIVE_BATCH_JOB: getEnvProp("ACTIVE_BATCH_JOB"),
    ACTIVE_BATCH_MANIFEST: getEnvProp("ACTIVE_BATCH_MANIFEST")
  },

  DRIVE_FOLDERS: {
    STND_SOURCES: (IS_PMT_ENV ? [
                     "1iuy0Ewq-m-ZDgUOkzQt6juDeqK9QaW5W", // 00 Inbox (PMT)
                     "1VnfJ8SJkwpmQB6ASImsk_-czonEC2RCl", // MacMini Desktop (PMT)
                     "1W3hfHcmIa3jXsY4Mv2q2WnHsoYt1IlkH", // MacMini Downloads (PMT)
                     "1kNQj91SMLlAUsOzAiBBmsjLoQXunRANG", // MBA Desktop (PMT)
                     "15RKY62cIZp0MYGPCtkaZ7Z4_Pn8bsPeB", // MBA Downloads (PMT)
                   ] : [
                     "1XossC1cdOZE82efew3qH48LJnhl6ng4i", // 00 Inbox
                     "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", // MacMini Desktop
                     "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", // MacMini Downloads
                     "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", // MBA Private Desktop 
                     "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", // MBA Private Downloads
                     "1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo", // Saved from Chrome (Carina)
                     "17uUH01ihipNeRfTQQcD61zzjORpWFCRY"  // Saved from Chrome (Daniel)
                   ]),
    OUT_OF_SCOPE: (IS_PMT_ENV ? [
                     "1iuy0Ewq-m-ZDgUOkzQt6juDeqK9QaW5W", // 00 Inbox (PMT)
                     "1VnfJ8SJkwpmQB6ASImsk_-czonEC2RCl", // MacMini Desktop (PMT)
                     "1W3hfHcmIa3jXsY4Mv2q2WnHsoYt1IlkH", // MacMini Downloads (PMT)
                     "1kNQj91SMLlAUsOzAiBBmsjLoQXunRANG", // MBA Desktop (PMT)
                     "15RKY62cIZp0MYGPCtkaZ7Z4_Pn8bsPeB", // MBA Downloads (PMT)
                     "1UclbKZ_K7gwwgZN3UynHqb3yvOte2V1-"  // MBA Documents (PMT)
                   ] : [
                     "1XossC1cdOZE82efew3qH48LJnhl6ng4i", // 00 Inbox
                     "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", // MacMini Desktop
                     "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", // MacMini Downloads
                     "10OWXo6W88eB3P-yP_zq67vrEPHqtbuc1", // MacMini Documents
                     "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", // MBA Private Desktop 
                     "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", // MBA Private Downloads
                     "1-ADyfSnqq1Yk31Hd0upzWumJuZM77k0Q", // MBA Documents
                     "1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo", // Saved from Chrome (Carina)
                     "17uUH01ihipNeRfTQQcD61zzjORpWFCRY"  // Saved from Chrome (Daniel)
                   ]).join(","),
    STND_DEST: getEnvProp("DRIVE_STND_DEST") || (IS_PMT_ENV ? "1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR" : "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb"), // Destination TBC
    REVIEW: getEnvProp("DRIVE_REVIEW") || (IS_PMT_ENV ? "1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H" : "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY") // Manual Review
  },

  CLERK_NOTES_FOLDERS: {
    ROUTE_MODE: (IS_PMT_ENV ? ["1dKBJ8w8B2-O06uh-5N9WhIoavj8uMzmM"] : ["1yKMLA11aEG3FI8UuWSsGHP9X-fgBBEfa"]),
    CLEAN_MODE: (IS_PMT_ENV ? ["1dZuVjvnWwWTe4qwXKs6huK8qVKGR1WDT"] : ["1ImPaXVXQetcaCFE9aY9DT0AM3thGXcEc"]),
    RUNNING_DOCS: []
  }
};

// ==========================================
// ENVIRONMENT INITIALIZATION
// Run these once from the IDE when deploying
// ==========================================

function setEnvToWork() {
  PropertiesService.getScriptProperties().setProperty("ENV", "WORK");
  console.log("Successfully set ENV=WORK in Script Properties.");
}

function setEnvToPrivate() {
  PropertiesService.getScriptProperties().setProperty("ENV", "PRIVATE");
  console.log("Successfully set ENV=PRIVATE in Script Properties.");
}

function NUKE_AND_FIX() {
  // Wipe all invisible User Properties
  PropertiesService.getUserProperties().deleteAllProperties();
  
  // Wipe all Script Properties (the ones stuck in the UI)
  PropertiesService.getScriptProperties().deleteAllProperties();
  
  // Set only the 2 required properties perfectly
  PropertiesService.getScriptProperties().setProperty("ENV", "WORK");
  PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", "INSERT_API_KEY_HERE");
  
  console.log("SUCCESS: Completely wiped all ghosts and forced the new API key.");
}
// forced update
