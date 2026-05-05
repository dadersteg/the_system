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
 * Executes a folder mapping starting from the target workspace folder, logging the output to a specific sheet.
 * @returns {void}
 */
function executeFolderMapping() {
  const UTIL_PROPS = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
  const TARGET_FOLDER_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("WORKSPACE_FOLDER_ID") : null;
  const MASTER_SHEET_ID = UTIL_PROPS ? UTIL_PROPS.getProperty("MASTER_SHEET_ID") : null;
  if (!TARGET_FOLDER_ID) {
    console.error("executeFolderMapping failed: Missing Script Property WORKSPACE_FOLDER_ID");
    return;
  }
  if (!MASTER_SHEET_ID) {
    console.error("executeFolderMapping failed: Missing Script Property MASTER_SHEET_ID");
    return;
  }

  const MAPPER_GID = "536537641";

  try {
    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === MAPPER_GID);
    if (!sheet) {
      console.error(`executeFolderMapping failed: Could not find sheet with GID ${MAPPER_GID}`);
      return;
    }
    sheet.clearContents();

    const headers = ["Depth", "Structure", "Folder ID", "Absolute Path"];
    const outputData = [headers];

    const rootFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const rootName = rootFolder.getName();

    outputData.push([0, rootName, rootFolder.getId(), `/${rootName}`]);
    traverseAndLog(rootFolder, 1, `/${rootName}`, outputData);

    // Batch write to sheet
    sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

    console.log(`Topology mapping complete. ${outputData.length - 1} nodes mapped.`);
  } catch (e) {
    console.error(`executeFolderMapping execution failed: ${e.message}`);
    try {
      const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
      const sheet = ss.getSheets().find(s => s.getSheetId().toString() === MAPPER_GID);
      if (sheet) {
        const headers = ["Depth", "Structure", "Folder ID", "Absolute Path"];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.appendRow(["ERROR", e.message, "", ""]);
      }
    } catch (innerError) {
      console.error(`executeFolderMapping failed to log error to sheet: ${innerError.message}`);
    }
  }
}

/**
 * Recursively traverses a folder structure and logs the paths.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - The parent folder to start traversing.
 * @param {number} depth - The current depth level of the traversal.
 * @param {string} currentPath - The string representing the current absolute path.
 * @param {Array<Array<string|number>>} outputData - The array collecting the mapped data.
 * @returns {void}
 */
function traverseAndLog(parentFolder, depth, currentPath, outputData) {
  if (!parentFolder || typeof parentFolder.getFolders !== 'function') {
    console.error("traverseAndLog failed: Invalid parentFolder provided.");
    return;
  }
  if (typeof depth !== 'number' || depth < 0) {
    console.error("traverseAndLog failed: Invalid depth provided.");
    return;
  }
  if (typeof currentPath !== 'string') {
    console.error("traverseAndLog failed: Invalid currentPath provided.");
    return;
  }
  if (!Array.isArray(outputData)) {
    console.error("traverseAndLog failed: Invalid outputData provided.");
    return;
  }

  try {
    const subfolders = parentFolder.getFolders();
    while (subfolders.hasNext()) {
      const folder = subfolders.next();
      const folderName = folder.getName();
      const absolutePath = `${currentPath}/${folderName}`;
      const prefix = "│   ".repeat(depth - 1) + "├── ";

      outputData.push([depth, prefix + folderName, folder.getId(), absolutePath]);
      traverseAndLog(folder, depth + 1, absolutePath, outputData);
    }
  } catch (e) {
    console.error(`traverseAndLog failed at path ${currentPath}: ${e.message}`);
  }
}

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
    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
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

    const BATCH_SIZE = 10;
    const TARGET_DEPTH = 4;

    const files = DriveApp.getFilesByName("LOS_Taxonomy.json");
    if (!files.hasNext()) {
      console.error("LOS_Taxonomy.json not found. Please run syncTaxonomyToSheet() first.");
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

        let nextFolder;
        if (folders.hasNext()) {
          nextFolder = folders.next();
        } else {
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

      if (item && item["L4 Name"]) {
        const folderNames = [];
        if (item["L1 Code"]) folderNames.push(`${item["L1 Code"]} ${item["L1 Name"] ? item["L1 Name"].trim() : ""}`);
        if (item["L2 Code"]) folderNames.push(`${item["L2 Code"]} ${item["L2 Name"] ? item["L2 Name"].trim() : ""}`);
        if (item["L3 Code"]) folderNames.push(`${item["L3 Code"]} ${item["L3 Name"] ? item["L3 Name"].trim() : ""}`);
        folderNames.push(item["L4 Name"].trim());

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
