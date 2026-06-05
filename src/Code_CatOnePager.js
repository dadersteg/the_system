function catOnePager() {
  const fileId = getExecutionPlanId();
  if (fileId) {
    console.log(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  } else {
    console.log("Execution plan file not found");
  }
}
