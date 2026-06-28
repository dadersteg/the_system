/**
 * @file Code_TheClerk_Photo_Archaeologist.js
 * @description A recurring script that passively indexes natively backed-up photos (e.g., from WhatsApp).
 * It reads recent Google Photos, filters out those already in the Photo Register,
 * downloads a low-res thumbnail, analyzes it using Gemini, and appends the metadata to the Register.
 */

function runPhotoArchaeologist() {
  const photoRegisterId = "1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k"; 
  let sheet = null;
  try {
    const ss = SpreadsheetApp.openById(photoRegisterId);
    sheet = ss.getSheetByName("Table 1") || ss.getSheets()[1] || ss.getActiveSheet();
  } catch(e) {
    console.warn("Photo Register Sheet not accessible: " + e.message);
    return;
  }

  // 1. Get already logged URLs to prevent duplicates
  const lastRow = sheet.getLastRow();
  let existingUrls = new Set();
  if (lastRow > 1) {
    // Column F (index 6) holds the Google Photos URL
    const urlsRange = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    for (let i = 0; i < urlsRange.length; i++) {
      if (urlsRange[i][0]) {
        existingUrls.add(urlsRange[i][0]);
      }
    }
  }

  // 2. Fetch recent media items from Google Photos
  const token = ScriptApp.getOAuthToken();
  const searchUrl = "https://photoslibrary.googleapis.com/v1/mediaItems";
  const options = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + token
    },
    muteHttpExceptions: true
  };
  
  let mediaItems = [];
  try {
    const res = UrlFetchApp.fetch(searchUrl + "?pageSize=50", options);
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data.mediaItems) {
        mediaItems = data.mediaItems;
      }
    } else {
      console.error("Failed to fetch Google Photos: " + res.getContentText());
      return;
    }
  } catch(e) {
    console.error("Photos API exception: " + e.message);
    return;
  }

  let rowsToWrite = [];
  
  // 3. Process new media items
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    
    // Google Photos API returns 'productUrl'
    if (!item.productUrl || existingUrls.has(item.productUrl)) {
      continue;
    }
    
    // Verify it's an image
    if (item.mimeType && item.mimeType.indexOf("image/") !== 0) {
      continue;
    }

    try {
      // Download a small thumbnail for Gemini analysis
      const thumbnailUrl = item.baseUrl + "=w500-h500";
      const blobRes = UrlFetchApp.fetch(thumbnailUrl);
      const blob = blobRes.getBlob();
      
      // Analyze using the existing Gemini function from Code_TheClerk_Photo_Sync.js
      // Pass null for msgContext since this is passively uploaded
      const analysis = _analyzePhotoWithGemini(blob, null);
      
      const safeFilename = item.filename || "Native_Upload.jpg";
      const creationTime = item.mediaMetadata ? item.mediaMetadata.creationTime : new Date().toISOString();
      
      rowsToWrite.push([
        safeFilename,
        "Native_Archaeologist", // Indicates it was grabbed post-upload
        creationTime,
        "", // Lat
        "", // Lng
        item.productUrl,
        analysis.category || "01 Private/05 Other",
        analysis.purpose || "Native Device Backup",
        (analysis.activities || []).join(", "),
        (analysis.entities || []).join(", "),
        (analysis.text_found || []).join(", "),
        analysis.vibe || "",
        analysis.is_milestone || false
      ]);
      
      // Mandatory delay to respect quota limitations
      Utilities.sleep(1000);
      
    } catch (e) {
      console.warn("Failed to process item " + item.id + ": " + e.message);
    }
  }
  
  // 4. Append to Photo Register
  if (rowsToWrite.length > 0 && sheet) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
    console.log(`Successfully logged ${rowsToWrite.length} new photos.`);
  } else {
    console.log("No new photos found to log.");
  }
}
