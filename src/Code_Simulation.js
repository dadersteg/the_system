function runTomorrowSimulation() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0); // Simulate running at noon tomorrow
    
    console.log("Simulating Hourly Review natively for Tomorrow: " + tomorrow.toString());
    runHourlyReview(tomorrow);
  } catch (e) {
    console.error("Simulation failed: " + e.message);
  }
}
