const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 1. Centralized mocks and sandbox setup
const SYSTEM_CONFIG = {
  TASKS: {
    IMPORTER_LIST_ID: 'importer-list',
    TODO_LIST_ID: 'todo-list',
    RECURRING_LIST_ID: 'recurring-list',
    TO_BE_DELETED_LIST_ID: 'delete-list',
    AI_REVIEW_LIST_ID: 'review-list'
  },
  CALENDARS: {
    CROSS_ENV_ID: 'cross-env-cal-id'
  }
};

let tasksDb = {
  'importer-list': [],
  'todo-list': [],
  'delete-list': [],
  'review-list': []
};

let apiCalls = [];
let calendarEvents = {
  'primary': [],
  'cross-env-cal-id': []
};

// Helper mock classes to represent Calendar and Event objects
class MockEvent {
  constructor(title, start, end, calId) {
    this.title = title;
    this.start = start;
    this.end = end;
    this.calId = calId;
    this.deleted = false;
    this.visibility = null;
    this.color = null;
  }
  getTitle() { return this.title; }
  getStartTime() { return this.start; }
  getEndTime() { return this.end; }
  deleteEvent() {
    apiCalls.push({ action: 'deleteEvent', title: this.title, calId: this.calId });
  }
  setVisibility(v) { this.visibility = v; }
  setColor(c) { this.color = c; }
}

class MockCalendar {
  constructor(id) {
    this.id = id;
  }
  getEvents(start, end) {
    apiCalls.push({ action: 'getEvents', calId: this.id, start, end });
    return (calendarEvents[this.id] || []).filter(e => !e.deleted && e.start >= start && e.end <= end);
  }
  createEvent(title, start, end) {
    apiCalls.push({ action: 'createEvent', calId: this.id, title, start, end });
    const ev = new MockEvent(title, start, end, this.id);
    if (!calendarEvents[this.id]) calendarEvents[this.id] = [];
    calendarEvents[this.id].push(ev);
    return ev;
  }
}

const CalendarApp = {
  getDefaultCalendar: () => new MockCalendar('primary'),
  getCalendarById: (id) => new MockCalendar(id),
  Visibility: { PRIVATE: 'private' },
  EventColor: { ORANGE: 'orange' }
};

const Calendar = {
  Events: {
    list: (calId, options) => {
      apiCalls.push({ action: 'Calendar.Events.list', calId, options });
      const events = calendarEvents[calId] || [];
      const filtered = events.filter(e => {
        if (e.deleted) return false;
        const eStart = e.start.toISOString();
        const eEnd = e.end.toISOString();
        return eEnd > options.timeMin && eStart < options.timeMax;
      });
      return {
        items: filtered.map(e => ({
          summary: e.title,
          start: { dateTime: e.start.toISOString() },
          end: { dateTime: e.end.toISOString() },
          transparency: 'opaque'
        }))
      };
    }
  }
};

const Tasks = {
  Tasks: {
    list: (listId, options) => {
      apiCalls.push({ action: 'list', listId });
      return { items: (tasksDb[listId] || []).map(t => JSON.parse(JSON.stringify(t))) };
    },
    get: (listId, taskId) => {
      apiCalls.push({ action: 'get', listId, taskId });
      const found = (tasksDb[listId] || []).find(t => String(t.id) === String(taskId));
      return found ? JSON.parse(JSON.stringify(found)) : undefined;
    },
    patch: (patchObj, listId, taskId) => {
      apiCalls.push({ action: 'patch', listId, taskId, patchObj });
      const list = tasksDb[listId];
      if (list) {
        const idx = list.findIndex(t => String(t.id) === String(taskId));
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...patchObj };
        }
      }
    },
    insert: (taskObj, listId, options) => {
      apiCalls.push({ action: 'insert', listId, taskObj, options });
      if (!tasksDb[listId]) tasksDb[listId] = [];
      const newTask = JSON.parse(JSON.stringify(taskObj));
      if (!newTask.id) newTask.id = Math.random().toString();
      if (options && options.parent) {
        newTask.parent = options.parent;
      }
      tasksDb[listId].push(newTask);
      return newTask;
    },
    remove: (listId, taskId) => {
      apiCalls.push({ action: 'remove', listId, taskId });
      if (tasksDb[listId]) {
        tasksDb[listId] = tasksDb[listId].filter(t => String(t.id) !== String(taskId));
      }
    },
    move: (listId, taskId, options) => {
      apiCalls.push({ action: 'move', listId, taskId, options });
      const found = (tasksDb[listId] || []).find(t => String(t.id) === String(taskId));
      if (found) {
        found.parent = options.parent;
      }
    }
  },
  Tasklists: {
    list: (options) => {
      apiCalls.push({ action: 'list_tasklists', options });
      return {
        items: Object.keys(tasksDb).map(name => ({
          id: name,
          title: name === 'delete-list' ? 'To Be Deleted' : (name === 'quarantine-list' ? 'Triage Quarantine' : name)
        }))
      };
    },
    insert: (resource) => {
      apiCalls.push({ action: 'insert_tasklist', resource });
      const newId = resource.title.toLowerCase().replace(/\s+/g, '-') + '-list';
      tasksDb[newId] = [];
      return { id: newId, title: resource.title };
    }
  }
};

