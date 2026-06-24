import re

with open("src/Code_TaskEngine.js", "r") as f:
    content = f.read()

# 1. Fix Native Link Loss on Move
target1 = """          console.log(`Moving task "${finalTitle}" from Importer to ToDo`);
          const newTask = {
            title: finalTitle,
            notes: newNotesStr,
            due: finalDue,
            status: u.routingTarget === "COMPLETE" ? "completed" : "needsAction"
          };"""

new1 = """          console.log(`Moving task "${finalTitle}" from Importer to ToDo`);
          
          let extendedNotes = newNotesStr;
          if (task.links && Array.isArray(task.links)) {
             const emailLinkObj = task.links.find(l => l.type === "email");
             if (emailLinkObj && emailLinkObj.link && !extendedNotes.includes(emailLinkObj.link)) {
                 extendedNotes += `\\n\\n[Original Source Link]: ${emailLinkObj.link}`;
             }
          } else if (task.webViewLink && !extendedNotes.includes(task.webViewLink)) {
             extendedNotes += `\\n\\n[Original Source Link]: ${task.webViewLink}`;
          }

          const newTask = {
            title: finalTitle,
            notes: extendedNotes,
            due: finalDue,
            status: u.routingTarget === "COMPLETE" ? "completed" : "needsAction"
          };"""

if target1 in content:
    content = content.replace(target1, new1)
else:
    print("Target 1 not found")

# 2. Fix AI Hash Instability
target2 = """      let normFinalNotes = finalNotes.join('\\n').replace(/---SYSTEM_METADATA---.*/s, "");
      normFinalNotes = normFinalNotes.replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/\\s+/g, " ").trim();
      const normFinalTitle = finalTitle.replace(/\\s+/g, " ").trim();
      const normFinalDue = (finalDue || "").replace(/\\s+/g, " ").trim();
      const normFinalStatus = finalStatus.replace(/\\s+/g, " ").trim();"""

new2 = """      let normFinalNotes = finalNotes.join('\\n').replace(/---SYSTEM_METADATA---.*/s, "");
      normFinalNotes = normFinalNotes.replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/\\s+/g, " ").trim();
      // Normalize title by removing dynamic brackets so minor AI edits don't break the hash
      const normFinalTitle = finalTitle.replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/\\s+/g, " ").trim();
      const normFinalDue = (finalDue || "").replace(/\\s+/g, " ").trim();
      const normFinalStatus = finalStatus.replace(/\\s+/g, " ").trim();"""

if target2 in content:
    content = content.replace(target2, new2)
else:
    print("Target 2 not found")

with open("src/Code_TaskEngine.js", "w") as f:
    f.write(content)
