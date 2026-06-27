function runTomorrowSimulation() {
  const OriginalDate = Date;
  const tomorrow = new OriginalDate();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  
  class MockDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        super(tomorrow.getTime());
      } else {
        super(...args);
      }
    }
  }
  MockDate.now = () => tomorrow.getTime();
  
  // Override global Date
  globalThis.Date = MockDate;
  
  try {
    console.log("Simulating Hourly Review for Tomorrow: " + new Date().toString());
    runHourlyReview();
  } catch (e) {
    console.error("Simulation failed: " + e.message);
  } finally {
    // Restore global Date
    globalThis.Date = OriginalDate;
  }
}
