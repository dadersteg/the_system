/**
 * @file src/Code_TheClerk_Photo_Sync.js
 * @description Extracts automated photo backups from Messenger, Instagram, and Telegram, uploads them natively to Google Photos, and logs them in the Photo Register.
 *
 * @version 1.0.1
 * @last_modified 2024-05-24
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added comprehensive JSDoc/Google-style docstrings. Standardized variable naming. Cleaned up code.
 * - 1.0.0: Initial implementation.
 */

/**
 * Processes automated photo backup emails from Messenger, Instagram, and Telegram.
 * Extracts image attachments, uploads them to Google Photos, and logs metadata
 * (including AI analysis) to the Photo Register sheet.
 *
 * @returns {void}
 */
function processGmailPhotos() {
  const query = "has:attachment (subject:[Instagram] OR subject:[Messenger] OR subject:[Telegram]) from:adersteg.daniel@gmail.com -label:Photo_Extracted";
  const threads = GmailApp.search(query, 0, 10);
  
  if (threads.length === 0) return;
  
  let label;
  try {
    label = GmailApp.getUserLabelByName("Photo_Extracted");
    if (!label) {
      label = GmailApp.createLabel("Photo_Extracted");
    }
  } catch(e) {
    console.warn("Failed to get/create label: " + e.message);
    return;
  }
  
  const photoRegisterId = "1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k"; 
  let sheet = null;
  try {
    const ss = SpreadsheetApp.openById(photoRegisterId);
    sheet = ss.getSheetByName("Table 1") || ss.getSheets()[1] || ss.getActiveSheet();
  } catch(e) {
    console.warn("Photo Register Sheet not accessible yet: " + e.message);
  }
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    
    const uploadResults = _processAndUploadAttachments(messages);
    const mediaItemsToCreate = uploadResults.mediaItemsToCreate;
    const processedImages = uploadResults.processedImages;
    
    // 3. Batch Create Media Items
    if (mediaItemsToCreate.length > 0) {
      const urls = _batchCreateMediaItems(mediaItemsToCreate);
      
      // 4. Append to Photo Register (Batched)
      if (sheet) {
        let rowsToWrite = [];
        for (let m = 0; m < processedImages.length; m++) {
          const img = processedImages[m];
          const photoUrl = urls[m] || ""; // Match by index
          
          rowsToWrite.push([
            img.name,
            "Gmail_Import",
            img.date,
            "", // Lat
            "", // Lng
            photoUrl,
            img.analysis.category || "01 Private/05 Other",
            img.analysis.purpose || "",
            (img.analysis.activities || []).join(", "),
            (img.analysis.entities || []).join(", "),
            (img.analysis.text_found || []).join(", "),
            img.analysis.vibe || "",
            img.analysis.is_milestone || false
          ]);
        }

        if (rowsToWrite.length > 0) {
           sheet.getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
        }
      } else {
        console.log(`Processed ${processedImages.length} photos, but no sheet to log.`);
      }
      // Mandatory delay to respect Google Photos 'concurrent write request' quota
      Utilities.sleep(2000);
    }
    
    // Tag thread to avoid double processing
    thread.addLabel(label);
  }
}

/**
 * Uploads raw image bytes to Google Photos to obtain an upload token.
 * This token is required before calling the batchCreate API.
 *
 * @param {GoogleAppsScript.Base.Blob} blob - The image blob to upload.
 * @param {string} filename - The target filename.
 * @returns {string|null} The upload token string if successful, or null on failure.
 */
function _uploadBytesToPhotos(blob, filename) {
  const token = ScriptApp.getOAuthToken();
  const uploadOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": blob.getContentType(),
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-File-Name": filename || blob.getName()
    },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  };
  
  try {
    const uploadRes = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/uploads", uploadOptions);
    if (uploadRes.getResponseCode() === 200) {
      return uploadRes.getContentText();
    }
  } catch(e) {
    console.error("Photos Byte Upload failed: " + e.message);
  }
  return null;
}

/**
 * Submits a batch request to Google Photos to create new media items using upload tokens.
 *
 * @param {Array<Object>} mediaItems - Array of media item objects containing descriptions and uploadTokens.
 * @returns {Array<string>} An array of product URLs corresponding to the created media items.
 */
