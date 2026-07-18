const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simple mocking environment for testing
const mockGmailLabels = [
  { name: '00 Manual Review', deleteCalled: false },
  { name: '01 Private', deleteCalled: false },
  { name: '01 Private/01 Personal Admin', deleteCalled: false },
  { name: '01 00 00 Private', deleteCalled: false },
  { name: '01 00 00 Private/01 01 00 Personal Admin', deleteCalled: false },
  { name: '03 02 00 Uppsala University', deleteCalled: false },
  { name: '03 00 00 Studies/03 02 00 /03 02 01 År 1 | (2009-2010)', deleteCalled: false },
  { name: '99 00 00 Operational/System', deleteCalled: false }
];

const mockUserLabels = mockGmailLabels.map(l => {
  let threadCount = 1;
  return {
    getName: () => l.name,
    deleteLabel: () => {
      l.deleteCalled = true;
      console.log(`Mock deleteLabel called for: ${l.name}`);
    },
    getThreads: () => {
      if (threadCount > 0) {
        threadCount--;
        return [{
          addLabel: () => {},
          removeLabel: () => {}
        }];
      }
      return [];
    }
  };
});

const GmailApp = {
  getUserLabels: () => mockUserLabels,
  getUserLabelByName: (name) => {
    return mockUserLabels.find(l => l.getName() === name) || null;
  },
  createLabel: (name) => {
    const newLabel = {
      getName: () => name,
      deleteLabel: () => {},
      getThreads: () => []
    };
    mockUserLabels.push(newLabel);
    return newLabel;
  }
};

// Mock Console
const consoleLogSpy = [];
const consoleMock = {
  log: (...args) => {
    consoleLogSpy.push(args.join(' '));
    console.log('TestLog:', ...args);
  },
  error: (...args) => console.error('TestError:', ...args),
  warn: (...args) => console.warn('TestWarn:', ...args)
};

// Read files
const listLabelsCode = fs.readFileSync(path.join(__dirname, '../src/Code_ListLabels.js'), 'utf8');
const workspaceTaxonomyCode = fs.readFileSync(path.join(__dirname, '../src/Code_WorkspaceTaxonomy.js'), 'utf8');

