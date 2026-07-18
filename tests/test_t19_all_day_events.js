const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 1. Mock Utilities
const Utilities = {
  formatString: function(format, ...args) {
    if (format === "%02d:%02d") {
      const h = args[0].toString().padStart(2, '0');
      const m = args[1].toString().padStart(2, '0');
      return `${h}:${m}`;
    }
    return "";
  }
};

const sandbox = {
  Utilities: Utilities,
  console: console
};

const context = vm.createContext(sandbox);

// 2. Load the file
const codeTasksPath = path.join(__dirname, '../src/Code_TaskEngine.js');
const codeTasksContent = fs.readFileSync(codeTasksPath, 'utf8');

// We just want to extract calculateAvailableTimeSlots
vm.runInContext(codeTasksContent, context);

function testAllDayEvents() {
  console.log("Testing calculateAvailableTimeSlots with all-day events...");
  
  const todayEvents = [
    { title: "Birthday", start: "00:00", end: "00:00", isAllDay: true }
  ];
  
  // Calculate slots for a generic weekday, which usually has slots
  const slots = context.calculateAvailableTimeSlots("Monday", false, todayEvents);
  
  if (slots.length === 0) {
    throw new Error("FAILED: All-day event incorrectly zeroed out the entire day's slots.");
  } else {
    console.log(`PASSED: All-day event did not block the day. Found ${slots.length} slots.`);
  }
}

try {
  testAllDayEvents();
  console.log("All tests passed.");
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
