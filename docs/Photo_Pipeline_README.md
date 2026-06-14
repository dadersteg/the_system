# The Clerk - Photo Sync Pipeline Architecture

This document describes the design and workflows for the automated Photo pipeline. The system handles the ingestion, AI-categorization, and centralized tracking of all historical and new photos in the ecosystem.

## 1. Master Data Ledger: The Photo Register
- **Google Sheet ID:** `1XIuEjl85k_eF9F5HQJzZbyLoTNccQmAc9y9YMid9q0k`
- **Tab Target:** `Table 1`
- **Purpose:** Acts as the single source of truth for all visual assets. It logs the filename, source, extracted date, native Google Photos URL, and rich AI metadata (Categories, Activities, Entities, Identified Text, Vibe, Milestone status) mapped to the Life Organisation System (LOS).

---

## 2. Live Sync Pipeline (Recurring)
The automated live sync runs completely in the cloud via Google Apps Script as part of **The Clerk**.

### Location
- **File:** `/src/Code_TheClerk_Photo_Sync.js`
- **Trigger:** Runs during the standard `The Clerk` email processing sweep.

### How it works:
1. **Inbox Polling:** Searches Gmail for `has:attachment from:adersteg.daniel@gmail.com -label:Photo_Extracted`. It specifically targets subjects matching automated backups (e.g., `[Instagram]`, `[Messenger]`, `[Telegram]`).
2. **Byte Upload:** Reads the binary data of image attachments and silently POSTs them to the Google Photos Library API `uploads` endpoint to retrieve secure `uploadTokens`.
3. **AI Analysis:** Each photo is passed to **Gemini 1.5 Flash Vision** to extract rich metadata and contextual categorizations according to the LOS taxonomy.
4. **Batch Creation:** To respect strict Google Photos API rate limits (quota limit: `concurrent write request`), it aggregates all tokens for an email thread and executes a single `batchCreate` call.
5. **Ledger Update:** The returned Google Photos URLs are mapped back to their Gemini analyses and natively appended as new rows into `Table 1` of the Photo Register spreadsheet.
6. **State Tracking:** The processed Gmail thread is tagged with the label `Photo_Extracted` so it is never double-processed.

---

## 3. Historical Backfill Pipeline (Local Python)
For migrating large quantities of deep historical zip archives (10,000+ files), a local python pipeline is utilized to bypass Google Apps Script timeout limits.

### Location
- **File:** `/scratch/upload_to_google_photos.py`
- **State Cache:** `/scratch/uploaded_photos.json` (Prevents duplicate uploads)

### How it works:
1. Iterates over extracted `.zip` directories or Google Drive folders.
2. Extracts dates from Meta filenames (e.g. `2017-12-21_Messenger...`).
3. **EXIF Injection:** Uses `piexif` to dynamically inject the extracted date into the binary payload, ensuring the photo appears natively in the correct chronological order on the Google Photos timeline.
4. Performs rate-limited uploads and `batchCreate` calls.
5. **Auto-Resume:** The script inherently tracks its progress in `uploaded_photos.json`. If it hits the Google Cloud daily API quota (10,000 calls/day), it can simply be rerun the next day and will automatically skip all previously processed files.

---

## 4. Maintenance & Quotas
- **Google Photos API Limits:** The Google Cloud Project is limited to 10,000 API calls per day. Because processing a single photo requires 2 API calls (byte upload + media creation), the maximum throughput is ~5,000 photos per 24-hour cycle.
- **Error 429 (`RATE_LIMIT_EXCEEDED`):** If this occurs, the script must be paused until the daily quota resets at midnight Pacific Time.
- **Error 429 (`concurrent write request`):** Handled natively by The Clerk via `Utilities.sleep(500)` delays and thread-level batching.
