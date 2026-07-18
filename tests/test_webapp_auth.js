const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Mock Apps Script Globals
const mockScriptProperties = {
  properties: {
    ENV: 'WORK',
    WEBAPP_SECRET: 'super-secret-token'
  },
  getProperty(key) {
    return this.properties[key] || null;
  },
  getProperties() {
    return this.properties;
  },
  setProperty(key, val) {
    this.properties[key] = val;
  }
};

const PropertiesService = {
  getScriptProperties: () => mockScriptProperties,
  getUserProperties: () => ({
    getProperties: () => ({})
  })
};

let activeUserEmail = "";
let effectiveUserEmail = "";

const Session = {
  getActiveUser: () => ({
    getEmail: () => activeUserEmail
  }),
  getEffectiveUser: () => ({
    getEmail: () => effectiveUserEmail
  })
};

const ContentService = {
  MimeType: {
    JSON: 'JSON',
    TEXT: 'TEXT'
  },
  createTextOutput: (text) => {
    let mime = 'TEXT';
    const output = {
      getContent: () => text,
      setMimeType: (m) => { mime = m; return output; }
    };
    return output;
  }
};

const HtmlService = {
  XFrameOptionsMode: {
    ALLOWALL: 'ALLOWALL'
  },
  createHtmlOutputFromFile: (file) => ({
    setTitle: () => ({
      addMetaTag: () => ({
        setXFrameOptionsMode: () => 'HTML_OUTPUT'
      })
    })
  })
};

// Create the context
const sandbox = {
  PropertiesService,
  Session,
  ContentService,
  HtmlService,
  console: {
    log: (...args) => {},
    warn: (...args) => {},
    error: (...args) => console.error('SandboxError:', ...args)
  },
  _cachedIsWorkAccount: null,
  _userPropertiesCache: null,
  _scriptPropertiesCache: null
};

vm.createContext(sandbox);

function loadSourceFile(filename) {
  const filePath = path.join(__dirname, '../src', filename);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
}

// Load files
loadSourceFile('Code_Config.js');
loadSourceFile('Code_SystemCore.js');
loadSourceFile('Code_Dashboard.js');

function runTest() {
  console.log("Running Web App Auth test...");

  // Test 1: Anonymous request (no secret, no email) should fail (401)
  activeUserEmail = "";
  effectiveUserEmail = "daniel@playmetech.net"; // If runs as owner, effective user is owner
  let response = sandbox.doGet({ parameter: {} });
  
  if (!response || typeof response.getContent !== 'function') {
    throw new Error("Test Failed: Anonymous request was not rejected with a ContentService text output!");
  }
  let content = JSON.parse(response.getContent());
  assert.strictEqual(content.status, 401, "Anonymous request must be rejected with 401");
  console.log("✓ Anonymous request rejected with 401.");

  // Test 2: Request with valid secret should succeed
  response = sandbox.doGet({ parameter: { secret: 'super-secret-token' } });
  if (response && typeof response.getContent === 'function' && response.getContent().includes('"status":401')) {
    throw new Error("Test Failed: Request with valid secret was rejected!");
  }
  console.log("✓ Request with valid secret accepted.");

  // Test 3: Request with invalid secret should fail
  response = sandbox.doGet({ parameter: { secret: 'wrong-token' } });
  if (!response || typeof response.getContent !== 'function') {
    throw new Error("Test Failed: Request with invalid secret was not rejected with a ContentService text output!");
  }
  content = JSON.parse(response.getContent());
  assert.strictEqual(content.status, 401, "Request with invalid secret must be rejected with 401");
  console.log("✓ Request with invalid secret rejected with 401.");

  // Test 4: Logged in allowed user (activeEmail in allowlist) should succeed
  activeUserEmail = "daniel@playmetech.net";
  effectiveUserEmail = "daniel@playmetech.net";
  response = sandbox.doGet({ parameter: {} });
  if (response && typeof response.getContent === 'function' && response.getContent().includes('"status":401')) {
    throw new Error("Test Failed: Allowed active user was rejected!");
  }
  console.log("✓ Request with allowed active user accepted.");

  // Test 5: Logged in unauthorized user should fail
  activeUserEmail = "stranger@gmail.com";
  effectiveUserEmail = "daniel@playmetech.net";
  response = sandbox.doGet({ parameter: {} });
  if (!response || typeof response.getContent !== 'function') {
    throw new Error("Test Failed: Stranger request was not rejected with a ContentService text output!");
  }
  content = JSON.parse(response.getContent());
  assert.strictEqual(content.status, 401, "Stranger must be rejected with 401");
  console.log("✓ Unauthorized active user rejected with 401.");

  console.log("PASS: Web App Auth test passed successfully.");
}

try {
  runTest();
} catch (err) {
  console.error("Test FAILED:", err.message);
  process.exit(1);
}
