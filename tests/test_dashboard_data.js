const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock Apps Script Globals
const SYSTEM_CONFIG = {
  ROOTS: {
    MASTER_SHEET_ID: 'master-sheet-id-123',
    WORKSPACE_FOLDER_ID: 'workspace-folder-id-123',
    HABITS_SHEET_ID: 'habits-sheet-id-123'
  },
  DOCS: {
    VANTAGE_LOG_ID: 'vantage-log-id-123',
    RECENT_REFLECTIONS_ID: 'reflections-id-123'
  },
  SHEETS: {
    NOTES_LOG: '967747913',
    EMAIL_LOG: '2131515996',
    TASK_REVIEW: '1580572397',
    HABITS_LOG: '489641630'
  },
  TASKS: {
    TODO_LIST_ID: 'todo-list-id-123'
  }
};

const PropertiesService = {
  getUserProperties: () => ({
    getProperties: () => ({})
  }),
  getScriptProperties: () => ({
    getProperties: () => ({})
  })
};

const mockSheet = (id, name) => ({
  getSheetId: () => id,
  getName: () => name,
  getLastRow: () => 2,
  getRange: (startRow, col, numRows, numCols) => ({
    getValues: () => {
      // Mock data representing a typical log sheet
      const data = [
        ["URL", "Original Name", "Category", "Task Title", "Notes", "Status", "Due Date", "Timestamp"],
        ["http://url1", "Doc1", "Cat1", "CleanedTask1", "TaskNotes1", "needsAction", "2026-06-10", "2026-06-10T12:00:00Z"]
      ];
      // Slice only the requested row index (startRow is 1-based)
      return data.slice(startRow - 1, startRow - 1 + numRows);
    }
  })
});

const mockSpreadsheet = {
  getSheets: () => [
    mockSheet(SYSTEM_CONFIG.SHEETS.NOTES_LOG, 'Notes 05 Log'),
    mockSheet(SYSTEM_CONFIG.SHEETS.EMAIL_LOG, 'Gmail 05 Log'),
    mockSheet(SYSTEM_CONFIG.SHEETS.TASK_REVIEW, 'Google Tasks Log')
  ],
  getUrl: () => 'https://docs.google.com/spreadsheets/d/mock-ss-url'
};

const SpreadsheetApp = {
  getActiveSpreadsheet: () => mockSpreadsheet,
  openById: () => mockSpreadsheet
};

// GmailApp Mocks
const mockGmailMessage = {
  getFrom: () => 'sender@test.com'
};

const mockGmailThread = {
  getFirstMessageSubject: () => 'Test Subject',
  getMessages: () => [mockGmailMessage],
  getLastMessageDate: () => new Date(),
  getId: () => 'thread-123'
};

const GmailApp = {
  search: () => [mockGmailThread]
};

// CalendarApp Mocks
const mockCalendarEvent = {
  getTitle: () => 'Workout at gym',
  getStartTime: () => new Date(),
  getEndTime: () => new Date(),
  isAllDayEvent: () => false,
  getLocation: () => 'Local Gym'
};

const mockCalendar = {
  getEvents: () => [mockCalendarEvent],
  getName: () => 'Default Calendar',
  getId: () => 'cal-123'
};

const CalendarApp = {
  getDefaultCalendar: () => mockCalendar
};

// Tasks Service Mocks
const Tasks = {
  Tasks: {
    list: (listId, options) => {
      return {
        items: [
          {
            id: 'task-1',
            title: 'Mock Task 1',
            due: '2026-06-10T23:59:59Z',
            updated: '2026-06-10T12:00:00Z',
            status: 'needsAction',
            notes: 'Notes for mock task 1'
          }
        ]
      };
    }
  }
};

// Drive Advanced Service Mocks
const Drive = {
  Files: {
    list: () => ({
      files: [
        {
          id: 'file-123',
          name: 'Test File.pdf',
          webViewLink: 'http://webview/file-123',
          modifiedByMeTime: '2026-06-10T12:00:00Z',
          mimeType: 'application/pdf'
        }
      ]
    })
  }
};

// DriveApp Mocks
const mockBlob = {
  getDataAsString: () => 'Mocked markdown or log content'
};

const mockFile = {
  getBlob: () => mockBlob,
  getName: () => 'Test File'
};

const mockIterator = {
  hasNext: () => true,
  next: () => mockFile
};

const mockFolder = {
  getFilesByName: () => mockIterator,
  searchFiles: () => mockIterator
};

const DriveApp = {
  getFolderById: () => mockFolder,
  getFileById: () => mockFile
};

// Utilities Mocks
const Utilities = {
  formatDate: (date, tz, fmt) => '2026-06-10',
  sleep: () => {}
};

// ScriptApp Mocks
const ScriptApp = {
  getProjectTriggers: () => [],
  deleteTrigger: () => {},
  newTrigger: () => ({
    timeBased: () => ({
      everyMinutes: () => ({ create: () => {} }),
      everyHours: () => ({ create: () => {} }),
      everyDays: () => ({ atHour: () => ({ create: () => {} }) })
    })
  })
};

// Create the context
const sandbox = {
  SYSTEM_CONFIG,
  PropertiesService,
  SpreadsheetApp,
  GmailApp,
  CalendarApp,
  Tasks,
  Drive,
  DriveApp,
  Utilities,
  ScriptApp,
  console: {
    log: (...args) => console.log('SandboxLog:', ...args),
    warn: (...args) => console.warn('SandboxWarn:', ...args),
    error: (...args) => console.error('SandboxError:', ...args)
  },
  IS_WORK_ENV: true
};

vm.createContext(sandbox);

// Helper function to load code from src
function loadSourceFile(filename) {
  const filePath = path.join(__dirname, '../src', filename);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
}

// Load files in dependency order
loadSourceFile('Code_Config.js');
loadSourceFile('Code_SystemCore.js');
loadSourceFile('Code_Dashboard.js');

// Run test
try {
  console.log("Running getDashboardData()...");
  const result = sandbox.getDashboardData();
  
  // Assertions
  const expectedKeys = ['emails', 'tasks', 'recentTasks', 'files', 'notes', 'links', 'calendar', 'clerkEmails', 'clerkTasks', 'workouts'];
  for (const key of expectedKeys) {
    if (!result[key] || !Array.isArray(result[key])) {
      throw new Error(`Assertion failed: result.${key} is not an array`);
    }
  }
  
  console.log("SUCCESS: getDashboardData() executed successfully with all expected arrays populated.");
  console.log("Sample outputs:");
  console.log("- Emails:", result.emails.length);
  console.log("- Tasks:", result.tasks.length);
  console.log("- Recent Tasks:", result.recentTasks.length);
  console.log("- Workouts:", result.workouts.length);
  console.log("- Files:", result.files.length);
  
  process.exit(0);
} catch (e) {
  console.error("Test FAILED:", e);
  process.exit(1);
}
