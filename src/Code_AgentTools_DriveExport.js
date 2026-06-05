function exportFolder(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const result = {};
  
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    let content = "UNSUPPORTED_MIME";
    
    try {
      if (mimeType === MimeType.GOOGLE_DOCS) {
        const doc = DocumentApp.openById(file.getId());
        content = doc.getBody().getText();
      } else if (mimeType === MimeType.PDF) {
        // Can't easily extract text from PDF in apps script without OCR
        content = "PDF_SKIPPED";
      } else {
        content = file.getBlob().getDataAsString();
      }
    } catch(e) {
      content = "ERROR: " + e.message;
    }
    
    result[file.getName()] = content;
  }
  
  return JSON.stringify(result);
}
