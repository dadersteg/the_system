import re

with open("src/Code_TheClerk_Drive.js", "r") as f:
    content = f.read()

target_logic = """            const finalName = getLockedName(data, f);
            const file = DriveApp.getFileById(f.id);

            file.setName(finalName);
            file.setDescription(`${data.description}\\n\\nSummary: ${data.summary}`);
            
            const targetFileUrl = f.isShortcut ? DriveApp.getFileById(f.targetId).getUrl() : file.getUrl();"""

new_logic = """            const finalName = getLockedName(data, f);
            let file = DriveApp.getFileById(f.id);
            
            // 1. Fetch original last updated time before any modifications
            let targetFileForDate = f.isShortcut ? DriveApp.getFileById(f.targetId) : file;
            const originalLastUpdatedMs = targetFileForDate.getLastUpdated().getTime();

            // 2. Owner check & automatic shortcut conversion for shared files
            if (!f.isShortcut) {
                try {
                    const owner = file.getOwner();
                    const myEmail = Session.getEffectiveUser().getEmail();
                    if (owner && owner.getEmail() !== myEmail) {
                        console.log(`   [SHARED] File is not owned by us (${owner.getEmail()}). Creating shortcut and removing original from Inbox.`);
                        const resource = {
                            name: finalName,
                            mimeType: "application/vnd.google-apps.shortcut",
                            shortcutDetails: { targetId: file.getId() },
                            parents: [f.sourceFolderId] // Create in source folder, moveTo will handle it later
                        };
                        const shortcut = Drive.Files.create(resource);
                        
                        // Remove original shared file from our source folder
                        DriveApp.getFolderById(f.sourceFolderId).removeFile(file);
                        
                        file = DriveApp.getFileById(shortcut.id);
                        f.isShortcut = true;
                        f.targetId = f.id; // The original file ID is now the target
                        f.id = shortcut.id; // The shortcut is now what we are processing
                    }
                } catch (e) {
                    console.error("Error checking owner or creating shortcut: " + e.message);
                }
            }

            // 3. Rename and Set Description (only renames the file or the shortcut, not the target)
            file.setName(finalName);
            file.setDescription(`${data.description}\\n\\nSummary: ${data.summary}`);
            
            const targetFileUrl = f.isShortcut ? DriveApp.getFileById(f.targetId).getUrl() : file.getUrl();"""

content = content.replace(target_logic, new_logic)

# Now, implement the staleness check for task extraction
task_extraction_target = """            // Extract and create nuanced actions/tasks
            let tasksCreated = 0;
            let extractedTasksLog = [];
            if (data.tasks && Array.isArray(data.tasks)) {"""

task_extraction_new = """            // Extract and create nuanced actions/tasks
            let tasksCreated = 0;
            let extractedTasksLog = [];
            
            const weeksLimit = 4;
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const isStale = (Date.now() - originalLastUpdatedMs) > (weeksLimit * msInWeek);
            
            if (isStale) {
                console.log(`   [SKIP TASKS] File hasn't been edited in over ${weeksLimit} weeks. Skipping task creation.`);
            } else if (data.tasks && Array.isArray(data.tasks)) {"""

content = content.replace(task_extraction_target, task_extraction_new)

with open("src/Code_TheClerk_Drive.js", "w") as f:
    f.write(content)
