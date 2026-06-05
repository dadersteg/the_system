/**
 * @file src/Code_DriveTopology.js
 * @description Drive topology utilities for maintaining and auditing the workspace. Provides directory mapping, archive resetting, and taxonomy synchronization.
 *
 * @version 1.0.0
 * @last_modified 2026-05-04
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.0: Initial creation from split of Code_Utilities.js. Added standardized documentation header, JSDoc descriptions for all functions, aggressive type checking, and error boundaries.
 */



/**
 * Scans for folders with a "[DONE]" prefix and removes the prefix, logging changes.
 * @returns {void}
 */
function executeDoneReset() {
  const UTIL_PROPS = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
  const TARGET_FOLDER_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("WORKSPACE_FOLDER_ID") : null;
  const MASTER_SHEET_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("MASTER_SHEET_ID") : null;
  if (!TARGET_FOLDER_ID) {
    console.error("executeDoneReset failed: Missing Script Property WORKSPACE_FOLDER_ID");
    return;
  }
  if (!MASTER_SHEET_ID) {
    console.error("executeDoneReset failed: Missing Script Property MASTER_SHEET_ID");
    return;
  }

  const RESET_GID = "1835375017";
  let sheet = null;

  try {
    const ss = getMasterSpreadsheet();
    sheet = ss.getSheets().find(s => s.getSheetId().toString() === RESET_GID);
    if (!sheet) {
      console.error(`executeDoneReset failed: Could not find sheet with GID ${RESET_GID}`);
      return;
    }
    sheet.clearContents();

    const headers = ["Status", "Original Name", "Restored Name", "Folder ID"];
    const outputData = [headers];

    console.log("--- Reset Sequence Initiated ---");
    const rootFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);

    checkAndRename(rootFolder, outputData);
    traverseAndReset(rootFolder, outputData);

    // Batch write to sheet if mutations occurred
    if (outputData.length > 1) {
      sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      outputData.push(["NO ACTION", "No [DONE] folders found", "", ""]);
      sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    }
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

    console.log(`--- Reset Sequence Complete. Mutations logged: ${outputData.length - 1} ---`);
  } catch (e) {
    console.error(`executeDoneReset execution failed: ${e.message}`);
    if (sheet) {
      try {
        sheet.appendRow(["FATAL ERROR", e.message, "", ""]);
      } catch (innerError) {
        console.error(`executeDoneReset failed to log error to sheet: ${innerError.message}`);
      }
    }
  }
}

/**
 * Recursively traverses folders to check and rename those with "[DONE]" prefix.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - The parent folder.
 * @param {Array<Array<string>>} outputData - The array collecting renamed folder info.
 * @returns {void}
 */
