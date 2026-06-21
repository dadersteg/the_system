/**
 * THE SYSTEM: GMAIL LABEL EXPORTER
 * Fetches all Gmail labels, populates the Label Management sheet tab,
 * and exports a JSON file to the main Drive workspace for agent context.
 */

function updateLabelList() {
const ss = getMasterSpreadsheet();
  
  // Try to find the Label Management tab (GID from Clerk) or default to creating a new one
  const targetGid = parseInt(SYSTEM_CONFIG.SHEETS.LABEL_MANAGEMENT, 10); 
  const sheets = ss.getSheets();
  
  // ES6 Refactoring: Use find instead of iterative loop
  let sheet = sheets.find(s => s.getSheetId() === targetGid) || ss.insertSheet("Actual Gmail Labels");

  // 1. Fetch Labels
  const labels = GmailApp.getUserLabels();
  // Sort alphabetically
  labels.sort((a, b) => a.getName().localeCompare(b.getName()));

  const tableData = [["Label Name", "Label Content", "Unread Count", "Total Threads"]];
  
  // ES6 Refactoring: Map over labels to build the JSON and Table Data cleanly
  const jsonOutput = labels.map(l => {
    const name = l.getName();
    const parts = name.split("/");
    const leaf = parts[parts.length - 1];
    const unreadCount = l.getUnreadCount();
    const threadCount = l.getThreads().length;

    tableData.push([name, leaf, unreadCount, threadCount]);

    return {
      name: name,
      leaf: leaf,
      unread_count: unreadCount
    };
  });

  // 2. Write to Spreadsheet
  sheet.clear();
  const range = sheet.getRange(1, 1, tableData.length, tableData[0].length);
  range.setValues(tableData);
  
  // Format Headers
  const headerRange = sheet.getRange(1, 1, 1, tableData[0].length);
  headerRange.setFontWeight("bold"); 
  headerRange.setBackground("#f3f3f3");
  
  sheet.autoResizeColumns(1, tableData[0].length);
  
  // 3. Export to Google Drive as JSON
  const TARGET_FOLDER_ID = SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID; // Main Docs Workspace
  const fileName = "Actual_Gmail_Labels.json";
  
  try {
    const targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const jsonBlob = Utilities.newBlob(JSON.stringify(jsonOutput, null, 2), "application/json", fileName);
    
    const existingFiles = targetFolder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      existingFiles.next().setContent(jsonBlob.getDataAsString());
    } else {
      targetFolder.createFile(jsonBlob);
    }
    console.log(`Successfully exported ${labels.length} labels to Drive and Sheet.`);
  } catch (e) {
    console.error("Failed to write JSON to Drive: " + e.message);
  }
}

/**
 * Cleans up legacy/messed up labels starting with '02 Work/01 Employment/' and
 * creates the correct flat WOS Gmail labels if missing.
 */
function cleanAndCreateGmailLabels() {
  const isPmt = isPmtAccount();
  
  console.log(`Starting Gmail Labels cleanup and alignment for ${isPmt ? "PMT" : "Private"} profile...`);
  const labels = GmailApp.getUserLabels();
  
  // 1. Delete legacy/messed up labels
  // Removed legacy hardcoded deletion of '02 Work' labels to prevent deleting active labels.
  
  // 2. Fetch the taxonomy JSON dynamically
  const taxonomyFilename = isPmt ? "PMTOS_Taxonomy.json" : "LOS_Taxonomy.json";
  const files = DriveApp.getFilesByName(taxonomyFilename);
  if (!files.hasNext()) {
    console.error(taxonomyFilename + " not found. Please run syncTaxonomyToSheet() first.");
    return;
  }
  
  let taxonomy;
  try {
    taxonomy = JSON.parse(files.next().getBlob().getDataAsString());
  } catch (e) {
    console.error(`Failed to parse ${taxonomyFilename}: ${e.message}`);
    return;
  }
  
  const validLabels = new Set();
  
  taxonomy.forEach(item => {
    if (item && item["Concat (Label)"]) {
      const parts = item["Concat (Label)"].split("/").map(s => s.trim()).filter(Boolean);
      const firstPart = parts[0] || "";
      
      // Ignore system triage (00), system operational (99) tags, and cross-dimensional (goals/strategies)
      if (firstPart.indexOf("00 ") === 0 || firstPart.indexOf("99 ") === 0 || item["L1 Code"] === "00 00 00" || item["L1 Name"] === "System" || item["L1 Code"] === "Cross-Dimensional") {
        return;
      }
      
      // Build nested labels for all levels automatically
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? currentPath + "/" + parts[i] : parts[i];
        validLabels.add(currentPath);
      }
    }
  });
  
  // 3. Create the valid labels if missing
  validLabels.forEach(name => {
    let existing = GmailApp.getUserLabelByName(name);
    if (!existing) {
      console.log(`[ACTION] Creating label: ${name}`);
      try {
        GmailApp.createLabel(name);
      } catch(e) {
        console.error(`Failed to create label ${name}: ${e.message}`);
      }
    }
  });
  
  // 4. Safely migrate any duplicate label paths that might have been hallucinated by LLM
  migrateDuplicateGmailLabels();
  
  console.log("Gmail labels cleanup and alignment complete.");
}

