/**
 * @file src/Code_IngestionBridge.js
 * @description Bridges send subject/body/name as base64 (b64 flag), and this script embeds them directly into the raw MIME using Content-Transfer-Encoding: base64, so the emoji bytes never touch an Apps Script string→email conversion.
 *
 * @version 1.0.1
 * @last_modified 2026-06-05
 * @modified_by Jules
 *
 * @changelog
 * - 1.0.1: Added JSDoc docstrings, standardized variables to let/const, removed unused doGet code.
 * - 1.0.0: Added standardized documentation header and improved error logging for empty catch blocks.
 */

const BRIDGE_SECRET = "MOW_BRIDGE_SECRET_2026";

/**
 * Handles HTTP POST requests.
 * @param {Object} e - The event object from Apps Script.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response indicating success or failure.
 */
function doPost(e) {
  if (e && e.parameter && e.parameter.action) {
    return doGet(e);
  }
  if (e && e.postData && e.postData.type === "application/json") {
    try {
      const payload = JSON.parse(e.postData.contents);
      if (payload && payload.action) {
        return doGet(e);
      }
    } catch (err) {
      console.error("Failed to parse POST payload: " + err.message);
    }
  }
  return processWebhook(e);
}

/**
 * Unified request handler for POST requests.
 * Supports: JSON body, form-encoded body, and URL query parameters.
 * @param {Object} e - The event object from Apps Script.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response indicating success or failure.
 */
