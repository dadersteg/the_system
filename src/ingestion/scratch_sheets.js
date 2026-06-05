const { getAccessToken } = require('./google_auth.js');
const SHEET_ID = '1-3lZ4Pp-varXyqKWPtm4rjzh6GOMBMXjawor8mWc2ZY';

async function fetchSheet() {
    try {
        const token = await getAccessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:K`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { console.error("Error:", await res.text()); return; }
        const data = await res.json();
        console.log("Total rows:", data.values.length);
        console.log("First 5 rows:");
        console.log(JSON.stringify(data.values.slice(0, 5), null, 2));
    } catch (e) {
        console.error(e);
    }
}
fetchSheet();
