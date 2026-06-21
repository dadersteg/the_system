/**
 * THE CLERK: GMAIL PHOTO EXTENSION
 * 
 * Instructions:
 * 1. Add this function to your existing Clerk Google Apps Script project.
 * 2. In your main `processEmails` loop, call `processGmailPhotos()`
 * 3. Add the following scopes to your appsscript.json:
 *    - "https://www.googleapis.com/auth/photoslibrary.appendonly"
 *    - "https://www.googleapis.com/auth/generative-language.retriever" (or whatever you use for Gemini)
 */

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // Or fetch from ScriptProperties
const PHOTO_REGISTER_SHEET_ID = "YOUR_PHOTO_REGISTER_SHEET_ID"; 

function processGmailPhotos() {
  // Search for the specific automated exports
  const query = "has:attachment (subject:[Instagram] OR subject:[Messenger] OR subject:[Telegram]) from:adersteg.daniel@gmail.com -label:Photo_Extracted";
  const threads = GmailApp.search(query);
  
  if (threads.length === 0) return;
  
  let label = GmailApp.getUserLabelByName("Photo_Extracted");
  if (!label) {
    label = GmailApp.createLabel("Photo_Extracted");
  }
  
  const sheet = SpreadsheetApp.openById(PHOTO_REGISTER_SHEET_ID).getActiveSheet();
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    
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
          
          // 1. Upload to Google Photos
          const photoUrl = uploadToGooglePhotosNative(att, { subject: subject, sender: sender, date: date, body: body });
          if (!photoUrl) continue;
          
          // 2. Analyze with Gemini Vision
          const analysis = analyzePhotoWithGemini(att, { subject: subject, sender: sender, date: date, body: body });
          
          // 3. Append to Photo Register
          sheet.appendRow([
            att.getName(),
            "Gmail_Import",
            date,
            "", // Lat
            "", // Lng
            photoUrl,
            analysis.category || "",
            analysis.purpose || "",
            (analysis.activities || []).join(", "),
            (analysis.entities || []).join(", "),
            (analysis.text_found || []).join(", "),
            analysis.vibe || "",
            analysis.is_milestone || false
          ]);
        }
      }
    }
    // Tag thread to avoid double processing
    thread.addLabel(label);
  }
}

/**
 * Uploads an Apps Script Blob to Google Photos
 */
function uploadToGooglePhotosNative(blob, msgContext) {
  const token = ScriptApp.getOAuthToken();
  
  // Step 1: Upload bytes
  const uploadOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": blob.getContentType(),
      "X-Goog-Upload-Protocol": "raw"
    },
    payload: blob.getBytes()
  };
  
  let uploadToken;
  try {
    const uploadRes = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/uploads", uploadOptions);
    uploadToken = uploadRes.getContentText();
  } catch(e) {
    Logger.log("Upload failed: " + e.message);
    return null;
  }
  
  let photoDescription = blob.getName();
  if (msgContext) {
    let cleanBody = msgContext.body ? msgContext.body.substring(0, 500).trim() : "";
    photoDescription = cleanBody ? `${msgContext.subject}\n\n${cleanBody}` : msgContext.subject;
  }

  const createOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-type": "application/json"
    },
    payload: JSON.stringify({
      newMediaItems: [{
        description: photoDescription,
        simpleMediaItem: { uploadToken: uploadToken }
      }]
    })
  };
  
  try {
    const res = UrlFetchApp.fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", createOptions);
    const data = JSON.parse(res.getContentText());
    if (data.newMediaItemResults && data.newMediaItemResults[0]) {
      return data.newMediaItemResults[0].mediaItem.productUrl;
    }
  } catch(e) {
    Logger.log("Batch create failed: " + e.message);
  }
  return null;
}

/**
 * Passes the image to Gemini 1.5 Flash
 */
function analyzePhotoWithGemini(blob, msgContext) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY;
  
  const base64Image = Utilities.base64Encode(blob.getBytes());
  
  const payload = {
    contents: [{
      parts: [
        { text: "Analyze this image and return a JSON object with: category, purpose, activities (array), entities (array), text_found (array), vibe, is_milestone (boolean)." + (msgContext ? `\n\nOriginal Message Context:\n- Subject: ${msgContext.subject}\n- Sender: ${msgContext.sender}\n- Date: ${msgContext.date}\n- Body: ${msgContext.body ? msgContext.body.substring(0, 500) : ''}` : "") },
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
    payload: JSON.stringify(payload)
  };
  
  try {
    const res = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(res.getContentText());
    const text = json.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch(e) {
    Logger.log("Gemini failed: " + e.message);
    return {};
  }
}