const Utilities = {
  sleep: () => {},
  formatDate: (date, tz, fmt) => {
    // Simple mock implementation of Europe/London formatting
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    if (fmt.includes("yyyy-MM-dd'T'HH:mm:ssXXX")) {
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d}T${hh}:${mm}:${ss}+01:00`;
    }
    return `${y}-${m}-${d}`;
  },
  computeDigest: () => [1,2,3],
  DigestAlgorithm: { MD5: 'MD5' },
  base64Encode: () => 'hash123'
};

const PropertiesService = {
  getUserProperties: () => ({
    getProperty: () => null
  }),
  getScriptProperties: () => ({
    getProperty: () => null,
    setProperty: () => {},
    deleteProperty: () => {}
  })
};

const sandbox = {
  SYSTEM_CONFIG,
  Tasks,
  Utilities,
  CalendarApp,
  Calendar,
  PropertiesService,
  executeWithRetry: (fn) => fn(),
  IS_PMT_ENV: false,
  console: {
    log: (...args) => console.log('  [VM Log]', ...args),
    warn: (...args) => console.warn('  [VM Warn]', ...args),
    error: (...args) => console.error('  [VM Error]', ...args)
  }
};

vm.createContext(sandbox);

// Read files into VM context
const codeSystemCore = fs.readFileSync(path.join(__dirname, '../src/Code_SystemCore.js'), 'utf8');
vm.runInContext(codeSystemCore, sandbox);

const codeTaskEngine = fs.readFileSync(path.join(__dirname, '../src/Code_TaskEngine.js'), 'utf8');
vm.runInContext(codeTaskEngine, sandbox);

const codeTimeboxing = fs.readFileSync(path.join(__dirname, '../src/Code_Timeboxing.js'), 'utf8');
vm.runInContext(codeTimeboxing, sandbox);

function resetState() {
  tasksDb = {
    'importer-list': [],
    'todo-list': [],
    'delete-list': [],
    'review-list': []
  };
  apiCalls = [];
  calendarEvents = {
    'primary': [],
    'cross-env-cal-id': []
  };
}

// 2. Run test suites
console.log("Starting Timeboxing & Routing custom test suite...");
let failed = false;

function test(name, fn) {
  resetState();
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}`);
    console.error(e);
    failed = true;
  }
}

// Bug Fix 1 & 3: Timeboxing parsing (Optional [Q[1-4]], Section types parsing)
test("Timeboxing: Correct parsing of task sections (Personal vs PMT) & optional Q-bracket", () => {
  const markdown = `
## TODAY'S TOP 3
**🏠 Personal:**
- [ ] [09:00-09:30] Task Personal A {ID: 101}
- [ ] [10:00-10:30] [Q1] Task Personal B {ID: 102} (Some notes)
**🎯 PMT:**
- [ ] [11:00-11:30] Task PMT C {ID: 103}
- [ ] Task PMT No Timebox D {ID: 104}
`;
  
  const parsed = sandbox.parseTasksForTimeboxing(markdown);
  
  assert.strictEqual(parsed.length, 4, "Should parse 4 tasks with timeboxes");
  assert.strictEqual(parsed[0].title, "Task Personal A", "Task 1 title match");
  assert.strictEqual(parsed[0].sectionType, "Personal", "Task 1 section match");
  assert.strictEqual(parsed[1].title, "Task Personal B", "Task 2 title match");
  assert.strictEqual(parsed[1].sectionType, "Personal", "Task 2 section match");
  assert.strictEqual(parsed[2].title, "Task PMT C", "Task 3 title match");
  assert.strictEqual(parsed[2].sectionType, "PMT", "Task 3 section match");
  assert.strictEqual(parsed[3].title, "Task PMT No Timebox D", "Task 4 title match");
  assert.strictEqual(parsed[3].startTime, undefined, "Task 4 has no start time");
});