function processWebhook(e) {
  try {
    let payload;
    
    // 1. Try JSON body first (WhatsApp/Telegram bridges)
    if (e.postData && e.postData.type === "application/json") {
      payload = JSON.parse(e.postData.contents);
    } 
    // 2. Fallback to URL query parameters (MacroDroid)
    else if (e.parameter && e.parameter.secret) {
      payload = e.parameter;
    }
    // 3. Last resort: try parsing postData contents as form-urlencoded
    else if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        console.error("Failed to parse form-urlencoded POST payload fallback: " + err.message);
        payload = e.parameter || {};
      }
    }
    else {
      payload = e.parameter || {};
    }
    
    // Verify secret to prevent unauthorized email sending
    if (payload.secret !== BRIDGE_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: "Unauthorized"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // If the b64 flag is set, subject/body/name are already base64-encoded UTF-8.
    // Pass them directly into raw MIME to preserve emojis.
    // If not set, base64-encode them now so the MIME path is unified.
    let subjectB64, bodyB64, nameB64;
    if (payload.b64) {
      subjectB64 = payload.subject;
      bodyB64    = payload.body;
      nameB64    = payload.name;
    } else {
      // Non-b64 callers (e.g. legacy/MacroDroid) - encode here.
      // Note: doPost may have already corrupted emojis, but ASCII is fine.
      subjectB64 = Utilities.base64Encode(payload.subject || "", Utilities.Charset.UTF_8);
      bodyB64    = Utilities.base64Encode(payload.body || "", Utilities.Charset.UTF_8);
      nameB64    = Utilities.base64Encode(payload.name || "", Utilities.Charset.UTF_8);
    }

    sendRawMimeEmail(
      payload.to,
      subjectB64,
      bodyB64,
      nameB64,
      payload.references || null,
      payload.attachments || []
    );


    
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Finds an existing Gmail thread by subject line for deterministic threading.
 * Decodes the base64 subject and searches the user's entire mailbox (including Trash/Archive).
 * If found, moves the thread back to the inbox and marks it as unread.
 *
 * @param {string} subjectB64 - Base64-encoded subject string.
 * @returns {string|null} The Gmail thread ID, or null if no matching thread is found or an error occurs.
 */
function findExistingThread(subjectB64) {
  try {
    // Decode subject to plain text for the search query
    const subject = Utilities.newBlob(Utilities.base64Decode(subjectB64)).getDataAsString('UTF-8');
    // Use in:anywhere so we find the thread even if it was moved to Trash or archived
    const query = 'subject:"' + subject + '" from:me to:me in:anywhere';
    const threads = GmailApp.search(query, 0, 1);
    if (threads && threads.length > 0) {
      const thread = threads[0];
      // Force the thread back to the inbox and mark it unread so the user sees the new message
      thread.moveToInbox();
      thread.markUnread();
      return thread.getId();
    }
  } catch (err) {
    Logger.log("Thread search failed: " + err.message);
  }
  return null;
}

/**
 * Constructs and sends a raw MIME email via Gmail API.
 * All text fields (subject, body, name) arrive as base64-encoded UTF-8.
 * They are embedded directly into the MIME using RFC 2047 headers and
 * Content-Transfer-Encoding: base64, so 4-byte emoji bytes are NEVER
 * decoded into Apps Script strings (which would corrupt them).
 *
 * @param {string} to - Recipient email address.
 * @param {string} subjectB64 - Base64-encoded subject line.
 * @param {string} bodyB64 - Base64-encoded body text.
 * @param {string} nameB64 - Base64-encoded sender display name.
 * @param {string|null} references - Message-ID reference for threading.
 * @param {Array} attachments - Array of {filename, mimeType, base64} objects.
 */
function sendRawMimeEmail(to, subjectB64, bodyB64, nameB64, references, attachments) {
  const boundary = "boundary_" + Math.random().toString(36).substr(2);
  const messageId = "<" + Math.random().toString(36).substr(2) + "@ingestion.bridge>";

  // Decode subject to plain text
  let bodyText = Utilities.newBlob(Utilities.base64Decode(bodyB64)).getDataAsString('UTF-8');

  // Look up existing thread to chain into
  const existingThreadId = findExistingThread(subjectB64);

  if (existingThreadId) {
    try {
      const thread = GmailApp.getThreadById(existingThreadId);
      const existingMessages = thread.getMessages();
      let normalizedThreadText = "";
      for (let i = 0; i < existingMessages.length; i++) {
        normalizedThreadText += normalizeText(existingMessages[i].getPlainBody());
      }

      const snippets = bodyText.split(/[\r\n]*---[\r\n]*/);
      const filteredSnippets = [];
      for (let j = 0; j < snippets.length; j++) {
        const snippet = snippets[j].trim();
        if (!snippet) continue;
        const normalizedSnippet = normalizeText(snippet);
        if (normalizedThreadText.indexOf(normalizedSnippet) === -1) {
          filteredSnippets.push(snippet);
        } else {
          Logger.log("Filtered out duplicate snippet: " + snippet.substring(0, 50) + "...");
        }
      }

      if (filteredSnippets.length === 0 && (!attachments || attachments.length === 0)) {
        Logger.log("Skipping email send as all snippets are duplicates.");
        return null;
      }

      bodyText = filteredSnippets.join("\n\n---\n\n");
      bodyB64 = Utilities.base64Encode(bodyText, Utilities.Charset.UTF_8);
    } catch (e) {
      Logger.log("Deduplication error: " + e.message);
    }
  }

  // Build MIME headers - subject and name use RFC 2047 base64 encoding
  const mimeLines = [
    "To: " + to,
    "Subject: =?UTF-8?B?" + subjectB64 + "?=",
    "From: =?UTF-8?B?" + nameB64 + "?= <" + to + ">",
    "Message-ID: " + messageId,
    "MIME-Version: 1.0"
  ];

  // Add threading headers - Gmail needs References + In-Reply-To to chain messages
  if (references) {
    mimeLines.push("References: " + references);
    mimeLines.push("In-Reply-To: " + references);
  }

  if (attachments && attachments.length > 0) {
    // Multipart message with attachments
    mimeLines.push("Content-Type: multipart/mixed; boundary=" + boundary);
    mimeLines.push("");
    mimeLines.push("--" + boundary);
    mimeLines.push("Content-Type: text/plain; charset=UTF-8");
    mimeLines.push("Content-Transfer-Encoding: base64");
    mimeLines.push("");
    mimeLines.push(bodyB64);
    mimeLines.push("");

    attachments.forEach(function(att) {
      mimeLines.push("--" + boundary);
      mimeLines.push("Content-Type: " + att.mimeType + "; name=\"" + (att.filename || "attachment") + "\"");
      mimeLines.push("Content-Disposition: attachment; filename=\"" + (att.filename || "attachment") + "\"");
      mimeLines.push("Content-Transfer-Encoding: base64");
      mimeLines.push("");
      mimeLines.push(att.base64);
      mimeLines.push("");
    });

    mimeLines.push("--" + boundary + "--");
  } else {
    // Simple single-part message
    mimeLines.push("Content-Type: text/plain; charset=UTF-8");
    mimeLines.push("Content-Transfer-Encoding: base64");
    mimeLines.push("");
    mimeLines.push(bodyB64);
  }

  // The MIME envelope is entirely ASCII (all emoji content is base64-encoded),
  // so a simple Utilities.base64Encode on the ASCII string is safe.
  const raw = Utilities.base64EncodeWebSafe(mimeLines.join("\r\n"));

  const sendPayload = { raw: raw };
  if (existingThreadId) {
    sendPayload.threadId = existingThreadId;
  }

  return Gmail.Users.Messages.send(sendPayload, "me");
}

/**
 * 🔒 Run this function ONCE manually from the Apps Script editor to authorize
 * the Gmail advanced service (gmail.modify scope) used by the ingestion bridge.
 */
function authorizeGmailSend() {
  const subjectB64 = Utilities.base64Encode("Bridge Auth Test", Utilities.Charset.UTF_8);
  const bodyB64    = Utilities.base64Encode("This is a test to authorize the gmail.modify scope.", Utilities.Charset.UTF_8);
  const nameB64    = Utilities.base64Encode("Atlas Bridge", Utilities.Charset.UTF_8);
  sendRawMimeEmail(
    Session.getActiveUser().getEmail(),
    subjectB64,
    bodyB64,
    nameB64,
    null,
    []
  );
  Logger.log("Authorization + test email sent successfully!");
}

/**
 * Normalizes text to make snippet-based duplicate checking robust against spacing,
 * line endings, and casing.
 * @param {string} txt - The text to normalize.
 * @returns {string} The normalized alphanumeric text.
 */
function normalizeText(txt) {
  if (!txt) return "";
  return txt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
