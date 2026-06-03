function dumpHabitsLog() {
  try {
    const ssId = SYSTEM_CONFIG.ROOTS.HABITS_SHEET_ID;
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === SYSTEM_CONFIG.SHEET_GIDS.HABITS_LOG) || ss.getSheets()[0];
    if (!sheet) return "No sheet found";
    const data = sheet.getDataRange().getValues();
    return JSON.stringify(data.slice(Math.max(0, data.length - 10)));
  } catch(e) { return e.toString(); }
}
function doGet(e) {
  if (e && e.parameter && e.parameter.dumpHabits === "true") {
    return ContentService.createTextOutput(dumpHabitsLog());
  }
  // fallback to original
  return processHealthRequest(e) || (e.parameter.vantage ? ContentService.createTextOutput("x") : ContentService.createTextOutput("x"));
}