// Bug Fix 3: Calendar selection logic when scheduling
test("Timeboxing: Correct calendar selection based on IS_PMT_ENV and sectionType", () => {
  const tasks = [
    { id: "1", title: "Task Personal", startTime: "09:00", endTime: "09:30", sectionType: "Personal", rawLine: "- [ ] [09:00-09:30] Task Personal" },
    { id: "2", title: "Task PMT", startTime: "10:00", endTime: "10:30", sectionType: "PMT", rawLine: "- [ ] [10:00-10:30] Task PMT" }
  ];

  // Mock task list responses for verifyTasksAreStillActive
  tasksDb['todo-list'] = [
    { id: "1", title: "Task Personal", status: "needsAction" },
    { id: "2", title: "Task PMT", status: "needsAction" }
  ];

  // Case A: IS_PMT_ENV is false (Private environment)
  // Personal -> Primary Calendar, PMT -> Cross-Environment Calendar
  sandbox.IS_PMT_ENV = false;
  sandbox.scheduleTasksToCalendar(tasks, new Date("2026-07-15T08:00:00Z"));

  let createCalls = apiCalls.filter(c => c.action === 'createEvent');
  assert.strictEqual(createCalls.length, 2, "Should create 2 events");
  
  const personalCall = createCalls.find(c => c.title === "[TS] Task Personal");
  const pmtCall = createCalls.find(c => c.title === "[TS] Task PMT");
  
  assert.strictEqual(personalCall.calId, "primary", "Personal task scheduled on primary calendar");
  assert.strictEqual(pmtCall.calId, "cross-env-cal-id", "PMT task scheduled on cross calendar");

  // Case B: IS_PMT_ENV is true (Work environment)
  // Personal -> Cross-Environment Calendar, PMT -> Primary Calendar
  resetState();
  tasksDb['todo-list'] = [
    { id: "1", title: "Task Personal", status: "needsAction" },
    { id: "2", title: "Task PMT", status: "needsAction" }
  ];
  sandbox.IS_PMT_ENV = true;
  sandbox.scheduleTasksToCalendar(tasks, new Date("2026-07-15T08:00:00Z"));

  createCalls = apiCalls.filter(c => c.action === 'createEvent');
  assert.strictEqual(createCalls.length, 2, "Should create 2 events");

  const personalCallWork = createCalls.find(c => c.title === "[TS] Task Personal");
  const pmtCallWork = createCalls.find(c => c.title === "[TS] Task PMT");

  assert.strictEqual(personalCallWork.calId, "cross-env-cal-id", "Personal task scheduled on cross calendar");
  assert.strictEqual(pmtCallWork.calId, "primary", "PMT task scheduled on primary calendar");
});

