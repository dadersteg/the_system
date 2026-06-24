import re

with open("src/Code_TaskEngine.js", "r") as f:
    content = f.read()

target = """                const subMeta = Object.assign({}, baseMetadata);
                subMeta.duration = sub.estimatedDuration || "N/A";
                
                const subNotes = "---SYSTEM_METADATA---\\n" + JSON.stringify(subMeta) + "\\n\\n--- ORIGINAL TASK DATA ---\\n" + (task.notes || "");
                
                const subTaskResource = {"""

new_code = """                const subMeta = Object.assign({}, baseMetadata);
                subMeta.duration = sub.estimatedDuration || "N/A";
                
                let cleanOriginalNotes = (task.notes || "").split('---SYSTEM_METADATA---')[0].trim();
                
                if (task.links && Array.isArray(task.links)) {
                   const emailLinkObj = task.links.find(l => l.type === "email");
                   if (emailLinkObj && emailLinkObj.link && !cleanOriginalNotes.includes(emailLinkObj.link)) {
                       cleanOriginalNotes += `\\n\\n[Original Source Link]: ${emailLinkObj.link}`;
                   }
                } else if (task.webViewLink && !cleanOriginalNotes.includes(task.webViewLink)) {
                   cleanOriginalNotes += `\\n\\n[Original Source Link]: ${task.webViewLink}`;
                }
                
                const subNotes = "--- ORIGINAL TASK DATA ---\\n" + cleanOriginalNotes + "\\n\\n---SYSTEM_METADATA---\\n" + JSON.stringify(subMeta);
                
                const subTaskResource = {"""

if target in content:
    content = content.replace(target, new_code)
    with open("src/Code_TaskEngine.js", "w") as f:
        f.write(content)
    print("Patched.")
else:
    print("Target not found.")
