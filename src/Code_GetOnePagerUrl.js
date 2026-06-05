function getOnePagerUrl() {
  const fileId = getExecutionPlanId();
  if (fileId) {
    console.log(DriveApp.getFileById(fileId).getUrl());
  } else {
    console.log("Execution plan file not found");
  }
}
