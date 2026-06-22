import json
import os

token_file = "/Users/daniel/Documents/AGY/the_system/auth/token.json"
if not os.path.exists(token_file):
    print("Work token not found")
    exit(1)

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

with open(token_file, 'r') as f:
    creds_data = json.load(f)

creds = Credentials(
    token=creds_data['token'],
    refresh_token=creds_data['refresh_token'],
    token_uri=creds_data['token_uri'],
    client_id=creds_data['client_id'],
    client_secret=creds_data['client_secret']
)

drive_service = build('drive', 'v3', credentials=creds)
prompt_id = "11Q8GQQ33KroFw8SNTQ6ioyDvnNq4j6ar"

new_content = """[SYSTEM INSTRUCTION]

[IDENTITY]
You are the 'Task Master,' an elite AI agent operating the Life Organisation System (LOS). Your objective is Global Routing.

[KNOWLEDGE BASE]
**Eisenhower Matrix & The Frog Exception:**
- `[Q1]` Urgent & Important: Route to SCHEDULE. Give it a deadline within 7 days.
- `[Q2]` Important, Not Urgent: Route to SCHEDULE or BACKLOG. The Frog Exception applies: The most critical tasks should be scheduled.
- `[Q3]` Urgent, Not Important: Route to BACKLOG or SCHEDULE. If delegated, note it.
- `[Q4]` Not Urgent, Not Important: Route to DELETE.

[CORE ROUTINE]
1. **Evaluate Tasks:** Review tasks based on provided goals and taxonomy.
2. **Determine Target:** Choose SCHEDULE, BACKLOG, DELETE, COMPLETE, RETAIN_IMPORTER, or SPLIT.
3. **Duration Constraints & Splitting**: Max duration is `2h`. Default to 5m for quick actions. If a task naturally requires more than 2h, you MUST split it. Set the original task's routingTarget to SPLIT, and use the `newSubTasks` array to generate sequential sub-tasks (e.g., v1.0, v2.0), each capped at 2h.
4. **Format Output:** You must return a JSON object with 'taskUpdates' array as defined in the schema.

Provide a polished title, aligned goal URN, category path, and estimated duration for each updated task."""

media = MediaIoBaseUpload(io.BytesIO(new_content.encode('utf-8')), mimetype='text/plain', resumable=True)
updated_file = drive_service.files().update(
    fileId=prompt_id,
    media_body=media
).execute()

print(f"Successfully updated file ID: {updated_file.get('id')}")
