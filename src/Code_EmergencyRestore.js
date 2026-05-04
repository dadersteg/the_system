function runEmergencyRestore() {
  console.log("Starting Emergency Data Restore & Cleanup V2...");
  
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId().toString() === CONFIG.targetGid);
  const data = sheet.getDataRange().getValues();
  
  const headers = data[0];
  const taskIdIdx = headers.indexOf("Task ID");
  const taskListIdIdx = headers.indexOf("Task List ID");
  const notesRevIdx = headers.indexOf("Notes (Revised)");
  const notesOrigIdx = headers.indexOf("Notes (Original)");
  const deadlineRevIdx = headers.indexOf("Deadline (Revised)");
  const dateOrigIdx = headers.indexOf("Date");
  
  let restoredCount = 0;
  
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const taskId = row[taskIdIdx];
    const listId = row[taskListIdIdx];
    if (!taskId || !listId) continue;
    
    try {
      const task = Tasks.Tasks.get(listId, taskId);
      if (!task) continue;
      
      let sourceNotes = row[notesRevIdx];
      if (!sourceNotes || sourceNotes.toString().trim() === "") {
         sourceNotes = row[notesOrigIdx] || task.notes || "";
      } else {
         sourceNotes = sourceNotes.toString();
      }
      
      let cleanedText = sourceNotes;
      cleanedText = cleanedText.replace(/\[TaskMaster Logic:[\s\S]*?\]/g, "");
      cleanedText = cleanedText.replace(/DEADLINE:.*\n?/g, "");
      cleanedText = cleanedText.replace(/DURATION:.*\n?/g, "");
      cleanedText = cleanedText.replace(/GOAL:.*\n?/g, "");
      cleanedText = cleanedText.replace(/\[+\s*$/gm, ""); 
      
      // Extract ANY existing duration or goal before removing
      let preservedDuration = "N/A";
      let preservedGoal = "TBD";
      
      const v2BlockRegex = /\[DEADLINE:.*?\] \| \[DURATION:(.*?)\] \| \[GOAL:(.*?)\]/g;
      let match;
      while ((match = v2BlockRegex.exec(cleanedText)) !== null) {
         if (match[1].trim() !== "N/A" && match[1].trim() !== "") preservedDuration = match[1].trim();
         if (match[2].trim() !== "TBD" && match[2].trim() !== "") preservedGoal = match[2].trim();
      }
      
      // Also check V1 legacy formats for duration/goal just in case
      const durationMatch = sourceNotes.match(/DURATION:\s*(.*)/);
      if (durationMatch && durationMatch[1].trim() && durationMatch[1].trim() !== "N/A") preservedDuration = durationMatch[1].trim();
      
      const goalMatch = sourceNotes.match(/GOAL:\s*(.*)/);
      if (goalMatch && goalMatch[1].trim() && goalMatch[1].trim() !== "TBD") preservedGoal = goalMatch[1].trim();

      // Now strip V2 blocks
      cleanedText = cleanedText.replace(/\[DEADLINE:.*?\] \| \[DURATION:.*?\] \| \[GOAL:.*?\]/g, "");
      
      const urlMatch = cleanedText.match(/https?:\/\/[^\s]+/);
      let url = "";
      if (urlMatch) {
         url = urlMatch[0];
         cleanedText = cleanedText.replace(url, "");
      }
      
      let sysComment = "";
      let daComment = "";
      const sysMatch = cleanedText.match(/^SYS:.*$/m);
      if (sysMatch) {
         sysComment = sysMatch[0];
         cleanedText = cleanedText.replace(sysComment, "");
      }
      const daMatch = cleanedText.match(/^DA:.*$/m);
      if (daMatch) {
         daComment = daMatch[0];
         cleanedText = cleanedText.replace(daComment, "");
      }
      
      cleanedText = cleanedText.trim().replace(/\n{3,}/g, "\n\n");
      
      let deadlineStr = "None";
      const userDeadline = row[deadlineRevIdx];
      const origDeadline = row[dateOrigIdx];
      
      if (userDeadline && userDeadline.toString().trim() !== "") {
         const d = new Date(userDeadline);
         if (!isNaN(d.getTime())) deadlineStr = Utilities.formatDate(d, "GMT", "yyyy-MM-dd");
      } else if (origDeadline && origDeadline.toString().trim() !== "") {
         const d = new Date(origDeadline);
         if (!isNaN(d.getTime())) deadlineStr = Utilities.formatDate(d, "GMT", "yyyy-MM-dd");
      }
      
      const perfectV2Block = `[DEADLINE: ${deadlineStr}] | [DURATION: ${preservedDuration}] | [GOAL: ${preservedGoal}]`;
      
      const finalNotes = [];
      if (url) finalNotes.push(url);
      if (cleanedText) finalNotes.push(cleanedText);
      finalNotes.push(perfectV2Block);
      if (sysComment || daComment) {
         finalNotes.push("");
         if (sysComment) finalNotes.push(sysComment);
         if (daComment) finalNotes.push(daComment);
      }
      
      const reconstructed = finalNotes.join('\n\n').trim();
      
      if (task.notes !== reconstructed) {
         task.notes = reconstructed;
         Tasks.Tasks.update(task, listId, taskId);
         restoredCount++;
         Utilities.sleep(100); 
      }
      
    } catch(e) {
      console.error(`Failed on task ${taskId}: ${e.message}`);
    }
  }
  
  console.log(`Emergency Restore Complete! Restored & cleaned ${restoredCount} tasks.`);
}
