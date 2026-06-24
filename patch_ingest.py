import re

with open("src/Code_TheClerk_Drive.js", "r") as f:
    content = f.read()

# Replace the Drive.Files.list fields to include parents
content = content.replace('fields: "files(id, name, mimeType)"', 'fields: "files(id, name, mimeType, parents)"')

# Inject the organized check
organized_logic = """    if (!existingTargets.has(sharedFile.id)) {
      let isOrganized = false;
      if (sharedFile.parents && sharedFile.parents.length > 0) {
        try {
          let current = DriveApp.getFolderById(sharedFile.parents[0]);
          while (current) {
            const cid = current.getId();
            if (cid === SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID || 
                cid === SYSTEM_CONFIG.DRIVE_FOLDERS.STND_DEST || 
                cid === SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW ||
                SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.includes(cid)) {
              isOrganized = true;
              break;
            }
            const parentsIter = current.getParents();
            if (parentsIter.hasNext()) {
              current = parentsIter.next();
            } else {
              break;
            }
          }
        } catch (e) {
          // Folder inaccessible or not a folder, assume unorganized
        }
      }
      
      if (isOrganized) {
         console.log(`Skipping shortcut for "${sharedFile.name}" - already located in an organized system folder.`);
         // Add to log so we don't check it again? No, it's fine, we'll just check it next time, but that's fast.
         // Actually, wait, if we don't log it, we will traverse it EVERY time ingest runs!
      } else {
        try {
"""

# Find the exact insertion point
target_str = """    if (!existingTargets.has(sharedFile.id)) {
      try {"""

content = content.replace(target_str, organized_logic)

# We need to close the else block
closing_str = """        createdCount++;
      } catch (err) {
        console.error(`Failed to create shortcut for "${sharedFile.name}": ${err.message}`);
      }
    } else {"""

new_closing_str = """        createdCount++;
      } catch (err) {
        console.error(`Failed to create shortcut for "${sharedFile.name}": ${err.message}`);
      }
      }
    } else {"""

content = content.replace(closing_str, new_closing_str)

with open("src/Code_TheClerk_Drive.js", "w") as f:
    f.write(content)