function traverseAndReset(parentFolder, outputData) {
  if (!parentFolder || typeof parentFolder.getFolders !== 'function') {
    console.error("traverseAndReset failed: Invalid parentFolder provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("traverseAndReset failed: Invalid outputData provided.");
    return;
  }

  try {
    const subfolders = parentFolder.getFolders();

    while (subfolders.hasNext()) {
      const folder = subfolders.next();
      if (shouldIgnoreFolder(folder.getName())) continue;
      traverseAndReset(folder, outputData);
      checkAndRename(folder, outputData);
    }
  } catch (e) {
    console.error(`traverseAndReset failed for a folder: ${e.message}`);
  }
}

/**
 * Checks if a folder name starts with "[DONE]" and renames it.
 * @param {GoogleAppsScript.Drive.Folder} folder - The folder to check.
 * @param {Array<Array<string>>} outputData - The log data array.
 * @returns {void}
 */
function checkAndRename(folder, outputData) {
  if (!folder || typeof folder.getName !== 'function' || typeof folder.setName !== 'function') {
    console.error("checkAndRename failed: Invalid folder provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("checkAndRename failed: Invalid outputData provided.");
    return;
  }

  try {
    const folderName = folder.getName();
    const regex = /^\[DONE\]\s*/;

    if (regex.test(folderName)) {
      const newName = folderName.replace(regex, "");
      folder.setName(newName);
      outputData.push(["RESTORED", folderName, newName, folder.getId()]);
    }
  } catch (e) {
    console.error(`checkAndRename failed: ${e.message}`);
  }
}

/**
 * Syncs Drive folders from a stored JSON taxonomy.
 * @returns {void}
 */
function syncDriveFoldersFromTaxonomy() {
  
  if (typeof SYSTEM_CONFIG === 'undefined' || !SYSTEM_CONFIG || !SYSTEM_CONFIG.STATE) {
    console.error("syncDriveFoldersFromTaxonomy failed: SYSTEM_CONFIG or SYSTEM_CONFIG.STATE is undefined");
    return;
  }

  try {
    const PROPS = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
    if (!PROPS) {
      console.error("syncDriveFoldersFromTaxonomy failed: PropertiesService is unavailable.");
      return;
    }

    const isWork = isWorkAccount();
    const taxonomyFilename = isWork ? "WoS_Taxonomy.json" : "LOS_Taxonomy.json";
    const BATCH_SIZE = 10;
    const TARGET_DEPTH = 4;

    const files = DriveApp.getFilesByName(taxonomyFilename);
    if (!files.hasNext()) {
      console.error(taxonomyFilename + " not found. Please run syncTaxonomyToSheet() first.");
      return;
    }

    const taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
    if (!Array.isArray(taxonomy)) {
      console.error("syncDriveFoldersFromTaxonomy failed: Parsed taxonomy is not an array.");
      return;
    }

    const root = DriveApp.getRootFolder();

    let startIndex = parseInt(SYSTEM_CONFIG.STATE.TAXONOMY_SYNC_INDEX, 10);
    if (isNaN(startIndex) || startIndex >= taxonomy.length) {
      console.log("Sync already completed in a previous run. Resetting index to 0.");
      startIndex = 0;
    }

    const createdFolders = [];
    const folderCache = { "root": root.getId() };

    function getOrCreatePath(rootNode, folderNames) {
      let currentFolderId = folderCache["root"];
      let currentPathStr = "";

      const loopLimit = Math.min(folderNames.length, TARGET_DEPTH);

      for (let i = 0; i < loopLimit; i++) {
        const part = folderNames[i];
        if (!part) continue;

        currentPathStr += "/" + part;

        if (folderCache[currentPathStr]) {
          currentFolderId = folderCache[currentPathStr];
          continue;
        }

        const currentFolder = DriveApp.getFolderById(currentFolderId);
        const folders = currentFolder.getFoldersByName(part);

        let nextFolder = null;
        while (folders.hasNext()) {
          const f = folders.next();
          if (!f.isTrashed()) {
            nextFolder = f;
            break;
          }
        }

        if (!nextFolder) {
          nextFolder = currentFolder.createFolder(part);
          createdFolders.push(currentPathStr);
          console.log(`[ACTION] Created new directory: ${part} at ${currentPathStr}`);
        }

        currentFolderId = nextFolder.getId();
        folderCache[currentPathStr] = currentFolderId;
      }
    }

    console.log(`Starting Taxonomy Folder Sync (Batch: ${startIndex} to ${startIndex + BATCH_SIZE - 1})...`);

    let checkedCount = 0;
    let endIndex = startIndex;

    for (let i = startIndex; i < taxonomy.length; i++) {
      if (checkedCount >= BATCH_SIZE) break;

      endIndex = i;
      const item = taxonomy[i];

      if (isWork && !item["L4 Code"]) {
        continue;
      }

      if (item && item["Drive Path"]) {
        const folderNames = item["Drive Path"].split("/").map(s => s.trim());
        const firstPart = folderNames[0] || "";

        // Ignore system triage (00) and system operational (99) tags in Drive
        if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System") {
          continue;
        }

        console.log(`[CHECKING] /${folderNames.slice(0, TARGET_DEPTH).join('/')}`);
        getOrCreatePath(root, folderNames);
        checkedCount++;
      }
    }

    const newStartIndex = endIndex + 1;
    if (newStartIndex >= taxonomy.length) {
      PROPS.deleteProperty("TAXONOMY_SYNC_INDEX");
      console.log("\n[COMPLETE] Taxonomy sync has reached the end of the JSON file.");
    } else {
      PROPS.setProperty("TAXONOMY_SYNC_INDEX", newStartIndex.toString());
    }

    console.log(`\n================ SYNC SUMMARY ================`);
    console.log(`Context Paths Checked : ${checkedCount}`);
    console.log(`New Folders Created   : ${createdFolders.length}`);
    console.log(`Next Run Starts At    : Index ${newStartIndex} / ${taxonomy.length}`);

    if (createdFolders.length > 0) {
      console.log(`\n--- Detailed Creation Log ---`);
      createdFolders.forEach(p => console.log(` + ${p}`));
    }
    console.log(`==============================================\n`);
  } catch (e) {
    console.error(`syncDriveFoldersFromTaxonomy failed: ${e.message}`);
  }
}

/**
 * Searches Google Drive for folders created in the last 24 hours and logs them.
 * @returns {void}
 */
function findRecentlyCreatedFolders() {
  console.log("Scanning Drive for folders created in the last 24 hours...");

  try {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const timeString = yesterday.toISOString();

    const query = `mimeType = 'application/vnd.google-apps.folder' and createdTime > '${timeString}' and trashed = false`;

    let pageToken = null;
    let count = 0;

    do {
      const response = Drive.Files.list({
        q: query,
        fields: "nextPageToken, files(id, name, createdTime, parents)",
        pageToken: pageToken,
        pageSize: 100
      });

      const files = response.files || [];
      files.forEach(file => {
        console.log(`Found: "${file.name}" | Created: ${file.createdTime} | ID: ${file.id}`);
        count++;
      });

      pageToken = response.nextPageToken;
    } while (pageToken);

    console.log(`\nScan complete. Found ${count} recently created folders.`);
  } catch (e) {
    console.error("Error searching Drive. (Ensure Drive API v3 is enabled in Advanced Services): " + e.message);

    try {
      console.log("Attempting fallback search with DriveApp...");
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const timeString = yesterday.toISOString();

      const folders = DriveApp.searchFolders(`createdTime > '${timeString}'`);
      let fallbackCount = 0;
      while(folders.hasNext()) {
        const f = folders.next();
        console.log(`Found: "${f.getName()}" | Created: ${f.getDateCreated()}`);
        fallbackCount++;
      }
      console.log(`Fallback scan complete. Found ${fallbackCount} folders.`);
    } catch (innerError) {
      console.error(`Fallback scan failed: ${innerError.message}`);
    }
  }
}

/**
 * Resolves an exact Drive folder from a taxonomy Concat (Path) string.
 * @param {string} concatPath - The AI output path (e.g. "01 01 02 Contracts > Signature")
 * @param {Array<Object>} taxonomy - The parsed LOS_Taxonomy.json array
 * @returns {GoogleAppsScript.Drive.Folder|null} - The target folder, or null if not found
 */
function resolveFolderFromTaxonomy(concatPath, taxonomy) {
  if (!concatPath || concatPath === "Unknown" || !taxonomy || !Array.isArray(taxonomy)) return null;

  // Find the exact matching taxonomy item
  const item = taxonomy.find(t => t["Concat (Path)"] === concatPath);
  if (!item) {
    console.warn("Taxonomy mapping not found for path: " + concatPath);
    return null;
  }

  // Construct the exact folder hierarchy by splitting Concat (Label)
  const folderNames = item["Drive Path"] ? item["Drive Path"].split("/").map(s => s.trim()) : [];
  if (folderNames.length === 0) return null;

  const isWork = isWorkAccount();

  // Traverse down from the root / workspace root
  let currentFolder = DriveApp.getRootFolder();
  for (let i = 0; i < folderNames.length; i++) {
    const part = folderNames[i];
    if (!part) continue;

    const subfolders = currentFolder.getFoldersByName(part);
    let found = false;
    while (subfolders.hasNext()) {
      const f = subfolders.next();
      if (!f.isTrashed()) {
        currentFolder = f;
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`Traverse failed: Could not find active folder '${part}' inside '${currentFolder.getName()}'`);
      return null;
    }
  }

  return currentFolder;
}

function shouldIgnoreFolder(folderName) {
  if (!folderName) return true;
  const lower = folderName.toLowerCase();
  return (
    folderName.startsWith(".") ||
    lower === "node_modules" ||
    lower === "tempmediastorage" ||
    lower === "ingestion" ||
    lower === "the system ingestion"
  );
}

/**
 * Audits physical folders in the Drive workspace and lists any that do not match the taxonomy.
 * Does not delete or rename anything. It logs results to the logger.
 * @returns {Array<Object>} List of unmapped/incorrect folders.
 */
function auditWorkspaceFolders() {
  try {
    const root = DriveApp.getRootFolder();
                 
    console.log(`Starting Drive Workspace Audit... Root Folder: ${root.getName()} (ID: ${root.getId()})`);

    const taxonomyFilename = isWork ? "WoS_Taxonomy.json" : "LOS_Taxonomy.json";
    const files = DriveApp.getFilesByName(taxonomyFilename);
    if (!files.hasNext()) {
      console.error(taxonomyFilename + " not found. Please run syncTaxonomyToSheet() first.");
      return [];
    }

    const taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
    if (!Array.isArray(taxonomy)) {
      console.error("auditWorkspaceFolders failed: Parsed taxonomy is not an array.");
      return [];
    }

    // Build set of valid relative paths from the taxonomy
    const validPaths = new Set();
    const TARGET_DEPTH = 4;

    taxonomy.forEach(item => {
      if (item && item["Drive Path"]) {
        const path = item["Drive Path"].trim();
        if (!path) return;

        const parts = path.split("/").map(s => s.trim());
        const firstPart = parts[0] || "";

        // Ignore system triage (00) and system operational (99) tags
        if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System") {
          return;
        }

        // Add the path itself up to TARGET_DEPTH, and all its parent prefixes
        const limitParts = parts.slice(0, TARGET_DEPTH);
        let currentPath = "";
        for (let j = 0; j < limitParts.length; j++) {
          currentPath = currentPath ? (currentPath + "/" + limitParts[j]) : limitParts[j];
          validPaths.add(currentPath);
        }
      }
    });

    console.log(`Compiled ${validPaths.size} valid taxonomy paths for matching.`);

    const incorrectFolders = [];
    
    // Recursive traversal function
    function traverseAndAudit(folder, currentRelativePath) {
      const folderName = folder.getName();
      if (shouldIgnoreFolder(folderName)) return;

      const path = currentRelativePath ? (currentRelativePath + "/" + folderName) : folderName;

      // Only audit folders below root
      if (currentRelativePath) {
        // If the path starts with a folder starting with "00 " or "99 ", skip auditing it entirely (e.g. "00 Inbox")
        const parts = path.split("/");
        const firstPart = parts[0];
        if (firstPart.startsWith("00 ") || firstPart.startsWith("99 ")) {
          return;
        }

        if (!validPaths.has(path)) {
          incorrectFolders.push({
            name: folderName,
            relativePath: path,
            id: folder.getId(),
            url: folder.getUrl()
          });
        }
      }

      // Continue traversing subfolders
      try {
        const subfolders = folder.getFolders();
        while (subfolders.hasNext()) {
          const nextFolder = subfolders.next();
          traverseAndAudit(nextFolder, path);
        }
      } catch (e) {
        console.error(`Error traversing subfolders of ${folderName}: ${e.message}`);
      }
    }

    // Start traversal from children of the root folder (so the relative path of children is just their name)
    const subfolders = root.getFolders();
    while (subfolders.hasNext()) {
      traverseAndAudit(subfolders.next(), "");
    }

    console.log(`\n================ AUDIT RESULTS ================`);
    console.log(`Incorrect / Unmapped Folders Found: ${incorrectFolders.length}`);
    if (incorrectFolders.length > 0) {
      console.log(`\nList of physical folders not matching active taxonomy:`);
      incorrectFolders.forEach((f, idx) => {
        console.log(`${idx + 1}. [UNMAPPED] Path: "/${f.relativePath}" | ID: ${f.id} | Link: ${f.url}`);
      });
    } else {
      console.log(`🎉 No incorrect or unmapped folders found! All physical folders match the taxonomy.`);
    }
    console.log(`==============================================\n`);

    return incorrectFolders;

  } catch (e) {
    console.error(`auditWorkspaceFolders failed: ${e.message}`);
    return [];
  }
}
