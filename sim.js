// A quick node script using the Drive API directly.
// Let's search by Original Name
const fs = require('fs');
const { google } = require('googleapis');

const credsStr = fs.readFileSync('auth/token.json', 'utf8');
const creds = JSON.parse(credsStr);
const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
auth.setCredentials(creds);

const drive = google.drive({ version: 'v3', auth });

async function run() {
  const q = "name contains 'Notes by Gemini'";
  const res = await drive.files.list({
    q: q,
    fields: 'files(id, name)',
    pageSize: 50
  });
  console.log("Found:", res.data.files);
}
run();
