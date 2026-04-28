/**
 * The System - Data Ingestion Webhook
 * Phase C.1: Capture Pipeline
 * 
 * This script serves as the primary gateway for external "noise" (WhatsApp, Telegram, SMS).
 * It listens for HTTP POST requests and routes the incoming text into the LOS triage system.
 */

function doPost(e) {
  try {
    // 1. Parse the incoming payload
    const payload = JSON.parse(e.postData.contents);
    
    // TODO: Depending on the chosen integration (Telegram, Zapier, etc.),
    // extract the message text and sender information here.
    const incomingText = payload.message || payload.text || "No text provided";
    const source = payload.source || "Unknown Webhook";

    // 2. Route the message into the system
    // Option A: Send it to Gmail as an email (so The Clerk can categorize it)
    // Option B: Push it directly to Google Tasks as a raw triage item
    
    routeToGmail(incomingText, source);
    
    // 3. Return a success response to the calling service
    return ContentService.createTextOutput(JSON.stringify({ status: "success", received: incomingText }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Webhook Error:", error);
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper to route captured text into Gmail for standard processing.
 */
function routeToGmail(text, source) {
  const emailAddress = Session.getActiveUser().getEmail();
  const subject = `[LOS Ingestion] Raw Capture from ${source}`;
  
  GmailApp.sendEmail(emailAddress, subject, text);
  console.log(`Routed capture to Gmail: ${subject}`);
}
