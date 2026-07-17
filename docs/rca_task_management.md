# Root Cause Analysis: Task Management System Bugs

**Date:** 2026-07-15
**Author:** Forensic Integrity Auditor / Teamwork Explorer
**Objective:** Detailed investigation and root cause analysis of the four critical bugs in "The System" task management framework.

---

## 1. Executive Summary & Conclusions First

Our detailed code investigation has identified the precise root causes of the four critical bugs in the Google Apps Script task management system under `src/`. No assumptions were made; all conclusions are backed by direct code citations.

### Summary of Root Causes
1. **Timeboxing failure:** Caused by a mandatory regex group `\[Q[1-4]\]` in the markdown parser that skips lines lacking Eisenhower tags, combined with a `TypeError` crash when encountering calendar events with null summaries, and incorrect timezone-shifting when converting local dates to UTC.
2. **Missing due dates on ToDO list:** Caused by a lack of handling for the `TODAY` routing target in the deadline calculation block (defaulting to `null` if no recommended deadline is provided), combined with an early return in the `SPLIT` milestone routing path that bypasses due date logic entirely.
3. **Broken PMT/Private calendar sync:** Caused by a lack of environment-aware task filtering and calendar routing during scheduling, combined with a logic error in collision detection that blindly ignores `[TS]` timebox events even when they reside on the cross-environment calendar.
4. **Milestone method completely broken:** Caused by an exact-match comparison on milestone titles that fails due to `[Milestone] ` prefixes, resulting in duplicate milestones, and a failure to update the `activeTaskId` variable for assigned tasks before moving them, causing API failures.

---

## 2. Bug 1: Timeboxing Does Not Work

### Direct Observations & Code Citation
The timeboxing sync is governed by `src/Code_Timeboxing.js`. We observed two critical code errors that prevent correct parsing and cause script crashes:

*   **Mandatory Eisenhower Tag in Regex:**
    In `src/Code_Timeboxing.js` (lines 173-174):
    ```javascript
    const regex = /- \[ \]\s*(?:\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*)?(?:(?:🐸|\\ud83d\\udc38)\s*)?(?:\[THE FROG\]\s*)?\[Q[1-4]\]\s*(.*)$/i;
    const match = cleanLine.match(regex);
    ```
    The pattern `\[Q[1-4]\]` has no trailing `?` quantifier, making it **mandatory**. If a task listed in the 1-Day Execution Plan lacks an Eisenhower tag (e.g. `[Q1]`), or uses a modified format like `[Q1/Q2]`, the regex fails to match, and the task is silently skipped.

*   **Null Pointer Exception on Event Summaries:**
    In `src/Code_Timeboxing.js` (line 286):
    ```javascript
    if (task.rawLine && task.rawLine.toLowerCase().includes(oe.summary.toLowerCase())) {
    ```
    If any overlapping calendar event `oe` fetched from the calendar does not have a summary (e.g. is an untitled event or a blocked block with hidden details), `oe.summary` is `undefined`. Calling `.toLowerCase()` directly on `oe.summary` throws a `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` and crashes the execution.

*   **Timezone-Shifted Calendar Queries:**
    In `src/Code_Timeboxing.js` (lines 258-259):
    ```javascript
    timeMin: proposedStart.toISOString(),
    timeMax: proposedEnd.toISOString(),
    ```
    `toISOString()` converts the script's local date/time into UTC. If the Apps Script runtime or the calendar is in a different timezone from Europe/London, this results in querying the calendar for the wrong hours (shifting the window), causing false-positive collisions or missing real collisions.

### Logical Verification & Recommendations
1. Make the Eisenhower tag group optional in the regex: `(?:\[Q[1-4]\]\s*)?`.
2. Add a null-check guard for `oe.summary` before calling `.toLowerCase()`.
3. Use timezone-aware formatting for ISO date strings rather than `toISOString()`.

---

## 3. Bug 2: Tasks Moved to ToDO List Without Dates

### Direct Observations & Code Citation
The due date calculation occurs in `src/Code_TaskEngine.js` (lines 899-916):

*   **Missing TODAY Due Date Assignment:**
    ```javascript
    let finalDue = originalDate;
    if (u.routingTarget === "BACKLOG") {
      finalDue = new Date("2099-12-31T00:00:00Z").toISOString();
    } else if (u.recommendedDeadline !== undefined) {
      if (u.recommendedDeadline === "None") {
        finalDue = null;
      } else if (u.recommendedDeadline === "") {
        if (originalDate) {
          finalDue = originalDate;
        }
      } else {
        try {
          finalDue = new Date(u.recommendedDeadline).toISOString();
        } catch (e) {
          console.warn(`Invalid deadline format for task ${u.taskId}: ${u.recommendedDeadline}`);
        }
      }
    }
    ```
    If `u.routingTarget === "TODAY"`, there is no custom logic to set the date. If `u.recommendedDeadline` is returned as `"None"` by the LLM, `finalDue` is set to `null`. If `u.recommendedDeadline` is undefined, `finalDue` remains `originalDate` (which is `null` for newly ingested tasks).
    This forces tasks routed to `TODAY` to have a missing due date.

