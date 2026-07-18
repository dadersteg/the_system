const fs = require('fs');
const assert = require('assert');
const path = require('path');

// Mock environment variables and globals
global.SYSTEM_CONFIG = {
  TASKS: {
    IMPORTER_LIST_ID: 'importer_id',
    TODO_LIST_ID: 'todo_id',
    RECURRING_LIST_ID: 'recurring_id'
  },
  SECRETS: {
    GEMINI_API_KEY: 'test_key',
    GEMINI_MODEL_PRO: 'pro',
    GEMINI_MODEL_FLASH: 'flash'
  },
  DOCS: {
    TASK_MASTER_MONTHLY_PROMPT_ID: 'mock_prompt',
    TASK_MASTER_QUARTERLY_PROMPT_ID: 'mock_prompt',
    VANTAGE_LOG_ID: 'log1',
    RECENT_REFLECTIONS_ID: 'log2'
  },
  GENERATED_OUTPUTS: {}
};

global.Utilities = {
  sleep: () => {}
};

global.IS_PMT_ENV = false;
global.getSystemGoals = () => "Mock Goals";
global.parseTaskNotes = () => ({ metadata: {}, baseNotes: "mock notes" });
global.getSafeDocText = () => "Mock Text";
global.processPromptText = () => "Mock Prompt Text";
global.callGemini = () => ({ text: "Mock Review", error: null });
global.write28DayReport = () => {};
global.write84DayReport = () => {};
global.runTaskMasterEngine = () => {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => null,
    setProperty: () => {}
  })
};


// Load executeWithRetry
const codeTasksPath = path.join(__dirname, '../src/Code_Tasks.js');
const codeTasks = fs.readFileSync(codeTasksPath, 'utf8');
const executeWithRetryFn = codeTasks.match(/function executeWithRetry[\s\S]*?\n\}/)[0];
eval(executeWithRetryFn);
global.executeWithRetry = executeWithRetry;

function testApiErrorPropagation() {
  console.log("Running testApiErrorPropagation...");
  
  // Load target files
  const filesToTest = [
    '../src/Code_Timeboxing.js',
    '../src/Code_28DayReview.js',
    '../src/Code_84DayReview.js'
  ];
  
  filesToTest.forEach(relPath => {
    const fullPath = path.join(__dirname, relPath);
    let code = fs.readFileSync(fullPath, 'utf8');
    
    // We only need verifyTasksAreStillActive from timeboxing
    if (relPath.includes('Code_Timeboxing')) {
       global.eval(code); // defines verifyTasksAreStillActive
    } else if (relPath.includes('Code_28DayReview')) {
       global.eval(code); // defines runMonthlyReview
    } else if (relPath.includes('Code_84DayReview')) {
       global.eval(code); // defines runQuarterlyReview
    }
  });

  // Mock Tasks API to throw an error
  let apiCalledCount = 0;
  global.Tasks = {
    Tasks: {
      list: () => {
        apiCalledCount++;
        throw new Error("Simulated API Error 500");
      }
    }
  };

  // 1. Test verifyTasksAreStillActive (Timeboxing)
  let timeboxingThrew = false;
  try {
    verifyTasksAreStillActive([{ id: '1', title: 'test' }], new Date());
  } catch (e) {
    console.log("timeboxing error: " + e.message); if (e.message.includes("Simulated API Error")) timeboxingThrew = true;
  }
  
  // 2. Test runMonthlyReview
  let monthlyThrew = false;
  try {
    runMonthlyReview();
  } catch (e) {
    if (e.message.includes("Simulated API Error")) monthlyThrew = true;
  }

  // 3. Test runQuarterlyReview
  let quarterlyThrew = false;
  try {
    runQuarterlyReview();
  } catch (e) {
    if (e.message.includes("Simulated API Error")) quarterlyThrew = true;
  }

  const passed = timeboxingThrew && monthlyThrew && quarterlyThrew;
  
  if (!passed) {
    const msg = `FAIL: API Errors were swallowed.\nTimeboxing threw: ${timeboxingThrew}\nMonthly threw: ${monthlyThrew}\nQuarterly threw: ${quarterlyThrew}`;
    console.error(msg);
    throw new Error(msg);
  }
  
  console.log("PASS: API Errors correctly propagated.");
}

try {
  testApiErrorPropagation();
} catch (e) {
  console.error(e); process.exit(1);
}
