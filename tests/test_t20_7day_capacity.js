const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code7DayReview = fs.readFileSync(path.join(__dirname, '../src/Code_7DayReview.js'), 'utf8');

const Calendar = {
  Events: {
    list: (calendarId, options) => {
      return {
        items: [
          {
            // Event on Aug 2nd at 00:30 BST = Aug 1st at 23:30 UTC
            start: { dateTime: '2026-08-01T23:30:00Z' },
            end: { dateTime: '2026-08-02T00:30:00Z' },
            transparency: 'opaque'
          }
        ]
      };
    }
  }
};

const Utilities = {
  formatDate: (date, tz, fmt) => {
    if (tz === "Europe/London" && fmt === "yyyy-MM-dd") {
      const d = new Date(date);
      // Simple mock for BST: add 1 hour
      d.setTime(d.getTime() + 60 * 60 * 1000);
      return d.toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }
};

const consoleMock = {
  log: () => {},
  warn: () => {},
  error: () => {}
};

const sandbox = {
  Calendar,
  Utilities,
  console: consoleMock
};

vm.createContext(sandbox);
vm.runInContext(code7DayReview, sandbox);

// Override Date to start on Aug 1st
const DateOriginal = Date;
sandbox.Date = class extends DateOriginal {
  constructor(...args) {
    if (args.length === 0) {
      super('2026-08-01T12:00:00Z');
    } else {
      super(...args);
    }
  }
};

const capacity = sandbox.getCalendarCapacity7Days();

if (capacity['2026-08-01'].busyHours > 0) {
    console.error("FAIL: Event logged on 2026-08-01 (UTC date), expected 2026-08-02 (Local date).");
    process.exit(1);
}

if (capacity['2026-08-02'] && capacity['2026-08-02'].busyHours === 1) {
    console.log("PASS: Event logged on correct local date.");
    process.exit(0);
} else {
    console.error("FAIL: Event not logged on 2026-08-02. capacity: ", JSON.stringify(capacity));
    process.exit(1);
}
