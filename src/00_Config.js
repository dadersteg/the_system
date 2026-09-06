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



const ENABLE_CE_FEATURES = true;
const checkIsCeEnv = () => {
  if (!ENABLE_CE_FEATURES) return false;
  
  // 1. Explicit property override
  const env = getEnvProp("ENV");
  if (env === "WORK" || env === "CE") return true;
  if (env === "PRIVATE") return false;

  // 2. Script ID matching
  try {
    if (typeof ScriptApp !== 'undefined') {
      const scriptId = ScriptApp.getScriptId();
      if (scriptId === "1ThAG5cdAnGvQQQyqInagixV23AKLWkGdQw_xKBu0mjDPBh5k2F542D3o") return true;
      if (scriptId === "1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75") return false;
    }
  } catch(e) {}

  // 3. User email matching
  try {
    if (typeof Session !== 'undefined') {
      const email = (Session.getEffectiveUser()?.getEmail() || Session.getActiveUser()?.getEmail() || "").toLowerCase();
      if (email.includes("humanoid") || email.includes("playmetech") || email.includes("quantum21")) return true;
    }
  } catch(e) {}

  // 4. Bound Spreadsheet ID matching
  try {
    if (typeof SpreadsheetApp !== 'undefined') {
      const activeSs = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSs && activeSs.getId() === "12oU7ikanKRsIPakFbSlXkhTbyE2ofMTGun9JgGVvmMs") return true;
    }
  } catch(e) {}

  return false;
};

const IS_CE_ENV = checkIsCeEnv();

// ==========================================
// PIPELINE SCOPING REGISTRY (Private vs CE vs Dual)
// Central governance mapping every pipeline/skill to its authorized runtime domain.
// ==========================================
const PIPELINE_SCOPES = {
  // Clerk Pipelines
  CLERK_EMAIL: "DUAL",             // Email triage runs in both Private & CE Gmail
  CLERK_PHOTOS: "PRIVATE",         // Google Photos sync strictly Private
  CLERK_DRIVE: "DUAL",             // Drive filing runs in both Private & CE Drive
  CLERK_NOTES: "DUAL",             // Notes clean-in-place runs in both
  DRIVE_ARCHAEOLOGIST: "DUAL",     // Metadata indexing runs in both
  DRIVE_SWEEPER: "DUAL",           // Drive folder sweep runs in both
  
  // Task Engine & Reviews
  TASK_MASTER: "DUAL",             // Daily task routing operates in both
  TIMEBOXING: "DUAL",              // Calendar slot calculation operates in both
  STRATEGIC_REVIEWS: "DUAL",       // Hourly, weekly, monthly reviews operate in both
  CONVERSATION_TASKS: "DUAL",      // Task extraction from transcripts operates in both
  
  // Taxonomy & Trackers
  TAXONOMY_SYNC: "DUAL",           // Syncs active environment taxonomy
  TRACKER_EXPORTS: "DUAL"          // Exports active environment trackers
};

/**
 * Universal Environment Scope Guard:
 * Checks whether a pipeline is permitted to execute in the current runtime environment.
 * @param {string} pipelineKey - Key from PIPELINE_SCOPES (e.g. 'CLERK_EMAIL')
 * @returns {boolean} True if authorized, false if skipped.
 */
function isPipelineAuthorized(pipelineKey) {
  const scope = PIPELINE_SCOPES[pipelineKey];
  if (!scope) {
    console.warn(`[SCOPE_GUARD] Unregistered pipeline: ${pipelineKey}. Defaulting to DUAL.`);
    return true;
  }
  
  const currentEnv = IS_CE_ENV ? "CE" : "PRIVATE";
  if (scope === "DUAL" || scope === currentEnv) {
    return true;
  }
  
  console.log(`[SCOPE_GUARD] Pipeline '${pipelineKey}' is scoped to [${scope}]. Skipping execution in [${currentEnv}] environment.`);
  return false;
}

