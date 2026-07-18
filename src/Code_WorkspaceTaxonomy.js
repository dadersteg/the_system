/**
 * @file src/Code_WorkspaceTaxonomy.js
 * @description Unified taxonomy generation and drive topology enforcement.
 * Absorbs functionality of Code_SyncTaxonomy and Code_DriveTopology.
 */
function syncTaxonomyToSheet() {
  const sheetId = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const targetGid = SYSTEM_CONFIG.SHEETS.LOS_TAXONOMY;

  const fileId = SYSTEM_CONFIG.DOCS.TAXONOMY_DOC_ID;
  if (!fileId) throw new Error("TAXONOMY_DOC_ID is not configured in Script Properties or Code_Config.js.");
  const file = DriveApp.getFileById(fileId);
  let text = file.getBlob().getDataAsString();
  
  const isPmt = IS_PMT_ENV;



  const lines = text.split("\n");
  const data = [];
  data.push(["L1 Code", "L1 Name", "L2 Code", "L2 Name", "L3 Code", "L3 Name", "L4 Name", "L4 Description", "Concat (Label)", "Concat (Path)"]);

  const clean = (name) => name ? name.replace("(Standing Contexts)", "").replace("(Active)", "").replace("(Passive)", "").replace(/\[AGGREGATOR\]/gi, "").trim() : "";

  if (isPmt) {
    // Parse using PMT flat taxonomy logic
    let currentSection = null; // 'core', 'strategies', 'goals'
    let currentL1Code = "";
    let currentL1Name = "";
    
    let l1Regex = /^###\s+`?(\d{2})\s+([^`\n]+)`?/;
    let subfolderRegex = /^\s*[\*\-]\s+\*\*`?([^`:\n]+)`?\*\*(?::\s*(.*))?$/;
    let stratHeaderRegex = /^###\s+4\.1\.\s+Actual\s+Trading/i;
    let goalsHeaderRegex = /^###\s+4\.2\.\s+Actual\s+Strategic/i;
    
    let addedCrossDimensionalHeader = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      
      if (line.indexOf("## 2. The Core Hierarchy") !== -1) {
        currentSection = 'core';
        continue;
      } else if (stratHeaderRegex.test(line)) {
        currentSection = 'strategies';
        currentL1Code = "Cross-Dimensional";
        currentL1Name = "4. Cross-Dimensional Labels & Aggregators";
        if (!addedCrossDimensionalHeader) {
          data.push([
            currentL1Code, currentL1Name,
            "", "", "", "", "", "",
            "4. Cross-Dimensional Labels & Aggregators",
            "4. Cross-Dimensional Labels & Aggregators"
          ]);
          addedCrossDimensionalHeader = true;
        }
        continue;
      } else if (goalsHeaderRegex.test(line)) {
        currentSection = 'goals';
        currentL1Code = "Cross-Dimensional";
        currentL1Name = "4. Cross-Dimensional Labels & Aggregators";
        if (!addedCrossDimensionalHeader) {
          data.push([
            currentL1Code, currentL1Name,
            "", "", "", "", "", "",
            "4. Cross-Dimensional Labels & Aggregators",
            "4. Cross-Dimensional Labels & Aggregators"
          ]);
          addedCrossDimensionalHeader = true;
        }
        continue;
      } else if (line.indexOf("## ") === 0 || line.indexOf("---") === 0) {
        if (line.indexOf("Actual Trading") === -1 && line.indexOf("Actual Strategic") === -1) {
          currentSection = null;
        }
      }
      
      let m1 = line.match(l1Regex);
      if (m1) {
        currentSection = 'core';
      }

      if (currentSection === 'core') {
        if (m1) {
          currentL1Code = m1[1].trim();
          currentL1Name = m1[2].trim();
          
          data.push([
            currentL1Code, currentL1Name,
            "", "", "", "", "", "",
            `${currentL1Code} ${currentL1Name}`,
            `${currentL1Code} ${currentL1Name}`
          ]);
          continue;
        }
        
        let mSub = line.match(subfolderRegex);
        if (mSub && currentL1Code) {
          let folderName = mSub[1].replace(/`/g, '').trim();
          let desc = mSub[2].trim();
          
          data.push([
            currentL1Code, currentL1Name,
            "", "", "", "",
            folderName, desc,
            `${currentL1Code} ${currentL1Name}/${folderName}`,
            `${currentL1Code} ${currentL1Name} > ${folderName}`
          ]);
        }
      } else if (currentSection === 'strategies' || currentSection === 'goals') {
        let mSub = line.match(subfolderRegex);
        if (mSub) {
          let labelCode = mSub[1].replace(/`/g, '').trim();
          let desc = mSub[2].trim();
          
          data.push([
            currentL1Code, currentL1Name,
            "", "", "", "",
            labelCode, desc,
            `${currentL1Name}/${labelCode}`,
            `${currentL1Name} > ${labelCode}`
          ]);
        }
      }
    }
  } else {
    // Keep existing LOS parsing logic
    const l1Map = {};
    const l2Map = {};
    const l3Map = {};

    let l1Regex = /^(?:###|##)\s+(\d{2}\s00\s00)\s+(.+)$/;
    let l2Regex = /^(?:###|##|\*|-)\s+\*\*?(?:\[.+?\]\s)?(\d{2}\s[XY\d]{2}\s00)\s+(.+?)\*?\*?$/;
    let l3DetailedRegex = /^-\s+\*\*(\d{2}\s\d{2}\s\d{2})\s+([^:]+):\*\*(.*)$/;
    let l3SkeletonRegex = /^\s*(?:\*|-)\s+(\d{2}\s\d{2}\s\d{2})\s+(.+)$/;
    let l3HeadingRegex = /^###\s+(\d{2}\s\d{2}\s\d{2})\s+(.+)$/;
    let systemRegex = /^\*\s+\*\*(\d{2}\s[^\*:]+):\*\*(.*)$/;

    let currentL1 = "";
    let currentL2 = "";

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      let m1 = line.match(l1Regex);
      if (m1) {
        currentL1 = m1[1];
        l1Map[m1[1]] = m1[2].trim();
        currentL2 = "";
        continue;
      }

      let m2 = line.match(l2Regex);
      if (m2) {
        currentL2 = m2[1];
        l2Map[m2[1]] = { name: m2[2].replace(/\[AGGREGATOR\]/gi, "").trim(), l1: currentL1 };
        continue;
      }

      let m3 = line.match(l3DetailedRegex) || line.match(l3SkeletonRegex) || line.match(l3HeadingRegex);
      if (m3) {
        if (m3[1].endsWith("00") && !line.includes("03 00 99")) continue;
        
        let l3Code = m3[1];
        let rawName = m3[2].trim();
        
        rawName = rawName.replace(/^\*\*/, '').replace(/\*\*:.*$/, '').replace(/:.*$/, '').replace("(Standing Contexts)", "").replace("(Active)", "").replace("(Passive)", "").replace(/\[AGGREGATOR\]/gi, "").trim();

        if (!l3Map[l3Code] || (l3Map[l3Code] && l3Map[l3Code].name === "")) {
            let inferredL2 = l3Code.substring(0, 5) + " 00";
            let inferredL1 = l3Code.substring(0, 2) + " 00 00";
            l3Map[l3Code] = { name: rawName, l2: inferredL2, l1: inferredL1 };
        }
      }
    }

    // 1. L1 Nodes
    for (let l1Code in l1Map) {
        data.push([
            l1Code, l1Map[l1Code],
            "", "", "", "", "", "",
            `${l1Code.substring(0,2)} ${clean(l1Map[l1Code])}`,
            `${l1Code} ${clean(l1Map[l1Code])}`
        ]);
    }

    // 2. L2 Nodes
    for (let l2Code in l2Map) {
        let l2Data = l2Map[l2Code];
        let l1Code = l2Data.l1;
        let l1Name = l1Map[l1Code] || "";
        data.push([
            l1Code, l1Name,
            l2Code, l2Data.name,
            "", "", "", "",
            `${l1Code.substring(0,2)} ${clean(l1Name)}/${l2Code.substring(3,5)} ${clean(l2Data.name)}`,
            `${l2Code} ${clean(l2Data.name)}`
        ]);
    }

    // 3. L3 Nodes
    for (let l3Code in l3Map) {
        let l3Data = l3Map[l3Code];
        let l2Code = l3Data.l2;
        let l1Code = l3Data.l1;
        let l2Name = l2Map[l2Code] ? l2Map[l2Code].name : "";
        let l1Name = l1Map[l1Code] || "";
        
        let p1 = `${l1Code.substring(0,2)} ${clean(l1Name)}`;
        let p2 = l2Name ? `${l2Code.substring(3,5)} ${clean(l2Name)}` : "";
        let p3 = `${l3Code.substring(6,8)} ${clean(l3Data.name)}`;
        let label = p2 ? `${p1}/${p2}/${p3}` : `${p1}/${p3}`;
        
        data.push([
            l1Code, l1Name,
            l2Code, l2Name,
            l3Code, l3Data.name,
            "", "",
            label,
            `${l3Code} ${clean(l3Data.name)}`
        ]);
    }

    // 4. L4 Nodes (Markdown tables)
    let currentContextCode = "";
    let currentL4Parent = "";
    let isArchiveTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      let ctxMatch = line.match(/^(?:###|##)\s+(\d{2}\s\d{2}\s\d{2})\s+(.+)$/);
      if (ctxMatch) {
        currentContextCode = ctxMatch[1];
        currentL4Parent = ""; // Reset L4 parent nesting
        continue;
      }

      let l4ParentMatch = line.match(/^####\s+(\d{2}\s\d{2}\s\d{2})\s+[^>]+>\s*(\d{2}\s[^(\n\r]+)/);
      if (l4ParentMatch) {
        currentContextCode = l4ParentMatch[1];
        currentL4Parent = l4ParentMatch[2].split("(")[0].trim();
        continue;
      }

      if (line.startsWith("|")) {
        if (line.includes("---")) continue;
        
        if (line.includes("Code | Description")) {
            isArchiveTable = false;
            continue;
        }
        if (line.includes("Parent | Code | Original Description")) {
            isArchiveTable = true;
            continue;
        }

        if (isArchiveTable) {
            let cols = line.split("|").map(s => s.trim());
            if (cols.length >= 5) {
                let parentCode = cols[1];
                let code = cols[2].replace(/\*/g, '');
                let desc = cols[3];
                
                if (l3Map[parentCode]) {
                    let l2Code = l3Map[parentCode].l2;
                    let l1Code = l3Map[parentCode].l1;
                    
                    // Calculate the correct 99 Archive parent node
                    let archiveL3Code = `${parentCode.substring(0, 5)} 99`;
                    if (!l3Map[archiveL3Code]) {
                      // Fallback for special cases like Studies (03 00 99)
                      let altArchive = `${parentCode.substring(0, 2)} 00 99`;
                      if (l3Map[altArchive]) archiveL3Code = altArchive;
                    }
                    
                    // If we found a valid archive parent, use it. Otherwise, fallback to original.
                    let targetParentCode = l3Map[archiveL3Code] ? archiveL3Code : parentCode;
                    l3Map[targetParentCode].hasL4 = true;
                    
                    let p1 = `${l1Code.substring(0,2)} ${clean(l1Map[l1Code])}`;
                    let p2 = l2Map[l2Code] ? `${l2Code.substring(3,5)} ${clean(l2Map[l2Code].name)}` : "";
                    let p3 = `${targetParentCode.substring(6,8)} ${clean(l3Map[targetParentCode].name)}`;
                    
                    let label = p2 ? `${p1}/${p2}/${p3}/${code}` : `${p1}/${p3}/${code}`;
                    let path = `${targetParentCode} ${clean(l3Map[targetParentCode].name)} > ${code}`;
                    
                    data.push([
                        l1Code, l1Map[l1Code] || "",
                        l2Code, l2Map[l2Code] ? l2Map[l2Code].name : "",
                        targetParentCode, l3Map[targetParentCode].name,
                        code, desc,
                        label, path
                    ]);
                }
            }
        } else {
            let cols = line.split("|").map(s => s.trim());
            if (cols.length >= 4) {
                let code = cols[1].replace(/\*/g, '');
                let desc = cols[2];
                
                if (currentContextCode) {
                    let inferredL2 = currentContextCode.substring(0, 5) + " 00";
                    let inferredL1 = currentContextCode.substring(0, 2) + " 00 00";
                    
                    let l1Name = l1Map[inferredL1] || "";
                    let l2Name = l2Map[inferredL2] ? l2Map[inferredL2].name : "";
                    let l3Name = l3Map[currentContextCode] ? l3Map[currentContextCode].name : "";
                    
                    let p1 = `${inferredL1.substring(0,2)} ${clean(l1Name)}`;
                    let p2 = l2Name ? `${inferredL2.substring(3,5)} ${clean(l2Name)}` : "";
                    let p3 = `${currentContextCode.substring(6,8)} ${clean(l3Name)}`;
                    
                    let concatLabel = "";
                    let concatPath = "";
                    
                    if (l3Name) {
                        if (currentL4Parent) {
                            concatLabel = p2 ? `${p1}/${p2}/${p3}/${currentL4Parent}/${code}` : `${p1}/${p3}/${currentL4Parent}/${code}`;
                            concatPath = `${currentContextCode} ${clean(l3Name)} > ${currentL4Parent} > ${code}`;
                        } else {
                            concatLabel = p2 ? `${p1}/${p2}/${p3}/${code}` : `${p1}/${p3}/${code}`;
                            concatPath = `${currentContextCode} ${clean(l3Name)} > ${code}`;
                        }
                    } else if (l2Name) {
                        concatLabel = p2 ? `${p1}/${p2}/${code}` : `${p1}/${code}`;
                        concatPath = `${inferredL2} ${clean(l2Name)} > ${code}`;
                    } else {
                        concatLabel = `${p1}/${code}`;
                        concatPath = `${inferredL1} ${clean(l1Name)} > ${code}`;
                    }
                    
                    data.push([
                        inferredL1, l1Name,
                        inferredL2, l2Name,
                        currentContextCode !== inferredL2 ? currentContextCode : "", l3Name,
                        code, desc,
                        concatLabel, concatPath
                    ]);
                }
            }
        }
      }
    }

    // 5. System Tags
    let inSystemTags = false;
    let currentSystemParent = "";
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.includes("## 5. System & Operational Tags")) {
            inSystemTags = true;
            continue;
        }
        if (inSystemTags) {
            if (line.startsWith("###")) {
                currentSystemParent = line.replace("###", "").trim();
            } else if (line.match(systemRegex)) {
                let m = line.match(systemRegex);
                let code = m[1].trim();
                let desc = m[2].trim();
                data.push([
                    "00 00 00", "System",
                    "", "",
                    "", "",
                    code, desc,
                    code,
                    code
                ]);
            }
        }
    }
  }

  // --- GENERATE DRIVE PATH COLUMN ---
  if (!isPmt) {
    // INJECT INVISIBLE BRIDGE: For The Clerk to successfully route Daniel's PMT employment documents
    data.push([
      "02 00 00", "Work", 
      "02 01 00", "Employment", 
      "02 01 01", "Playmetech", 
      "Contract, Personal Documents", "Bridge to PMTOS Personal Documents", 
      "02 Work/01 Employment/01 Playmetech/01 Playmetech Admin/Contract, Personal Documents", 
      "02 00 00 Work > 02 01 00 Employment > 02 01 01 Playmetech > 01 Playmetech Admin > Contract, Personal Documents"
    ]);
  }

  data[0].push("Drive Path");
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let l1Code = row[0];
    let l1Name = clean(row[1]);
    let l2Code = row[2];
    let l2Name = clean(row[3]);
    let l3Code = row[4];
    let l3Name = clean(row[5]);
    
    if (l1Code === "00 00 00" || l1Code === "Cross-Dimensional") {
      row.push(row[8]); // System tags and cross-dimensional labels keep their base label
      continue;
    }

    let concatLabel = row[8];
    if (!concatLabel) {
       row.push("");
       continue;
    }

    let parts = concatLabel.split("/");
    let driveParts = [];
    let prefixCount = 0;
    
    if (l1Code && l1Name) { driveParts.push(`${l1Code} ${l1Name}`.trim()); prefixCount++; }
    if (l2Code && l2Name) { driveParts.push(`${l2Code} ${l2Name}`.trim()); prefixCount++; }
    if (l3Code && l3Name) { driveParts.push(`${l3Code} ${l3Name}`.trim()); prefixCount++; }
    
    for (let j = prefixCount; j < parts.length; j++) {
       driveParts.push(parts[j]);
    }

    row.push(driveParts.join("/"));
  }

  // Adjust labels for PMT account context 
  // (Obsolete logic for stripping '02 Work/01 Employment/01 Playmetech/' removed as PMT is now flat)

  // --- RESOLVE DRIVE IDs ---
  data[0].push("Drive ID");
  const rootFolderId = DriveApp.getRootFolder().getId();
  const folderCache = { "root": rootFolderId };
  const drivePathIndex = data[0].indexOf("Drive Path");
  
  for (let i = 1; i < data.length; i++) {
    let drivePathStr = data[i][drivePathIndex];
    if (!drivePathStr) {
      data[i].push("");
      continue;
    }
    
    // Ignore System categories from strict Drive mapping
    let firstPart = drivePathStr.split("/")[0] || "";
    if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0) {
      data[i].push("");
      continue;
    }
    
    const parts = drivePathStr.split("/").map(s => s.trim());
    let currentFolderId = folderCache["root"];
    let currentPathStr = "";
    let found = true;
    
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (!part) continue;
      currentPathStr += "/" + part;
      
      if (folderCache[currentPathStr]) {
        currentFolderId = folderCache[currentPathStr];
        continue;
      }
      
      try {
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
        if (nextFolder) {
          currentFolderId = nextFolder.getId();
          folderCache[currentPathStr] = currentFolderId;
        } else {
          found = false;
          break; // Folder doesn't exist yet
        }
      } catch(e) {
        found = false;
        break;
      }
    }
    
    if (found && folderCache[currentPathStr]) {
      data[i].push(folderCache[currentPathStr]);
    } else {
      data[i].push("");
    }
  }

  // Dump to sheet
  const ss = SpreadsheetApp.openById(sheetId);
  const sheets = ss.getSheets();
  let targetSheet = null;
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == targetGid) {
      targetSheet = sheets[i];
      break;
    }
  }
  
  if (!targetSheet) throw new Error("Sheet with GID " + targetGid + " not found.");
  
  targetSheet.clearContents();
  if (data.length > 0) {
    targetSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    targetSheet.getRange(1, 1, 1, data[0].length).setFontWeight("bold");
    targetSheet.autoResizeColumns(1, data[0].length);
  }

  // 6. Export JSON and CSV
  const jsonOutput = [];
  const csvRows = [];
  csvRows.push(data[0].map(h => `"${h}"`).join(","));
  
  for(let i=1; i<data.length; i++) {
     let row = data[i];
     let obj = {};
     for(let j=0; j<data[0].length; j++) {
        obj[data[0][j]] = row[j];
     }
     if (isPmt && row[6]) {
        obj["L4 Code"] = row[6];
     }
     jsonOutput.push(obj);
     csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }

  const taxPrefix = isPmt ? "PMTOS_Taxonomy" : "LOS_Taxonomy";

  const jsonBlob = Utilities.newBlob(JSON.stringify(jsonOutput, null, 2), "application/json", taxPrefix + ".json");
  const csvBlob = Utilities.newBlob(csvRows.join("\n"), "text/csv", taxPrefix + ".csv");

  const parentFolder = file.getParents().next();
  
  const existingJson = parentFolder.getFilesByName(taxPrefix + ".json");
  if(existingJson.hasNext()) {
      existingJson.next().setContent(jsonBlob.getDataAsString());
  } else {
      parentFolder.createFile(jsonBlob);
  }
  
  const existingCsv = parentFolder.getFilesByName(taxPrefix + ".csv");
  if(existingCsv.hasNext()) {
      existingCsv.next().setContent(csvBlob.getDataAsString());
  } else {
      parentFolder.createFile(csvBlob);
  }

  Logger.log("Successfully synced " + (data.length - 1) + " taxonomy rows to the Google Sheet.");
  Logger.log("Successfully exported " + taxPrefix + ".json and " + taxPrefix + ".csv to Google Drive.");

  // Automatically align Gmail labels in both environments
  try {
    cleanAndCreateGmailLabels();
  } catch(e) {
    Logger.log("Failed to sync Gmail labels: " + e.message);
  }
}

/**
 * Scans for folders with a "[DONE]" prefix and removes the prefix, logging changes.
 * @returns {void}
 */
function executeDoneReset() {
  
  const TARGET_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID;
  const MASTER_SHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  if (!TARGET_FOLDER_ID) {
    console.error("executeDoneReset failed: Missing Script Property WORKSPACE_FOLDER_ID");
    return;
  }
  if (!MASTER_SHEET_ID) {
    console.error("executeDoneReset failed: Missing Script Property MASTER_SHEET_ID");
    return;
  }

  const RESET_GID = SYSTEM_CONFIG.SHEETS.RESET;
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

    const isPmt = IS_PMT_ENV;
    const BATCH_SIZE = 10;
    const TARGET_DEPTH = 6; // Increased from 4 to support PMTOS nested structures (e.g. 5-level Bridge)

    const fileId = SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID;
    if (!fileId) {
      console.error("TAXONOMY_JSON_ID missing in config.");
      return;
    }
    const taxonomyFile = DriveApp.getFileById(fileId);
    const taxonomy = JSON.parse(taxonomyFile.getBlob().getDataAsString());
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

      if (isPmt && !item["L4 Code"]) {
        continue;
      }

      if (item && item["Drive Path"]) {
        const folderNames = item["Drive Path"].split("/").map(s => s.trim());
        const firstPart = folderNames[0] || "";

        // Ignore system triage (00) and system operational (99) tags in Drive
        if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System" || item["L1 Code"] === "Cross-Dimensional") {
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

  // Construct the exact folder hierarchy by splitting Drive Path
  const folderNames = item["Drive Path"] ? item["Drive Path"].split("/").map(s => s.trim()) : [];
  if (folderNames.length === 0) return "VIRTUAL_LABEL";

  const isPmt = IS_PMT_ENV;

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

    const fileId = SYSTEM_CONFIG.DOCS.TAXONOMY_JSON_ID;
    if (!fileId) {
      console.error("TAXONOMY_JSON_ID missing in config.");
      return [];
    }
    const taxonomyFile = DriveApp.getFileById(fileId);
    const taxonomy = JSON.parse(taxonomyFile.getBlob().getDataAsString());
    if (!Array.isArray(taxonomy)) {
      console.error("auditWorkspaceFolders failed: Parsed taxonomy is not an array.");
      return [];
    }

    // Build set of valid relative paths from the taxonomy
    const validPaths = new Set();
    const TARGET_DEPTH = 6; // Increased from 4 to support PMTOS nested structures (e.g. 5-level Bridge)

    taxonomy.forEach(item => {
      if (item && item["Drive Path"]) {
        const path = item["Drive Path"].trim();
        if (!path) return;

        const parts = path.split("/").map(s => s.trim());
        const firstPart = parts[0] || "";

        // Ignore system triage (00) and system operational (99) tags
        if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System" || item["L1 Code"] === "Cross-Dimensional") {
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