/**
 * Safely migrates threads from duplicate Gmail labels (those with a 6-digit prefix structure,
 * e.g., starting with "01 00 00 Private" matching the Concat Path) to the correct 2-digit label 
 * (e.g., "01 Private" matching the Concat Label), and then deletes the duplicate label.
 */
function migrateDuplicateGmailLabels() {
  const isPmt = typeof isPmtAccount === 'function' ? isPmtAccount() : false;
  console.log(`Starting migration of duplicate Gmail labels for ${isPmt ? "PMT" : "Private"} profile...`);
  
  const labels = GmailApp.getUserLabels();
  let migratedCount = 0;
  
  function getCorrectLabelName(duplicateName) {
    return duplicateName.split('/').map(segment => {
      let match;
      if ((match = segment.match(/^(\d{2}) 00 00 (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      } else if ((match = segment.match(/^\d{2} (\d{2}) 00 (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      } else if ((match = segment.match(/^\d{2} \d{2} (\d{2}) (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      }
      return segment.trim();
    }).join('/');
  }
  
  labels.forEach(label => {
    const name = label.getName();
    
    // If the name starts with a 6-digit prefix, it's a duplicate path generated by the LLM hallucination
    if (/^\d{2} \d{2} \d{2}/.test(name)) {
      const correctName = getCorrectLabelName(name);
      
      if (correctName !== name) {
        console.log(`[ACTION] Migrating duplicate label: '${name}' -> '${correctName}'`);
        
        try {
          let correctLabel = GmailApp.getUserLabelByName(correctName);
          if (!correctLabel) {
            correctLabel = GmailApp.createLabel(correctName);
          }
          
          // Migrate threads safely in batches (getThreads has a 500 limit)
          let threads = label.getThreads();
          while (threads.length > 0) {
            for (let i = 0; i < threads.length; i++) {
              threads[i].addLabel(correctLabel);
              threads[i].removeLabel(label);
            }
            threads = label.getThreads(); // Fetch next batch of threads still attached to this label
          }
          
          label.deleteLabel();
          migratedCount++;
        } catch (e) {
          console.error(`Failed to migrate label ${name}: ${e.message}`);
        }
      }
    }
  });
  
  console.log(`Duplicate Gmail labels migration complete. Total migrated: ${migratedCount}`);
}

/**
 * Emergency Recovery Script: Restores lost Gmail labels caused by the migration pagination bug.
 * Reads the historical 'Execution Log' and 'Execution Log - Retro' to find the proposed labels 
 * and re-applies them without using any LLM tokens.
 */
function recoverLostLabelsFromLog() {
  console.log("Starting Emergency Label Recovery from Logs...");
  
  const ss = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
  const isPmt = typeof isPmtAccount === 'function' ? isPmtAccount() : false;
  
  // Hardcoded GIDs based on environment
  const targetGids = isPmt ? ["2131515996"] : ["2131515996", "67786861"];
  
  let recoveredCount = 0;

  for (const gid of targetGids) {
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === gid);
    if (!sheet) {
      console.warn(`Could not find sheet with GID ${gid}`);
      continue;
    }
    
    console.log(`Processing recovery for sheet GID: ${gid}`);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    // Header row
    const header = data[0];
    let linkColIdx = header.indexOf("Link");
    let proposedColIdx = header.indexOf("Proposed Recovery Labels");
    
    if (linkColIdx === -1) linkColIdx = 8; // Fallback
    
    if (proposedColIdx === -1) {
      console.warn(`Sheet GID ${gid} does not have a 'Proposed Recovery Labels' column. Run cleanExecutionLogLabels first!`);
      continue;
    }
    
    // Iterate backwards (newest first)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const proposedLabelsStr = row[proposedColIdx]; 
      const linkStr = row[linkColIdx];
      
      if (!linkStr || !proposedLabelsStr) continue;
      
      // Extract thread ID from the link: https://mail.google.com/mail/u/0/#all/[THREAD_ID]
      const match = linkStr.match(/#all\/([^&]+)/);
      if (!match) continue;
      
      const threadId = match[1];
      
      try {
        const thread = GmailApp.getThreadById(threadId);
        if (!thread) continue;
        
        const currentLabels = thread.getLabels().map(l => l.getName());
        
        const targetLabels = proposedLabelsStr.split(',').map(l => l.trim()).filter(l => l);
        
        let needsRecovery = false;
        for (const target of targetLabels) {
          if (!currentLabels.includes(target) && target !== "99 Label_Reviewed" && target !== "99 To be deleted" && target !== "00 Manual Review") {
            needsRecovery = true;
            
            let gLabel = GmailApp.getUserLabelByName(target);
            if (!gLabel) {
              gLabel = GmailApp.createLabel(target);
            }
            thread.addLabel(gLabel);
            console.log(`[RECOVERED] Thread ${threadId} restored label: ${target}`);
          }
        }
        
        if (needsRecovery) {
          recoveredCount++;
        }
        
      } catch (e) {
        // Ignore threads that might have been permanently deleted
        console.warn(`Could not process thread ${threadId}: ${e.message}`);
      }
    }
  }
  
  console.log(`Recovery complete. Total threads successfully restored: ${recoveredCount}`);
}

/**
 * Utility Script: Cleans the Execution Logs by translating any 6-digit hallucinated labels 
 * into the correct 2-digit Gmail labels. Writes the result to a new "Proposed Recovery Labels"
 * column without touching the original "Final Label Set" column.
 */
function cleanExecutionLogLabels() {
  console.log("Starting Execution Log non-destructive cleanup...");
  
  const ss = SpreadsheetApp.openById(SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID);
  const isPmt = typeof isPmtAccount === 'function' ? isPmtAccount() : false;
  
  // Hardcoded GIDs based on environment
  const targetGids = isPmt ? ["2131515996"] : ["2131515996", "67786861"];
  
  function toTwoDigitFormat(labelPath) {
    return labelPath.split('/').map(segment => {
      let match;
      if ((match = segment.match(/^(\d{2}) 00 00 (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      } else if ((match = segment.match(/^\d{2} (\d{2}) 00 (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      } else if ((match = segment.match(/^\d{2} \d{2} (\d{2}) (.+)$/))) {
        return `${match[1]} ${match[2].trim()}`;
      }
      return segment.trim();
    }).join('/');
  }

  for (const gid of targetGids) {
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === gid);
    if (!sheet) {
      console.warn(`Could not find sheet with GID ${gid}`);
      continue;
    }
    
    console.log(`Cleaning sheet GID: ${gid}`);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const header = data[0];
    let finalLabelIdx = header.indexOf("Final Label Set");
    if (finalLabelIdx === -1) finalLabelIdx = 7; // Fallback
    
    // Check if Proposed Recovery Labels column exists, if not, create it
    let proposedColIdx = header.indexOf("Proposed Recovery Labels");
    if (proposedColIdx === -1) {
      proposedColIdx = header.length;
      sheet.getRange(1, proposedColIdx + 1).setValue("Proposed Recovery Labels");
      sheet.getRange(1, proposedColIdx + 1).setFontWeight("bold");
    }
    
    let updateCount = 0;
    // Prepare a batch of values to write
    const writeData = [];
    
    for (let i = 1; i < data.length; i++) {
      const finalLabels = data[i][finalLabelIdx];
      let proposedLabels = "";
      
      if (typeof finalLabels === 'string' && finalLabels) {
        proposedLabels = finalLabels.split(',').map(l => toTwoDigitFormat(l.trim())).join(', ');
      }
      
      writeData.push([proposedLabels]);
      if (proposedLabels) updateCount++;
    }
    
    // Write the proposed labels to the spreadsheet in one batch
    sheet.getRange(2, proposedColIdx + 1, writeData.length, 1).setValues(writeData);
    
    console.log(`Sheet GID ${gid} cleanup complete. Wrote ${updateCount} proposed labels.`);
  }
}
