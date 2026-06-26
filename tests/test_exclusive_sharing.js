const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

// Load target code
const codePath = path.join(__dirname, '../src/Code_TheClerk_Drive.js');
console.log(`Loading Code_TheClerk_Drive.js from: ${codePath}`);
const targetCode = fs.readFileSync(codePath, 'utf8');

// Mock data store for permissions
const filePermissionsMockDb = {};

// Sandbox context
const context = {
  // Apps Script Globals
  SYSTEM_CONFIG: {
    SECRETS: {
      GEMINI_API_KEY: 'mock-gemini-key',
      GEMINI_MODEL_FLASH_LITE: 'mock-gemini-model'
    },
    ROOTS: {
      MASTER_SHEET_ID: 'mock-master-sheet-id',
      DRIVE_RULES_SHEET_ID: 'mock-rules-sheet-id'
    },
    SHEETS: {
      DRIVE_LOG: 'mock-drive-log',
      DRIVE_SESSION_LOG: 'mock-session-log',
      DRIVE_FILENAME_RULES: 'mock-filename-rules-gid',
      DRIVE_FOLDER_RULES: 'mock-folder-rules-gid'
    },
    DOCS: {
      CLERK_DRIVE_INSTRUCTIONS: 'mock-instructions-doc',
      TAXONOMY_JSON_ID: 'mock-taxonomy-doc',
      MASTER_ASSET_NAMING_PROTOCOL: 'mock-protocol-doc'
    },
    DRIVE_FOLDERS: {
      STND_SOURCES: ['mock-source-folder-1', 'mock-source-folder-2'],
      STND_DEST: 'mock-dest-folder',
      REVIEW: 'mock-review-folder'
    }
  },
  
  DriveApp: {
    Access: {
      ANYONE: 'ANYONE',
      ANYONE_WITH_LINK: 'ANYONE_WITH_LINK',
      DOMAIN: 'DOMAIN',
      DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK',
      PRIVATE: 'PRIVATE'
    }
  },
  
  Drive: {
    Permissions: {
      list: (targetId, options) => {
        if (filePermissionsMockDb[targetId]) {
          return { permissions: filePermissionsMockDb[targetId] };
        }
        return { permissions: [] };
      }
    }
  },
  
  MimeType: {
    GOOGLE_DOCS: 'application/vnd.google-apps.document',
    GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet'
  },
  
  console: {
    log: (...args) => console.log('[SANDBOX LOG]:', ...args),
    error: (...args) => console.error('[SANDBOX ERROR]:', ...args),
    warn: (...args) => console.warn('[SANDBOX WARN]:', ...args)
  },
  
  Logger: {
    log: (...args) => console.log('[SANDBOX LOGGER]:', ...args),
    error: (...args) => console.error('[SANDBOX LOGGER ERROR]:', ...args),
    warn: (...args) => console.warn('[SANDBOX LOGGER WARN]:', ...args)
  },
  
  Utilities: {
    formatDate: () => '2026-06-26',
    base64Encode: () => '',
    sleep: () => {}
  },
  
  Session: {
    getEffectiveUser: () => ({ getEmail: () => 'daniel@playmetech.net' })
  },
  
  SpreadsheetApp: {},
  DocumentApp: {},
  UrlFetchApp: {},
  Tasks: {},
  LockService: {}
};

// Create vm context and execute code
vm.createContext(context);
vm.runInContext(targetCode, context);

// Now run the test cases
console.log('Running tests for isExclusivelySharedPrivate...');

const emailA = "adersteg.daniel@gmail.com";
const emailB = "daniel@playmetech.net";

// CASE 1: File is owned by adersteg.daniel@gmail.com and shared ONLY with daniel@playmetech.net (private).
// Assertion: Must return true.
filePermissionsMockDb['file-case-1'] = [
  { type: 'user', emailAddress: emailA, role: 'owner' },
  { type: 'user', emailAddress: emailB, role: 'writer' }
];
const result1 = context.isExclusivelySharedPrivate('file-case-1');
assert.strictEqual(result1, true, 'CASE 1 should return true (exclusively shared private)');
console.log('✔ CASE 1 passed');

// CASE 2: File is owned by daniel@playmetech.net and shared ONLY with adersteg.daniel@gmail.com (private).
// Assertion: Must return true.
filePermissionsMockDb['file-case-2'] = [
  { type: 'user', emailAddress: emailB, role: 'owner' },
  { type: 'user', emailAddress: emailA, role: 'writer' }
];
const result2 = context.isExclusivelySharedPrivate('file-case-2');
assert.strictEqual(result2, true, 'CASE 2 should return true (exclusively shared private)');
console.log('✔ CASE 2 passed');

// CASE 3: File is shared with a third party.
// Assertion: Must return false.
filePermissionsMockDb['file-case-3'] = [
  { type: 'user', emailAddress: emailA, role: 'owner' },
  { type: 'user', emailAddress: emailB, role: 'writer' },
  { type: 'user', emailAddress: 'thirdparty@example.com', role: 'reader' }
];
const result3 = context.isExclusivelySharedPrivate('file-case-3');
assert.strictEqual(result3, false, 'CASE 3 should return false (shared with third party)');
console.log('✔ CASE 3 passed');

// CASE 4: File has general link/domain sharing enabled (not PRIVATE).
// Assertion: Must return false.
filePermissionsMockDb['file-case-4'] = [
  { type: 'user', emailAddress: emailA, role: 'owner' },
  { type: 'user', emailAddress: emailB, role: 'writer' },
  { type: 'anyone', role: 'reader' }
];
const result4 = context.isExclusivelySharedPrivate('file-case-4');
assert.strictEqual(result4, false, 'CASE 4 should return false (anyone/link sharing enabled)');
console.log('✔ CASE 4 passed');

// CASE 5: File is not shared with anyone (solo owner).
// Assertion: Must return false.
filePermissionsMockDb['file-case-5'] = [
  { type: 'user', emailAddress: emailA, role: 'owner' }
];
const result5 = context.isExclusivelySharedPrivate('file-case-5');
assert.strictEqual(result5, false, 'CASE 5 should return false (solo owner, not shared)');
console.log('✔ CASE 5 passed');

console.log('All tests passed successfully!');