// Bug Fix 3: Collision checking on cross-env vs primary [TS] events
test("Timeboxing: Collision checks ignore [TS] only on primary and treat cross-environment [TS] as real collisions", () => {
  sandbox.IS_PMT_ENV = false;
  
  const now = new Date("2026-07-15T10:00:00");
  const startHour = 11;
  const endHour = 12;
  const startStr = "11:00";
  const endStr = "12:00";

  const tasks = [
    { id: "1", title: "Personal Task", startTime: startStr, endTime: endStr, sectionType: "Personal", rawLine: `- [ ] [${startStr}-${endStr}] Personal Task` }
  ];

  // Set up existing events for collision:
  // Event 1: [TS] on primary calendar. Should be ignored as collision, event is created.
  calendarEvents['primary'] = [
    new MockEvent("[TS] Some Primary Timebox", new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0), new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0, 0), "primary")
  ];
  
  sandbox.scheduleTasksToCalendar(tasks, now);
  let createCalls = apiCalls.filter(c => c.action === 'createEvent');
  assert.strictEqual(createCalls.length, 1, "Should schedule task because primary [TS] collision is ignored");

  // Event 2: [TS] on cross-environment calendar. Should block scheduling.
  resetState();
  calendarEvents['cross-env-cal-id'] = [
    new MockEvent("[TS] Work Timebox", new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0), new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0, 0), "cross-env-cal-id")
  ];

  sandbox.scheduleTasksToCalendar(tasks, now);
  createCalls = apiCalls.filter(c => c.action === 'createEvent');
  assert.strictEqual(createCalls.length, 0, "Should skip scheduling due to collision with cross-env [TS] event");
});

// Bug Fix 2: Due dates on ToDO list (TODAY/BACKLOG/SPLIT)
test("TaskEngine: Tasks moved to ToDO (TODAY/BACKLOG/SPLIT) correctly receive and retain dates", () => {
  const taskIdMap = { "task-1": "importer-list", "task-2": "importer-list", "task-3": "importer-list" };
  
  tasksDb["importer-list"] = [
    { id: "task-1", title: "Task Today", notes: "", due: null, status: "needsAction" },
    { id: "task-2", title: "Task Backlog", notes: "", due: null, status: "needsAction" },
    { id: "task-3", title: "Task Split", notes: "", due: "2026-07-20T00:00:00Z", status: "needsAction" }
  ];

  const updates = [
    { taskId: "task-2", routingTarget: "BACKLOG", recommendedTitle: "Task Backlog" },
    {
      taskId: "task-3",
      routingTarget: "SPLIT",
      recommendedTitle: "Parent Split Milestone",
      newSubTasks: [
        { title: "Subtask 1", estimatedDuration: "30m" },
        { title: "Subtask 2", estimatedDuration: "45m" }
      ]
    }
  ];

  sandbox.processTaskUpdates(updates, taskIdMap, "importer-list", "todo-list");
  console.log("DEBUG tasksDb[todo-list]:", JSON.stringify(tasksDb["todo-list"], null, 2));



  // Verify BACKLOG target receives 2099-12-31
  const movedBacklog = tasksDb["todo-list"].find(t => t.title === "Task Backlog");
  assert.ok(movedBacklog, "Task Backlog should be moved to todo-list");
  assert.strictEqual(movedBacklog.due, "2099-12-31T00:00:00.000Z", "BACKLOG target should have 2099-12-31T00:00:00.000Z");

  // Verify SPLIT target: parent and subtasks inherit resolved due date
  const parentMilestone = tasksDb["todo-list"].find(t => t.title === "[Milestone] Parent Split Milestone");
  assert.ok(parentMilestone, "Parent milestone should be created");
  assert.strictEqual(parentMilestone.due, "2026-07-20T00:00:00Z", "Parent milestone inherits resolved deadline");

  const subtasks = tasksDb["todo-list"].filter(t => t.parent === parentMilestone.id);
  assert.strictEqual(subtasks.length, 2, "Two subtasks should be parented");
  subtasks.forEach(sub => {
    assert.strictEqual(sub.due, "2026-07-20T00:00:00Z", "Subtask inherits resolved deadline");
  });
});

