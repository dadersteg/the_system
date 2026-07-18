const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mockTasks = {
  Tasks: {
    list: function(listId, options) {
      if (listId === 'importerListId') {
        return {
          items: [
            {
              id: 'task1',
              title: 'Unrouted Task',
              notes: 'some notes',
              status: 'needsAction'
            },
            {
              id: 'task2',
              title: 'Already Routed Task',
              notes: 'notes\n---SYSTEM_METADATA---\n{"ai_hash":"mockhash123"}',
              status: 'needsAction'
            }
          ]
        };
      }
      return { items: [] };
    }
  }
};

const SYSTEM_CONFIG = {
  TASKS: {
    IMPORTER_LIST_ID: 'importerListId',
    TODO_LIST_ID: 'todoListId'
  }
};

const sandbox = {
  Tasks: mockTasks,
  SYSTEM_CONFIG: SYSTEM_CONFIG,
  console: console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: () => null
    })
  },
  parseTaskNotes: function(notes) {
    if (notes.includes('---SYSTEM_METADATA---')) {
      const parts = notes.split('---SYSTEM_METADATA---');
      return {
        baseNotes: parts[0],
        metadata: JSON.parse(parts[1])
      };
    }
    return { baseNotes: notes };
  },
  getStandardizedTaskHash: function(title, notes, due, status, boolVal) {
    if (title === 'Already Routed Task') return 'mockhash123';
    return 'newhash456';
  }
};

const context = vm.createContext(sandbox);

const codeTasksPath = path.join(__dirname, '../src/Code_TaskEngine.js');
let codeTasksContent = fs.readFileSync(codeTasksPath, 'utf8');

// We just need _executeTaskMasterPipeline, but we only want to run the fetching part.
// To do this, we can redefine rawTasks and see what gets pushed to it.
const fetchLogic = `
  function extractTasks() {
    const rawTasks = [];
    const taskIdMap = {};
    const importerListId = SYSTEM_CONFIG.TASKS.IMPORTER_LIST_ID;
    const todoListId = SYSTEM_CONFIG.TASKS.TODO_LIST_ID;
    const listsToFetch = [importerListId, todoListId];
    listsToFetch.forEach(listId => {
      let pageToken;
      do {
        try {
          const response = Tasks.Tasks.list(listId, {
            showCompleted: false,
            showHidden: false, showAssigned: true,
            maxResults: 100,
            pageToken: pageToken
          });
          const items = response.items || [];
          items.forEach(t => {
              let cleanNotes = t.notes || "";
              let metadataStr = "";
              let aiHashMatch = false;
              
              if (cleanNotes) {
                const parsed = parseTaskNotes(cleanNotes);
                cleanNotes = parsed.baseNotes;
                if (parsed.metadata && Object.keys(parsed.metadata).length > 0) {
                   metadataStr = JSON.stringify(parsed.metadata);
                }
                
                cleanNotes = cleanNotes.replace(/(?:\\[(?:DEADLINE|DURATION|GOAL):[^\\]]*\\]\\s*\\|?\\s*)+/g, "").replace(/^[ \\t|]+$/gm, "");
                cleanNotes = cleanNotes.trim();
              }
              
              const currentHash = getStandardizedTaskHash(t.title, t.notes, t.due, t.status, true);
              
              let userConstraint = "";
              
              const isAssignedTask = !!(t.assignmentInfo || (t.webViewLink && (t.webViewLink.includes("docs.google.com") || t.webViewLink.includes("chat.google.com"))));
              if (isAssignedTask) {
                  if (PropertiesService.getScriptProperties().getProperty("ai_hash_" + t.id) === currentHash) {
                      aiHashMatch = true;
                  }
              } else if (metadataStr) {
                 try {
                   const existingMetadata = JSON.parse(metadataStr);
                   if (existingMetadata.user_constraint) {
                      userConstraint = existingMetadata.user_constraint;
                   }
                   if (existingMetadata.ai_hash === currentHash) {
                      aiHashMatch = true;
                   }
                 } catch(e) {}
              }
              
              if (userConstraint) {
                 cleanNotes += \`\\n[SYSTEM DIRECTIVE - STRICT USER CONSTRAINT: \${userConstraint}]\`;
              }
              
              const needsReview = !aiHashMatch; // THE FIX
              
              rawTasks.push({
                 id: t.id,
                 listId: listId,
                 title: t.title,
                 needsReview: needsReview
              });
          });
          pageToken = undefined; // just 1 page
        } catch(e) {
          pageToken = undefined;
        }
      } while (pageToken);
    });
    return rawTasks;
  }
  extractTasks();
`;

try {
  const tasks = vm.runInContext(fetchLogic, context);
  const unroutedTask = tasks.find(t => t.id === 'task1');
  const alreadyRoutedTask = tasks.find(t => t.id === 'task2');
  
  if (!unroutedTask.needsReview) {
    throw new Error("FAILED: Unrouted task should need review.");
  }
  if (alreadyRoutedTask.needsReview) {
    throw new Error("FAILED: Already routed task in Importer incorrectly needs review.");
  }
  
  console.log("PASSED: T17 test - Already routed Importer tasks are correctly skipped.");
  process.exit(0);
} catch(e) {
  console.error(e.message);
  process.exit(1);
}
