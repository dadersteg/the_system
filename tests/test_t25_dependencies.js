const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTest() {
    console.log("Running T25 Dependencies Test...");
    
    // 1. Check fca-config.json
    const configPath = path.join(__dirname, '../src/ingestion/fca-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    assert.strictEqual(config.autoUpdate, false, "autoUpdate should be false to prevent runtime RCE");
    assert.strictEqual(config.checkUpdate.install, false, "checkUpdate.install should be false");

    // 2. Check package.json for pinned version
    const pkgPath = path.join(__dirname, '../src/ingestion/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const fcaDep = pkg.dependencies['@dongdev/fca-unofficial'];
    assert.ok(fcaDep, "@dongdev/fca-unofficial must be declared in dependencies");
    assert.ok(!fcaDep.startsWith('^') && !fcaDep.startsWith('~'), "Dependency must be strictly pinned (no ^ or ~)");

    console.log("PASS: Dependencies pinned and auto-update disabled.");
}

runTest();