// Helper to run code in sandbox
function runInSandbox(code, extraGlobals = {}) {
  const { VM } = require('vm');
  const context = {
    GmailApp,
    console: consoleMock,
    Logger: consoleMock,
    IS_PMT_ENV: false,
    ...extraGlobals
  };
  const vm = require('vm');
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

function testCleanup() {
  console.log('\n--- Running testCleanup ---');
  // Reset mock state
  mockGmailLabels.forEach(l => l.deleteCalled = false);
  consoleLogSpy.length = 0;

  const context = runInSandbox(listLabelsCode);
  context.migrateDuplicateGmailLabels();

  // Assertions
  const deleted = mockGmailLabels.filter(l => l.deleteCalled).map(l => l.name);
  console.log('Deleted labels:', deleted);

  const expectedDeleted = [
    '01 00 00 Private',
    '01 00 00 Private/01 01 00 Personal Admin',
    '03 02 00 Uppsala University',
    '03 00 00 Studies/03 02 00 /03 02 01 År 1 | (2009-2010)',
    '99 00 00 Operational/System'
  ];

  expectedDeleted.forEach(name => {
    assert.ok(deleted.includes(name), `Should have deleted ${name}`);
  });

  const kept = mockGmailLabels.filter(l => !l.deleteCalled).map(l => l.name);
  console.log('Kept labels:', kept);

  const expectedKept = [
    '00 Manual Review',
    '01 Private',
    '01 Private/01 Personal Admin'
  ];

  expectedKept.forEach(name => {
    assert.ok(kept.includes(name), `Should have kept ${name}`);
  });

  console.log('testCleanup PASSED');
}

function testWorkspaceTaxonomyParsing() {
  console.log('\n--- Running testWorkspaceTaxonomyParsing ---');
  
  // Create a minimal mock of the docs/TS - Categorisation (Private).md file
  const mockMarkdownContent = `
# Taxonomy Test

## 1. Hierarchy

### 01 00 00 Private

* **01 01 00 Personal Admin**

- **01 01 01 Task Management**: Description here

### 03 00 00 Studies

## 03 XX 00 Institutions

* **03 01 00 Östra Real**

* **03 02 00 Uppsala University**

* **03 03 00 Stockholms Nation**

## 03 02 00 Uppsala University Years

- 03 02 01 År 1 | (2009-2010)
`;

  // We need to run syncTaxonomyToSheet with mock environment
  const mockSheet = {
    clearContents: () => {},
    clear: () => {},
    getRange: () => ({
      setValues: (values) => {
        mockSheet.lastWrittenValues = values;
      },
      setFontWeight: () => {},
      setBackground: () => {}
    }),
    autoResizeColumns: () => {},
    getSheetId: () => 123
  };

  const mockSpreadsheet = {
    getSheets: () => [mockSheet],
    openById: () => mockSpreadsheet
  };

  const mockFolder = {
    getFilesByName: () => ({ hasNext: () => false }),
    createFile: () => {}
  };

  const mockFile = {
    getBlob: () => ({
      getDataAsString: () => mockMarkdownContent
    }),
    getParents: () => ({
      next: () => mockFolder
    })
  };

  const mockRootFolder = {
    getId: () => "mock-root-id",
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => mockRootFolder,
    getFilesByName: () => ({ hasNext: () => false }),
    createFile: () => ({ getUrl: () => 'mock-url' })
  };

  const mockDriveApp = {
    getFileById: () => mockFile,
    getRootFolder: () => mockRootFolder
  };

  const mockSpreadsheetApp = {
    openById: () => mockSpreadsheet
  };

  const mockUtilities = {
    newBlob: (content, mimeType, name) => ({
      getDataAsString: () => content
    })
  };

  const SYSTEM_CONFIG = {
    ROOTS: {
      MASTER_SHEET_ID: 'dummy-sheet-id'
    },
    DOCS: {
      TAXONOMY_DOC_ID: 'dummy-doc-id'
    },
    SHEETS: {
      LOS_TAXONOMY: 123
    }
  };

  const context = runInSandbox(workspaceTaxonomyCode, {
    DriveApp: mockDriveApp,
    SpreadsheetApp: mockSpreadsheetApp,
    Utilities: mockUtilities,
    SYSTEM_CONFIG,
    cleanAndCreateGmailLabels: () => {
      console.log('Mocked cleanAndCreateGmailLabels called');
    }
  });

  context.syncTaxonomyToSheet();

  const values = mockSheet.lastWrittenValues;
  assert.ok(values && values.length > 0, 'Should have written values to sheet');
  
  // Find column headers and drive path column index
  const headers = values[0];
  const drivePathIdx = headers.indexOf('Drive Path');
  const concatLabelIdx = headers.indexOf('Concat (Label)');
  const l2NameIdx = headers.indexOf('L2 Name');
  const l2CodeIdx = headers.indexOf('L2 Code');
  const l3CodeIdx = headers.indexOf('L3 Code');

  console.log('Headers:', headers);
  
  // Let's inspect L2 nodes for Studies to make sure they parsed correctly
  const ostraRealRow = values.find(row => row[l2CodeIdx] === '03 01 00');
  const uppsalaRow = values.find(row => row[l2CodeIdx] === '03 02 00');
  const stockholmRow = values.find(row => row[l2CodeIdx] === '03 03 00');

  assert.ok(ostraRealRow, '03 01 00 Östra Real should be parsed');
  assert.equal(ostraRealRow[l2NameIdx], 'Östra Real');
  assert.ok(uppsalaRow, '03 02 00 Uppsala University should be parsed');
  assert.equal(uppsalaRow[l2NameIdx], 'Uppsala University');
  assert.ok(stockholmRow, '03 03 00 Stockholms Nation should be parsed');
  assert.equal(stockholmRow[l2NameIdx], 'Stockholms Nation');

  // Let's inspect L3 node 03 02 01
  const ar1Row = values.find(row => row[l3CodeIdx] === '03 02 01');
  assert.ok(ar1Row, '03 02 01 should be parsed');
  assert.equal(ar1Row[l2NameIdx], 'Uppsala University', 'L2 Name for 03 02 01 should be Uppsala University');
  
  // Check Drive Path for 03 02 01 (it should NOT have a trailing space before the slash)
  const drivePath = ar1Row[drivePathIdx];
  console.log('03 02 01 Drive Path:', drivePath);
  assert.ok(!drivePath.includes('03 02 00 /'), 'Drive path should not contain a space before the slash for L2');
  assert.equal(drivePath, '03 00 00 Studies/03 02 00 Uppsala University/03 02 01 År 1 | (2009-2010)');

  console.log('testWorkspaceTaxonomyParsing PASSED');
}

function testCleanAndCreateGmailLabels() {
  console.log('\n--- Running testCleanAndCreateGmailLabels ---');

  const createdLabels = [];
  const deletedLabels = [];

  const localGmailApp = {
    getUserLabels: () => [
      { getName: () => "02 Work/OldLabel", deleteLabel: () => deletedLabels.push("02 Work/OldLabel") }
    ],
    getUserLabelByName: (name) => null,
    createLabel: (name) => {
      createdLabels.push(name);
      return { getName: () => name };
    }
  };

  const mockTaxonomy = [
    {
      "L1 Code": "01 00 00",
      "L1 Name": "Private",
      "L2 Code": "01 01 00",
      "L2 Name": "Personal Admin",
      "Concat (Label)": "01 Private/01 Personal Admin",
      "Drive Path": "01 00 00 Private/01 01 00 Personal Admin"
    }
  ];

  const mockTaxonomyFile = {
    getBlob: () => ({
      getDataAsString: () => JSON.stringify(mockTaxonomy)
    })
  };

  const mockDriveApp = {
    getFilesByName: (name) => {
      assert.equal(name, "LOS_Taxonomy.json");
      let hasNextCalled = false;
      return {
        hasNext: () => {
          if (!hasNextCalled) {
            hasNextCalled = true;
            return true;
          }
          return false;
        },
        next: () => mockTaxonomyFile
      };
    }
  };

  const context = runInSandbox(listLabelsCode, {
    GmailApp: localGmailApp,
    DriveApp: mockDriveApp,
    IS_PMT_ENV: false
  });

  context.cleanAndCreateGmailLabels();

  console.log("Created labels:", createdLabels);
  console.log("Deleted labels:", deletedLabels);

  assert.deepStrictEqual(deletedLabels, []);
  // Concat (Label) has: "01 Private/01 Personal Admin".
  // This builds nested: "01 Private" and "01 Private/01 Personal Admin".
  assert.ok(createdLabels.includes("01 Private"));
  assert.ok(createdLabels.includes("01 Private/01 Personal Admin"));
  assert.ok(!createdLabels.includes("01 00 00 Private"));

  console.log('testCleanAndCreateGmailLabels PASSED');
}

try {
  testCleanup();
  testWorkspaceTaxonomyParsing();
  testCleanAndCreateGmailLabels();
  console.log('\nAll local tests PASSED!');
} catch (err) {
  console.error('\nTest failed:', err);
  process.exit(1);
}

