# Work Setup Results

Your Google Tasks and Drive folders have been initialized on your Work profile.

## 1. Google Tasks Lists
- **Importer (Importer mapped to My Tasks)**: `MDYyMjMzMTg0OTMyNDE4MjM4MDk6MDow`
- **AI Review**: `WDVGU1pHd25FTnJuLXJ6dg`
- **TODO**: `M05Gb0c1dG91bXlkQUJpVQ`
- **To be deleted**: `MVlRNkVjUlJwMWpaenVTYQ`
- **Recurring**: `N01qSEtvZ2ZWLWVMYW1KWQ`

## 2. Google Drive Folders
- **Ingestion Sources (00 Inbox)**: `1iuy0Ewq-m-ZDgUOkzQt6juDeqK9QaW5W`
- **Fallback Destination (Destination TBC)**: `1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR`
- **Manual Review (Manual Review)**: `1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H`

## 3. Spreadsheet Candidate
Based on Drive search, candidate is: **The System - Generated Files Manifest** (`18GxKFcObA6z3d_gxe7adkk2dRKz0LuQ9Np21hkJsOhc`)

## 4. Apps Script Setup Code
Copy this code block, open your Work Google Apps Script editor (`1QCKorj4NsrS_fYbPBTIt-aYGlX8lUZFwqBkl8GpT6iX2WIKB4CMeHs75`), create a new file or add to an existing file, paste it, and run `setupWorkScriptProperties` once. Afterwards, you can delete this code block from the editor.

```javascript
function setupWorkUserProperties() {
  var properties = {
    "IMPORTER_LIST_ID": "MDYyMjMzMTg0OTMyNDE4MjM4MDk6MDow",
    "AI_REVIEW_LIST_ID": "WDVGU1pHd25FTnJuLXJ6dg",
    "TODO_LIST_ID": "M05Gb0c1dG91bXlkQUJpVQ",
    "TO_BE_DELETED_LIST_ID": "MVlRNkVjUlJwMWpaenVTYQ",
    "RECURRING_LIST_ID": "N01qSEtvZ2ZWLWVMYW1KWQ",
    
    "DRIVE_STND_SOURCES": "1iuy0Ewq-m-ZDgUOkzQt6juDeqK9QaW5W",
    "DRIVE_STND_DEST": "1wAWcN2BA2xA8nMiKUad7UQP0H-scg_WR",
    "DRIVE_REVIEW": "1XhG9y__HT3x4QXmFKr9cBCRThSijHt9H",
    
    "MASTER_SHEET_ID": "18GxKFcObA6z3d_gxe7adkk2dRKz0LuQ9Np21hkJsOhc",
    "WORKSPACE_FOLDER_ID": "1Jb5PhZnrqsP3uoUE20Lv75eO4zySPyTr"
  };
  
  var props = PropertiesService.getUserProperties();
  props.setProperties(properties);
  
  Logger.log("=========================================");
  Logger.log("Work Environment User Properties Set Successfully!");
  Logger.log(JSON.stringify(properties, null, 2));
  Logger.log("=========================================");
}
```