function _batchCreateMediaItems(mediaItems) {
  const token = ScriptApp.getOAuthToken();
  const createOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/json"
    },
    payload: JSON.stringify({ newMediaItems: mediaItems }),
    muteHttpExceptions: true
  };
  
  let urls = [];
  try {
    const res = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", createOptions);
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data.newMediaItemResults) {
        for (let i = 0; i < data.newMediaItemResults.length; i++) {
          const item = data.newMediaItemResults[i];
          if (item.mediaItem && item.mediaItem.productUrl) {
            urls.push(item.mediaItem.productUrl);
          } else {
            urls.push("");
          }
        }
      }
    } else {
      console.error("Photos Batch create failed: " + res.getContentText());
    }
  } catch(e) {
    console.error("Photos Batch create exception: " + e.message);
  }
  return urls;
}

/**
 * Analyzes an image using the Gemini API to extract rich metadata and contextual information.
 *
 * @param {GoogleAppsScript.Base.Blob} blob - The image blob to analyze.
 * @param {Object} msgContext - Context from the original email (subject, sender, date, body).
 * @returns {Object} Parsed JSON object containing the Gemini analysis, or empty object on failure.
 */
function _analyzePhotoWithGemini(blob, msgContext) {
  const apiKey = SYSTEM_CONFIG.SECRETS.GEMINI_API_KEY;
  if (!apiKey) return {};

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + SYSTEM_CONFIG.SECRETS.GEMINI_MODEL_FLASH_LITE + ":generateContent?key=" + apiKey;
  const base64Image = Utilities.base64Encode(blob.getBytes());
  
  const payload = {
    contents: [{
      parts: [
        { text: "Analyze this image and return a JSON object with: category (from TS taxonomy), purpose, activities (array), entities (array), text_found (array), vibe, is_milestone (boolean)." + (msgContext ? `\n\nOriginal Message Context:\n- Subject: ${msgContext.subject}\n- Sender: ${msgContext.sender}\n- Date: ${msgContext.date}\n- Body: ${msgContext.body ? msgContext.body.substring(0, 500) : ''}` : "") },
        { inlineData: { mimeType: blob.getContentType(), data: base64Image } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const res = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(res.getContentText());
    if (json.candidates && json.candidates[0]) {
      const text = json.candidates[0].content.parts[0].text;
      return JSON.parse(text);
    }
  } catch(e) {
    console.error("Gemini analysis failed: " + e.message);
  }
  return {};
}


/**
 * Processes messages to extract image attachments, uploads them, and performs AI analysis.
 * Extracted from processGmailPhotos to improve error handling and readability.
 *
 * @param {Array<GoogleAppsScript.Gmail.GmailMessage>} messages - Array of Gmail messages to process.
 * @returns {Object} Object containing arrays for `processedImages` and `mediaItemsToCreate`.
 */
function _processAndUploadAttachments(messages) {
  let processedImages = [];
  let mediaItemsToCreate = [];

  for (let j = 0; j < messages.length; j++) {
    const msg = messages[j];
    const attachments = msg.getAttachments();
    const date = msg.getDate();
    const subject = msg.getSubject();
    const sender = msg.getFrom();
    const body = msg.getPlainBody();

    for (let k = 0; k < attachments.length; k++) {
      const att = attachments[k];
      if (att.getContentType().indexOf("image/") !== -1) {
        try {
          // Remove brackets and make it a clean sentence
          let cleanSubject = subject.replace(/\[|\]/g, "").replace(/\s+/g, " ").trim();
          let safeFilename = cleanSubject.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_") + ".jpg";

          // 1. Upload bytes (get token)
          const uploadToken = _uploadBytesToPhotos(att, safeFilename);
          if (!uploadToken) continue;

          // 2. Analyze with Gemini
          const analysis = _analyzePhotoWithGemini(att, { subject: subject, sender: sender, date: date, body: body });

          // Strip URLs and programmatic brackets to prevent Google Photos from silently dropping the metadata as 'spam'
          let cleanBody = body ? body.replace(/https?:\/\/[^\s]+/g, "[Link removed]").substring(0, 400).trim() : "";
          let photoDescription = `Source: ${cleanSubject}\nDate: ${date}\nMessage: ${cleanBody}`;

          mediaItemsToCreate.push({
            description: photoDescription,
            simpleMediaItem: {
              uploadToken: uploadToken,
              fileName: safeFilename
            }
          });

          processedImages.push({
            name: safeFilename,
            date: date,
            analysis: analysis
          });

          // Small delay to avoid hammering the upload API
          Utilities.sleep(500);
        } catch (e) {
          console.warn(`Failed processing attachment in message ${subject}: ${e.message}`);
        }
      }
    }
  }

  return { processedImages, mediaItemsToCreate };
}
