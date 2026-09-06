function testCals() {
  const c1 = CalendarApp.getCalendarById("adersteg.daniel@gmail.com");
  const c2 = CalendarApp.getCalendarById("daniel@playmetech.net");
  console.log("C1:", c1 ? c1.getName() : "null");
  console.log("C2:", c2 ? c2.getName() : "null");
}
