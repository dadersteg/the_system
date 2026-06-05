/**
 * Google OAuth2 Token Helper
 * Reads clasp credentials and provides access tokens for authenticated
 * requests to Apps Script Web Apps (required by Advanced Protection Program).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CLASPRC_PATH = path.join(os.homedir(), '.clasprc.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Returns a valid Google OAuth2 access token.
 * Caches the token and refreshes it 60 seconds before expiry.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken() {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < tokenExpiry - 60000) {
        return cachedToken;
    }

    const clasprc = JSON.parse(fs.readFileSync(CLASPRC_PATH, 'utf8'));
    const creds = clasprc.tokens?.default;

    if (!creds || !creds.refresh_token) {
        throw new Error('No refresh token found in ~/.clasprc.json. Run "npx clasp login" first.');
    }

    const body = new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token'
    });

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Google tokens typically expire in 3600 seconds
    tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

    return cachedToken;
}

const PRIVATE_TOKEN_PATH = '/Users/daniel/Documents/AGY/the_system/token.json';
let cachedPrivateToken = null;
let privateTokenExpiry = 0;

/**
 * Returns a valid access token for the private profile (from token.json).
 * Caches the token and refreshes it if expired.
 * @returns {Promise<string>} The access token.
 */
async function getPrivateAccessToken() {
    if (cachedPrivateToken && Date.now() < privateTokenExpiry - 60000) {
        return cachedPrivateToken;
    }

    if (!fs.existsSync(PRIVATE_TOKEN_PATH)) {
        throw new Error(`Private token file not found at ${PRIVATE_TOKEN_PATH}. Run regenerate_private_token.py first.`);
    }

    const tokenData = JSON.parse(fs.readFileSync(PRIVATE_TOKEN_PATH, 'utf8'));
    
    // Check if expired
    const expiryTime = new Date(tokenData.expiry).getTime();
    if (Date.now() < expiryTime - 60000 && tokenData.token) {
        cachedPrivateToken = tokenData.token;
        privateTokenExpiry = expiryTime;
        return cachedPrivateToken;
    }

    // Refresh token
    console.log("Refreshing expired private token...");
    const body = new URLSearchParams({
        client_id: tokenData.client_id,
        client_secret: tokenData.client_secret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token'
    });

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`Private token refresh failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    cachedPrivateToken = data.access_token;
    privateTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

    // Save back to file
    tokenData.token = cachedPrivateToken;
    tokenData.expiry = new Date(privateTokenExpiry).toISOString();
    fs.writeFileSync(PRIVATE_TOKEN_PATH, JSON.stringify(tokenData, null, 2), 'utf8');

    return cachedPrivateToken;
}

/**
 * Invalidates the cached token, forcing the next getAccessToken() call
 * to fetch a fresh one. Called when a webhook returns HTML instead of JSON.
 */
function invalidateToken() {
    cachedToken = null;
    tokenExpiry = 0;
}

module.exports = { getAccessToken, getPrivateAccessToken, invalidateToken };