// Bug Fix 4: Milestone comparisons prefix normalization
test("TaskEngine: Milestone lookups correctly find existing milestones regardless of prefixes", () => {
  const taskIdMap = { "task-1": "importer-list", "task-2": "importer-list" };
  
  // Existing milestones in ToDo list
  tasksDb["todo-list"] = [
    { id: "milestone-alpha", title: "[Milestone] Project Alpha", status: "needsAction" }
  ];

  tasksDb["importer-list"] = [
    { id: "task-1", title: "Task 1", notes: "", due: null, status: "needsAction" },
    { id: "task-2", title: "Task 2", notes: "", due: null, status: "needsAction" }
  ];

  const updates = [
    { taskId: "task-1", routingTarget: "SCHEDULE", recommendedTitle: "Task 1", recommendedMilestone: "Project Alpha" },
    { taskId: "task-2", routingTarget: "SCHEDULE", recommendedTitle: "Task 2", recommendedMilestone: "[Milestone] Project Alpha" }
  ];

  sandbox.processTaskUpdates(updates, taskIdMap, "importer-list", "todo-list");

  // Verify that no new milestone was created, and both tasks are parented to milestone-alpha
  const milestones = tasksDb["todo-list"].filter(t => t.title.includes("Project Alpha"));
  assert.strictEqual(milestones.length, 1, "Only one Project Alpha milestone should exist");

  const parented1 = tasksDb["todo-list"].find(t => t.title === "Task 1");
  const parented2 = tasksDb["todo-list"].find(t => t.title === "Task 2");
  
  assert.ok(parented1, "Task 1 should be moved");
  assert.ok(parented2, "Task 2 should be moved");
  assert.strictEqual(parented1.parent, "milestone-alpha", "Task 1 parented to milestone-alpha");
  assert.strictEqual(parented2.parent, "milestone-alpha", "Task 2 parented to milestone-alpha");
});

// Bug Fix 4: Assigned tasks activeTaskId update
test("TaskEngine: Assigned tasks correctly update activeTaskId and get parented", () => {
  const taskIdMap = { "assigned-task-1": "importer-list" };
  
  // An assigned task (has webViewLink)
  tasksDb["importer-list"] = [
    { 
      id: "assigned-task-1", 
      title: "Assigned Task", 
      notes: "", 
      due: null, 
      status: "needsAction",
      webViewLink: "https://docs.google.com/document/d/12345/edit"
    }
  ];

  tasksDb["todo-list"] = [
    { id: "milestone-beta", title: "[Milestone] Project Beta", status: "needsAction" }
  ];

  const updates = [
    { 
      taskId: "assigned-task-1", 
      routingTarget: "SCHEDULE", 
      recommendedTitle: "Assigned Task Polished", 
      recommendedMilestone: "Project Beta" 
    }
  ];

  sandbox.processTaskUpdates(updates, taskIdMap, "importer-list", "todo-list");

  // For assigned tasks, the original task is marked complete in importer list, and a new one is created in ToDo list
  const original = tasksDb["importer-list"].find(t => t.id === "assigned-task-1");
  assert.strictEqual(original.status, "completed", "Original assigned task marked complete");

  const created = tasksDb["todo-list"].find(t => t.title === "Assigned Task Polished");
  assert.ok(created, "New task should be created in todo-list");
  assert.strictEqual(created.parent, "milestone-beta", "Newly created task parented to milestone-beta");
});

// Test for Triage Quarantine list relocation on DELETE target
test("TaskEngine: DELETE routing target relocates the task to Triage Quarantine list", () => {
  const taskIdMap = { "task-delete-1": "importer-list" };
  
  tasksDb["importer-list"] = [
    { id: "task-delete-1", title: "Task to Delete", notes: "", due: null, status: "needsAction" }
  ];
  tasksDb["triage-quarantine-list"] = [];

  const updates = [
    { taskId: "task-delete-1", routingTarget: "DELETE", recommendedTitle: "Task to Delete", alignedGoal: "TBD", category_path: "01 Private", estimatedDuration: "15m" }
  ];

  sandbox.processTaskUpdates(updates, taskIdMap, "importer-list", "todo-list");

  // Verify task was removed from importer-list
  const original = tasksDb["importer-list"].find(t => t.id === "task-delete-1");
  assert.strictEqual(original, undefined, "Original task should be removed from importer-list");

  // Verify task is now in triage-quarantine-list
  const quarantined = tasksDb["triage-quarantine-list"].find(t => t.title.includes("Task to Delete"));
  assert.ok(quarantined, "Task should be in Triage Quarantine list");
  assert.strictEqual(quarantined.status, "needsAction", "Quarantined task status should be active (needsAction)");
  assert.ok(quarantined.title.startsWith("99 To be deleted "), "Quarantined task title should have delete prefix");
});

console.log("\nTimeboxing & Routing custom test suite complete.");
if (failed) {
  console.error("Some custom tests failed.");
  process.exit(1);
} else {
  console.log("All custom tests passed.");
}
