/**
 * @file src/Code_TheClerk_Antigravity.js
 * @description Syncs Antigravity conversation transcripts to the 5 Import - Antigravity Log tab using Gemini API.
 */

function runAntigravitySync() {
  const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
  const BRAIN_FOLDER_ID = "19Yq7j6eyV3hmw83RPbBv2Ro0eJMnlTUM";
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName("5 Import - Antigravity Log");
  if (!logSheet) {
    console.error("runAntigravitySync: '5 Import - Antigravity Log' tab not found.");
    return;
  }
  
  // Get all existing convo IDs to know if we are doing incremental or full
  try {
    const SPREADSHEET_ID = SYSTEM_CONFIG.ROOTS.MASTER_SHEET_ID;
    const BRAIN_FOLDER_ID = "19Yq7j6eyV3hmw83RPbBv2Ro0eJMnlTUM";
    const MODEL = SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE || "gemini-2.5-flash";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName("5 Import - Antigravity Log");
    if (!logSheet) {
      console.error("runAntigravitySync: '5 Import - Antigravity Log' tab not found.");
      return;
    }
    
    const lastRow = logSheet.getLastRow();
    const range = logSheet.getRange(2, 1, Math.max(1, lastRow - 1), 7);
    const data = lastRow > 1 ? range.getValues() : [];
    
    // Create a map of existing convo IDs to their data to check for duplicates / incremental updates
    const existingConvos = {};
    for (let row of data) {
      if (row[1]) { // Convo ID is column B
        existingConvos[row[1]] = row;
      }
    }
    
    // Only process files modified in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // We search for jsonl files. The transcript.jsonl files are usually named transcript.jsonl
    const query = `title = 'transcript.jsonl' and modifiedDate > '${yesterday.toISOString()}'`;
    const files = DriveApp.searchFiles(query);
    
    let processedCount = 0;
    while (files.hasNext() && processedCount < 20) { // Limit to 20 per run to avoid timeout
      const file = files.next();
      
      // Ensure this is actually an Antigravity log by verifying its parent structure
      // Structure: brain/<convo-id>/.system_generated/logs/transcript.jsonl
      const parents = file.getParents();
      let isValid = false;
      let convoId = "Unknown";
      
      if (parents.hasNext()) {
        const logsFolder = parents.next();
        const sysParents = logsFolder.getParents();
        if (sysParents.hasNext()) {
          const sysFolder = sysParents.next();
          const convoParents = sysFolder.getParents();
          if (convoParents.hasNext()) {
            const convoFolder = convoParents.next();
            convoId = convoFolder.getName();
            
            // Check if it's inside the brain folder
            const brainParents = convoFolder.getParents();
            if (brainParents.hasNext()) {
              if (brainParents.next().getId() === BRAIN_FOLDER_ID) {
                isValid = true;
              }
            }
          }
        }
      }
      
      if (!isValid) continue;
      
      console.log(`Processing transcript for Convo: ${convoId}`);
      
      const content = file.getBlob().getDataAsString();
      const lines = content.split('\n');
      
      const existingRow = existingConvos[convoId];
      let prompt = "";
      
      if (existingRow) {
        // Incremental Update
        const recentLines = lines.slice(-200).join('\n');
        prompt = `You are an expert project manager. I am giving you the latest transcript from an ongoing AI Agent conversation.
The conversation's overall purpose is: "${existingRow[5]}"
The previous summary of work was: "${existingRow[6]}"

Based on the recent transcript below, provide an updated, concise bulleted summary of the actual work completed recently. Focus ONLY on new work done in this transcript chunk.
Return EXACTLY a valid JSON object with the key "summary".

TRANSCRIPT:
${recentLines}`;
      } else {
        // New Conversation
        let startLines = lines.slice(0, 100).join('\n');
        let endLines = lines.slice(-200).join('\n');
        let compressed = startLines + "\n\n...[MIDDLE TRUNCATED]...\n\n" + endLines;
        if (lines.length < 300) compressed = lines.join('\n');
        
        prompt = `You are an expert project manager. Review the following AI Agent conversation transcript and extract the key tasks and purpose.
Return EXACTLY a valid JSON object with the following keys:
- "type": "Main User" if this conversation is driven by a human user, or "Subagent" if this is a sub-agent conversation spawned by another agent.
- "name": A short 3-5 word title for the conversation
- "purpose": A 1-2 sentence description of the overall goal or purpose of the conversation based on the start.
- "summary": A concise bulleted summary of the actual work completed by the AI agent.

TRANSCRIPT:
${compressed}`;
      }
      
      // Call Gemini API
      try {
        const parsed = callGemini(prompt, MODEL, "You are an expert project manager.", null);
        
        if (parsed && !parsed.error) {
          const currentDate = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
          
          if (existingRow) {
            logSheet.appendRow([
              currentDate,
              convoId,
              existingRow[2],
              existingRow[3],
              existingRow[4],
              existingRow[5],
              parsed.summary
            ]);
          } else {
            let createdDate = Utilities.formatDate(file.getDateCreated(), "GMT", "yyyy-MM-dd HH:mm:ss");
            try {
              const firstStep = JSON.parse(lines[0]);
              if (firstStep.created_at) {
                createdDate = firstStep.created_at.replace("T", " ").replace("Z", "");
              }
            } catch(e) {}
            
            logSheet.appendRow([
              currentDate,
              convoId,
              parsed.type || "Main User",
              parsed.name,
              createdDate,
              parsed.purpose,
              parsed.summary
            ]);
          }
        } else {
          console.error(`Gemini Error on ${convoId}: ${parsed ? parsed.error : "Unknown Error"}`);
        }
      } catch (e) {
        console.error(`Failed to process ${convoId}: ${e.message}`);
      }
      
      processedCount++;
    }
    
    console.log(`Successfully processed ${processedCount} conversations via Antigravity Sync.`);
  } catch (e) {
    console.error(`runAntigravitySync failed: ${e.message}`);
  }
}
