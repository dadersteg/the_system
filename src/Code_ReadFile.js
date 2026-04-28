function readExportFile() {
  const TARGET_FOLDER_ID = "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc";
  const fileName = "System_Taxonomy_Export.md";
  try {
    const q = "name = '" + fileName + "' and '" + TARGET_FOLDER_ID + "' in parents and trashed = false";
    const existingFiles = Drive.Files.list({q: q, fields: "files(id)"}).files;
    if (existingFiles && existingFiles.length > 0) {
      const fileId = existingFiles[0].id;
      const content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
      return content;
    } else {
      return "File not found in Drive.";
    }
  } catch (e) {
    return "Error: " + e.message;
  }
}
