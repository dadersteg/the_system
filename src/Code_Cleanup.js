function cleanupTodayTimeboxes() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const existingEvents = calendar.getEvents(startOfDay, endOfDay);
  let deletedCount = 0;
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      e.deleteEvent();
      deletedCount++;
    }
  });
  console.log("Deleted " + deletedCount + " [TS] timeboxed events for today.");
}

function cleanupTomorrowTimeboxes() {
  const calendar = CalendarApp.getDefaultCalendar();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
  const endOfDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);
  
  const existingEvents = calendar.getEvents(startOfDay, endOfDay);
  let deletedCount = 0;
  existingEvents.forEach(e => {
    if (e.getTitle().startsWith("[TS] ")) {
      e.deleteEvent();
      deletedCount++;
    }
  });
  console.log("Deleted " + deletedCount + " [TS] timeboxed events for tomorrow.");
}
