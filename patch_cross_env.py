import re

with open("src/Code_TheClerk_Drive.js", "r") as f:
    content = f.read()

cross_env_array = """const crossEnvOrganizedFolders = [
              "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx", // PMT Workspace
              "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc", // Private Workspace
              "1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR", // PMT STND_DEST
              "1lQlTLOL3e-FTIDZ8hOXP6oi3aTMG6Ezb", // Private STND_DEST
              "1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H", // PMT REVIEW
              "1FBBm4sFSFKf53T3n9sqoKhm1R8d6EDoY"  // Private REVIEW
            ];"""

old_logic = """            const cid = current.getId();
            if (cid === SYSTEM_CONFIG.ROOTS.WORKSPACE_FOLDER_ID || 
                cid === SYSTEM_CONFIG.DRIVE_FOLDERS.STND_DEST || 
                cid === SYSTEM_CONFIG.DRIVE_FOLDERS.REVIEW ||
                SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.includes(cid)) {
              isOrganized = true;
              break;
            }"""

new_logic = f"""            const cid = current.getId();
            {cross_env_array}
            if (crossEnvOrganizedFolders.includes(cid) || 
                SYSTEM_CONFIG.DRIVE_FOLDERS.STND_SOURCES.includes(cid)) {{
              isOrganized = true;
              break;
            }}"""

content = content.replace(old_logic, new_logic)

with open("src/Code_TheClerk_Drive.js", "w") as f:
    f.write(content)