*   **SPLIT Routing Bypass of Due Date Calculation:**
    In `src/Code_TaskEngine.js` (lines 689-778):
    ```javascript
    if (u.routingTarget === "SPLIT" && u.newSubTasks && u.newSubTasks.length > 0) {
       // ... SPLIT logic inserts new milestone and subtasks ...
       return; // Early return bypasses finalDue calculation
    }
    ```
    When a task is split into a milestone, the function returns early at line 777. The entire block responsible for calculating `finalDue` and updating metadata is bypassed. The milestone and its subtasks are created using `due: task.due` (lines 706 and 760), which uses the original, un-updated due date (usually `null`).

### Logical Verification & Recommendations
1. Explicitly check if `u.routingTarget === "TODAY"` and set `finalDue` to today's date in local midnight format (`yyyy-MM-ddT00:00:00.000Z`).
2. Integrate the `finalDue` resolution block *before* processing `SPLIT` routing targets so that milestones and split subtasks inherit the correct target deadline.

---

## 4. Bug 3: PMT / Private Calendar Sync is Broken

### Direct Observations & Code Citation
The system manages two environments: PMT (`ENV = WORK`) and Private (`ENV = PRIVATE`). Each runs Clasp under different accounts.

*   **Self-Collision Overrides Across Environments:**
    In `src/Code_Timeboxing.js` (lines 271-274):
    ```javascript
    for (const oe of overlappingEvents) {
       if (oe.start.date) continue; // All day event
       if (oe.summary && oe.summary.startsWith("[TS] ")) continue;
    ```
    When running collision checks, the script queries both the default calendar and the cross-environment calendar (`CROSS_ENV_ID`).
    However, the check `oe.summary.startsWith("[TS] ")` causes it to **ignore** all timeboxed events, even those on the **cross-environment calendar**.
    This means if `daniel@playmetech.net` has a PMT timebox scheduled, the Private timeboxer checks the PMT calendar, sees the `[TS] ` prefix, ignores the collision, and schedules a Personal task directly on top of it.

*   **Unsegregated Tasks Scheduled on Current Default Calendar:**
    In `src/Code_Timeboxing.js` (line 209 and line 298):
    ```javascript
    const calendar = CalendarApp.getDefaultCalendar();
    ...
    const newEvent = calendar.createEvent("[TS] " + task.title, proposedStart, proposedEnd);
    ```
    The script parses both PMT and Personal tasks from the 1-Day Execution Plan but schedules them all on `CalendarApp.getDefaultCalendar()`. It does not check which environment the task actually belongs to. Thus, tasks are scheduled on the executing account's calendar rather than their correct target calendar.

### Logical Verification & Recommendations
1. Modify `oe.summary.startsWith("[TS] ")` to only `continue` if the event is on the **primary** calendar:
   `if (oe.summary && oe.summary.startsWith("[TS] ") && calId === 'primary') continue;`
2. Parse the section headers in `parseTasksForTimeboxing` (`**🎯 PMT:**` vs `**🏠 Personal:**`) and assign a classification (e.g. `isWork`).
3. In `scheduleTasksToCalendar`, dynamically target `CalendarApp.getCalendarById(SYSTEM_CONFIG.CALENDARS.CROSS_ENV_ID)` if the task's classification does not match the executing environment.

---

## 5. Bug 4: Milestone Method is Completely Broken

### Direct Observations & Code Citation
Milestone creation and parenting occur in `src/Code_TaskEngine.js`:

*   **Duplicate Milestones due to Prefix Mismatches:**
    In `src/Code_TaskEngine.js` (lines 1058-1068):
    ```javascript
    const todoTasks = Tasks.Tasks.list(todoListId, { showCompleted: false, showHidden: false, maxResults: 100 }).items || [];
    let matchedMilestone = todoTasks.find(t => t.title === u.recommendedMilestone);
    ```
    If `u.recommendedMilestone` is `"Build Prototype"`, the search will fail to match the existing milestone title which has been created as `"[Milestone] Build Prototype"`.
    The script then inserts a new milestone task with the `[Milestone] ` prefix (line 1067). On subsequent runs, it duplicates this search failure and inserts another milestone task, causing list flooding.

*   **Invalid Parent ID for Assigned Tasks:**
    In `src/Code_TaskEngine.js` (lines 1011-1020):
    ```javascript
    const createdTask = Tasks.Tasks.insert(newTask, targetListId);
    if (!isAssignedTask) activeTaskId = createdTask.id;
    ```
    If the task is an assigned task, `activeTaskId` remains `u.taskId` (the ID of the original task in the importer list).
    Then, on line 1071, the script calls:
    ```javascript
    Tasks.Tasks.move(targetListId, activeTaskId, { parent: matchedMilestone.id });
    ```
    Because `activeTaskId` is not the ID of the task in the ToDo list, the move call fails with a Tasks API error (e.g. invalid task ID), preventing parenting.

### Logical Verification & Recommendations
1. Normalize milestone titles during lookup to strip the `[Milestone] ` prefix and spaces before comparison:
   ```javascript
   let matchedMilestone = todoTasks.find(t => {
      const cleanT = t.title.replace(/^\[Milestone\]\s*/i, "").trim().toLowerCase();
      const cleanU = u.recommendedMilestone.replace(/^\[Milestone\]\s*/i, "").trim().toLowerCase();
      return cleanT === cleanU;
   });
   ```
2. Update `activeTaskId` to `createdTask.id` regardless of whether `isAssignedTask` is true or false.
