function fetchDocToMarkdown() {
  const docId = '1OcpxtrbmzCIP5Rg9Rv200R_LvmM3C24osuvmu6BQJO0';
  const targetFolderId = '13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc'; // The export folder
  
  try {
    const content = DocumentApp.openById(docId).getBody().getText();
    const fileName = 'Email_Clerk_Prompt.md';
    
    // Trash old ones
    const q = "name = '" + fileName + "' and '" + targetFolderId + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
    if (existingFiles && existingFiles.length > 0) {
      existingFiles.forEach(f => DriveApp.getFileById(f.id).setTrashed(true));
    }
    
    // Create new
    const blob = Utilities.newBlob(content, 'text/plain', fileName);
    DriveApp.getFolderById(targetFolderId).createFile(blob);
    console.log("Success fetching doc");
  } catch (e) {
    console.error("Error: " + e.message);
  }
}
