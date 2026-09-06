/**
 * Facebook Cookie Extractor
 * Opens a browser to facebook.com, waits for you to log in,
 * then saves the cookies as appstate.json for the Messenger bridge.
 *
 * Usage: node src/ingestion/messenger_login.js
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const APPSTATE_PATH = path.join(process.env.HOME, '.messenger_auth', 'appstate.json');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function extractCookies() {
    console.log('Opening browser — please log in to Facebook...\n');

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1200, height: 800 }
    });

    const page = await browser.newPage();
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2' });

    console.log('👉 Log in to Facebook in the browser window.');
    console.log('   Once you see your News Feed or Messenger, press ENTER here.\n');

    // Wait for user to press enter
    await new Promise(resolve => {
        process.stdin.resume();
        process.stdin.once('data', resolve);
    });

    // Extract cookies
    const cookies = await page.cookies('https://www.facebook.com');

    // Convert to appState format expected by fca-unofficial
    const appState = cookies.map(c => ({
        key: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        creation: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
    }));

    // Verify we have the essential cookies
    const essentialKeys = ['c_user', 'xs', 'datr'];
    const foundKeys = appState.map(c => c.key);
    const missing = essentialKeys.filter(k => !foundKeys.includes(k));

    if (missing.length > 0) {
        console.error(`❌ Missing essential cookies: ${missing.join(', ')}`);
        console.error('   Make sure you are fully logged in before pressing ENTER.');
        await browser.close();
        process.exit(1);
    }

    // Save
    fs.mkdirSync(path.dirname(APPSTATE_PATH), { recursive: true });
    fs.writeFileSync(APPSTATE_PATH, JSON.stringify(appState, null, 2));

    console.log(`✅ Saved ${appState.length} cookies to ${APPSTATE_PATH}`);
    console.log(`   Essential cookies found: ${essentialKeys.filter(k => foundKeys.includes(k)).join(', ')}`);
    console.log('\n   You can now start the Messenger bridge:');
    console.log('   pm2 start src/ingestion/messenger_bridge.js --name messenger-bridge\n');

    await browser.close();
    process.exit(0);
}

extractCookies().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