const SYSTEM_CONFIG = {
  SECRETS: {
    GEMINI_API_KEY: getEnvProp("GEMINI_API_KEY"),
    GEMINI_PRIMARY_MODEL: "gemini-3.7-flash",            // Primary Engine Across EVERYTHING
    GEMINI_MODEL_PRO: "gemini-3.7-flash",                // Tactical & Reasoning Primary
    GEMINI_MODEL_FLASH: "gemini-3.7-flash",              // Flash Primary
    GEMINI_MODEL_FLASH_LITE: "gemini-3.5-flash-lite",    // High-throughput Ingestion & Metadata (Flash Lite)
    GEMINI_FALLBACK_PRO: "gemini-3.7-flash",            // Heavy Reasoning Fallback
    GEMINI_FALLBACK_LITE: "gemini-3.5-flash-lite",       // High-throughput Ingestion Fallback (Flash Lite)
    GEMINI_RETRO_MODEL: "gemini-3.5-flash-lite",         // Retroactive Sweeps (Flash Lite)
    GEMINI_MODEL_2M_RETRO: "gemini-3.1-pro",             // 2M Large-Context Fallback
  },
  
  ROOTS: {
    MASTER_SHEET_ID: IS_CE_ENV ? "12oU7ikanKRsIPakFbSlXkhTbyE2ofMTGun9JgGVvmMs" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
    WORKSPACE_FOLDER_ID: IS_CE_ENV ? "1EUNxYJdXdXA3R2DuRchssN3GQLpIvmkM" : "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc",
    DRIVE_RULES_SHEET_ID: IS_CE_ENV ? "12oU7ikanKRsIPakFbSlXkhTbyE2ofMTGun9JgGVvmMs" : "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY",
    HABITS_SHEET_ID: IS_CE_ENV ? "1CerIv9q3Zimpi3FUsIa0G7uCz3jwJCLZ9A-0Ujy8qKE" : "1avNkROuThqd4wgzFjPKinxR9y7RYJmPCR-HASbfWUUo",
  },
  
  API: {
    get REFLECTION_WEBHOOK() {
      const url = getEnvProp("REFLECTION_WEBHOOK");
      return (url && typeof url === 'string') ? url.trim() : "https://script.google.com/macros/s/AKfycbxxUw1Wjo9BFHmZmtVn8KfjspZe2fsuwCQGz6zgKvwSOhcVa9Etf1nUYdL3SBjk7guW/exec";
    },
    get REFLECTION_SECRET() {
      const secret = getEnvProp("REFLECTION_SECRET");
      return (secret && typeof secret === 'string') ? secret.trim() : "REFLECTION_SECURE_TRIGGER_123";
    }
  },
  
  DRIVE_RETRO_ROOT_ID: IS_CE_ENV ? "" : "",
  
  DOCS: {
    TASK_MASTER_PROMPT_ID: "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar",
    TASK_MASTER_DAILY_PROMPT_ID: "12V15LmkDX0EPGNZJUxRIr5TAleiI_ZgW",
    TASK_MASTER_WEEKLY_PROMPT_ID: "1Yo9jah9LnYeseeP_GOdWuMsW389h6KJb",
    TASK_MASTER_MONTHLY_PROMPT_ID: "1Ilvx-d1NCcuGQIvNLqPBziauoT8JDzGf",
    TASK_MASTER_QUARTERLY_PROMPT_ID: "1L_uudJb_pNXWvZCBy2njXfuNpo3fbaF2",
    VANTAGE_LOG_ID: "14xoDCmsqSMCwqwf8YN0ffFz8FQd8Hz4P",
    RECENT_REFLECTIONS_ID: IS_CE_ENV ? "12jESBDbyXjDzzXtO2g4qYq5k0i3a3Unj" : "192vz0UDslOjBNLbbK5ZRuzUG5mToWcg-",
    TAXONOMY_DOC_ID: IS_CE_ENV ? "1ZCN1tNq7jCNnyvpQJzc7QyNT44cdQ8fZ" : "142r2YeV5v209crHS5J5HvWr1s4TOnexp",
    TAXONOMY_JSON_ID: IS_CE_ENV ? "1Ws3FopgzSejfu9Tt8iqS7WqJnpKmAwWU" : "199ChTlYe3xKsybllcJ3BXYUIEs8cxvWq",
    PROMPT_VANTAGE: "1Cw4KXmJ7cN114YFub9voVhlzEL_EEF1D",
    VANTAGE_CUSTOM_INSTRUCTIONS: "10YHaBQqy1gfJ3YSaGC9RoFh4xCa106YC",
    PERSONAL_GOALS_FILE_ID: "1nFJpikIiZX9ykJy0aePAQyx0mFO0DswD",
    WORK_GOALS_FILE_ID: IS_CE_ENV ? "1N23iQWCIASnMSMAUpvTf1PcnsZzDCOpn" : "1lZgLespm8bUNS6Vt2sP1Pe0MqrSxV04N",
    CLERK_DRIVE_INSTRUCTIONS: "1HyHXMW_PC6Viq1j-w3BoQZREYJdMMe1U",
    CLERK_DRIVE_PROTOCOL: "1dWxccg1FyGmdK2fayx5K8S05NW8VBpVk",
    CLERK_EMAIL_PROMPT_ID: "19a2eEMdxmwhNbLXAYdgyJhWDYg-4abkJ",
    NOTES_ROUTE_PROMPT_ID: "1KmUFGgiWXQX8mH5PaOqPdvR2hWsJfvIrvcCt4i8Vkdg",
    NOTES_CLEAN_PROMPT_ID: "1L9gF7KqVLVyui2PAL8gyG-MnMCr9xFP7-qdBluhsOxA",
    MASTER_ASSET_NAMING_PROTOCOL: IS_CE_ENV ? "1GI7Z28odxNNoVI_6Eio9VqjxwCqUoaVH" : "16FxwxxtRWpL3ppe_aD2e7KEBAqFx6rbn",
    AGENT_PROTOCOL_TIME_FRAMEWORKS: "1711JUUEypB0zlZgpTxY24sN8v0F2PSbm",
    SYSTEM_ARCHITECTURE_OVERVIEW_ID: "1XN1v8r3AtiTXsRVzeH7DP7Un5LBCaZZoCzZcoMZY2r8",
    BLUF_SUMMARY_PROMPT_ID: "135iOBA-LQbm5Tv6VMaB-XUTa6Iwpkb_-UHsziXlDhYg",
    GEMINI_MODELS_FOLDER_ID: "1jh8qIa83tVweb19jj5smeqQ2f7Pr1-L2",
    GEMINI_MODELS_MD_ID: "18-wxQHsaN-T7vcVSFo3e5TKFisrx8Tf-",
    GEMINI_MODELS_JSON_ID: "1adWYc1Rpoh4W5IBHVY3CfNg3KzzmEOeL",
    RUNNING_NOTES_DOC_ID: IS_CE_ENV ? "1Ocvg9JWGDZ6lsh-0T5_LQuMbhNkS1tEDL--lkOL8Wts" : ""
  },
  
  GENERATED_OUTPUTS: {
    DAY_1_EXECUTION_PLAN: IS_CE_ENV ? "197NLmguMaMaUabGxsmObWrm_9A2MKz8L" : "1HWiRQIOjw9Zvv2wLv6-ElrhyiLXl7xnR",
    DAY_7_ROADMAP: IS_CE_ENV ? "1KW9yxfUQvkyblqJsJ0Kq4rVmioUlXB-3" : "1VHfeQru1tTUJrdhmngxljc_5s81iiYDA",
    DAY_28_STRATEGIC: IS_CE_ENV ? "1jFh2sOTeN1shkhcCcZmW6jTlV0lNOrrp" : "1W2MLLGsBn1XQVRxw_d5xDn805gQXdUMK",
    DAY_84_STRATEGIC: IS_CE_ENV ? "1Tck8GLln7JaEJmOhl5rkLNvGpHMbvbFB" : "1x6b6JtbA-naBHl2gVsfSSnEaKleafmX7",
    TASKS_EXPORT: IS_CE_ENV ? "164vrTLU7yGNjypF6MWjsqLcO-9xEnkEQ" : "1a6F50q0oFE7gLL_w229wguFvGncPRjhg",
    TASKS_COMBINED_EXPORT: "1zsYHcEfreCjmn6Xh-uf7b7r9Du4FT3jd"
  },
  
  TASKS: {
    IMPORTER_LIST_ID: IS_CE_ENV ? "MTM0MDcwMTA5NTcwOTA4MDE1NDY6MDow" : "MDI4NDE2MzU3Nzc0OTkzOTU4NzQ6MDow",
    AI_REVIEW_LIST_ID: IS_CE_ENV ? "VEduS2M3Y0VsUGY1Tll6Rg" : "ZzZ0aHpMNDJzNEJmMnJhUw",
    TODO_LIST_ID: IS_CE_ENV ? "SzV2Tk1GYlhDeVN5SFNtNA" : "RWNzLU50Qmp1QUZpalhqSg",
    TO_BE_DELETED_LIST_ID: IS_CE_ENV ? "RERfRUk4OXNjZV8tYlR6cw" : "QWkyNE1sdlVXMzMwbjhFQw",
    RECURRING_LIST_ID: IS_CE_ENV ? "OG1Xamp6TC12RlR5cDV5ZA" : "TnZtbVFtT1FJbktKeWtkUw",
    TASK_MASTER_INDEX: getEnvProp("TASK_MASTER_INDEX") || "0"
  },
  
  SHEETS: {
    INDEX: IS_CE_ENV ? "1105860651" : "1111111111",
    TASKS_OVERVIEW: IS_CE_ENV ? "660383126" : "1414141414",
    DRIVE_TRACKER: IS_CE_ENV ? "1915440379" : "1717171717",
    EMAIL_TRACKER: IS_CE_ENV ? "609827097" : "1212121212",
    EMAIL_DETERMINISTIC_RULES: IS_CE_ENV ? "1646882384" : "1679876125",
    DRIVE_FILENAME_RULES: IS_CE_ENV ? "50200769" : "938516466",
    DRIVE_FOLDER_RULES: IS_CE_ENV ? "415209759" : "1297520241",
    LOS_TAXONOMY: IS_CE_ENV ? "1311086610" : "1287896098",
    ALIAS_WHITELIST: IS_CE_ENV ? "597559157" : "1799689202",
    TASK_REVIEW: IS_CE_ENV ? "1910620645" : "1580572397",
    COMPLETED_TASKS_LOG: IS_CE_ENV ? "1226384453" : "1580572400",
    EMAIL_LOG: IS_CE_ENV ? "8608444" : "2131515996",
    DRIVE_LOG: IS_CE_ENV ? "1923797149" : "809034738",
    NOTES_LOG: IS_CE_ENV ? "1505501867" : "967747913",
    MAPPER: IS_CE_ENV ? "1077568638" : "536537641",
    DRIVE_SESSION_LOG: IS_CE_ENV ? "1743255869" : "1657749758",
    LABEL_MANAGEMENT: IS_CE_ENV ? "405946778" : "1007497112",
    ANTIGRAVITY_LOG: IS_CE_ENV ? "612396747" : "162650355",
    GEMINI_MODELS: IS_CE_ENV ? "1704335578" : "1704335578",
    DRIVE_ARCHAEOLOGIST: IS_CE_ENV ? "1307488994" : "783881433",
    EMAIL_RETRO_LOG: IS_CE_ENV ? "8608444" : "67786861"
  },
  
  STATE: {
    TAXONOMY_SYNC_INDEX: getEnvProp("TAXONOMY_SYNC_INDEX") || "0"
  },

  DRIVE_FOLDERS: {
    STND_SOURCES: (IS_CE_ENV ? [
                     "1RfQdPbMXbjyvpTNMqeRMp-Y6SI8kHUiW", // 00 Inbox (CE)
                     "1TxMBviOHoPa_WFe0x8Sksl6w-P30aFXm", // Google Meet
                     "1Ls1ZClhOFTDfZeUHLsfwUPM8bo3qMV4h", // Meet Recordings (CE)
                     "1zRkQdrLvLtZbjSq-lDJn32m_ibZgtoaQ", // MBA_13 Desktop
                     "1yOhm-reTrzdSkvM-GJzxG7tj-YgGGlLM", // MBA_13 Downloads
                     "1izpOXfw98SOr3T1-LjiEi7ET1K6xkWVw", // MBA_13 Documents
                     "1sABpo9cD5yfstEmzXrEdlgvlYJ9lWHSY", // MBA_15 Desktop
                     "1HI7EkzJNMrzEiEjv8rlTrjzD_fkJJXH-", // MBA_15 Downloads
                     "1gnxTP103YOYQXjIKGTYcZSEYWWmtrvN8", // MBA_15 Documents
                   ] : [
                     "1XossC1cdOZE82efew3qH48LJnhl6ng4i", // 00 Inbox
                     "1twdnJDVS3br2F_vcNW7nXAAUeLu2H5sh", // MacMini Desktop
                     "1UOv58dSn1uL3GJVJ1rP3xvpve4LVqNhv", // MacMini Downloads
                     "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", // MBA Private Desktop 
                     "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", // MBA Private Downloads
                     "1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo", // Saved from Chrome (Carina)
                     "17uUH01ihipNeRfTQQcD61zzjORpWFCRY", // Saved from Chrome (Daniel)
                     "1yr9bPJcprkfYSbDnAD0z4TDJLgR8D5wt"  // Gemini Meeting Notes
                   ]),
    OUT_OF_SCOPE: (IS_CE_ENV ? [
                     // Developer & Git Repositories
                     "1GaKPFO2UGgueIOaPsYZQl5zEEtnCllqI", // MBA_15/Claude_Drive
                     "1MeLW_qfaH-aWwAEGls_1CEEseYhSf8Yw", // MBA_15/Claude_Drive/OKR
                     "1umamaNijCxiDgQGRyh7I8SDP4nMF41Pf", // MBA_15/OKR_MasterSS_Sync
                     "15zCcz4VPaL0VLM-cg0kPEHoaJRZHpxDK", // AGY (Master Folder)
                     "1f_yCdLudoJCI8yn2WI9AskJkgWbKpi1Y", // agy_ce (CE Workspace)
                     "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"  // Legacy CE Workspace
                   ] : [
                     // Private Dev Workspaces
                     "15zCcz4VPaL0VLM-cg0kPEHoaJRZHpxDK", // AGY (Master Folder)
                     "1-BzlJdISmsLgE8eYsCDFEpQav310Fw-9", // MBA Private Desktop 
                     "1-DVksigswUn1Hvdi_X2I5uFKqOSr35si", // MBA Private Downloads
                     "1-ADyfSnqq1Yk31Hd0upzWumJuZM77k0Q", // MBA Documents
                     "1FTMPS0DidTf0-JH1QQN_qZ5qB_eTnXoo", // Saved from Chrome (Carina)
                     "17uUH01ihipNeRfTQQcD61zzjORpWFCRY"  // Saved from Chrome (Daniel)
                   ]).join(","),
    STND_DEST: getEnvProp("DRIVE_STND_DEST") || (IS_CE_ENV ? "1jqVPei7Krea9qH2i9wVrUma0OtItVC3Z" : "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb"), // Destination TBC
    REVIEW: getEnvProp("DRIVE_REVIEW") || (IS_CE_ENV ? "1m6Guggf4OymcOVOxmz4cNuCkRrvpsKZy" : "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY"), // Manual Review
    RECENT_SHORTCUTS: IS_CE_ENV ? "" : "1CNI2JAWN8Wi8I44R94X97EoPR7IDbUVT"
  },

  CLERK_NOTES_FOLDERS: {
    ROUTE_MODE: (IS_CE_ENV ? ["1w7-KMX_KC2bSTcIw2AVKDTFnq2fH2EaJ"] : ["1yKMLA11aEG3FI8UuWSsGHP9X-fgBBEfa"]),
    CLEAN_MODE: (IS_CE_ENV ? ["1rvm1Ffqq0ozwKA3yYeCXbQV73q9Qz6-_"] : ["1ImPaXVXQetcaCFE9aY9DT0AM3thGXcEc"]),
    RUNNING_DOCS: (IS_CE_ENV ? ["1Ocvg9JWGDZ6lsh-0T5_LQuMbhNkS1tEDL--lkOL8Wts"] : [])
  },

  CALENDARS: {
    CROSS_ENV_ID: IS_CE_ENV ? "adersteg.daniel@gmail.com" : (getEnvProp("CE_CALENDAR_ID") || getEnvProp("CE_EMAIL") || ""),
    TIMEBOXING_ID: IS_CE_ENV ? "c_11a87fc3a26c9a6a653736ea8a62c4db0130f08a530a9f9feda8c085480ce3a7@group.calendar.google.com" : "c3d490c7b80e62406ca94b1af50fb5aef9de3535504f061edfddab97b07e9f03@group.calendar.google.com"
  },

  PHOTOS: {
    ALBUMS: {
      INSTAGRAM: "Instagram Backups",
      TELEGRAM: "Telegram Backups",
      MESSENGER: "Messenger Backups"
    },
    ALBUM_IDS: {
      INSTAGRAM: "ACqGzSuklHsKh8PcwVPtnKpJEilIjalHyV9vOcxBvUKSZ_MoX3MVt6Ea6XS0CdG4gK1zHgzxdNDW",
      TELEGRAM: "ACqGzSuBqA8It3qxoqZwJP2z4glIGDJLqPofMLAU-ZPR-UVDuAKgYpES32UMNqSqY9jEq0C878yT",
      MESSENGER: "ACqGzStXJNhp5-uRkY2QqRxKTXJlYIjZxpvsLlk-DQQ5rIecQUOZ3pgy0WcSjZshTQWjG6Bk1Aw_"
    }
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
