---
name: create_task
description: Creates a Google Task directly via the Tasks API using clasp.
---

# Skill Description
Use this skill when the user agrees to an actionable item that belongs in Google Tasks.

# Instructions
1. Ensure the task title strictly follows the Standard Identifier syntax: `[L1] [L2] [L3] Code [L4] Context ID > Description`. Example: `01 02 01 Physical Health > Buy vitamins`.
2. Run the following command in the terminal to create the task. Replace `<TITLE>` and `<NOTES>` with the appropriate strings. Ensure you properly escape the strings inside the JSON array.
```bash
cd /Users/daniel/Documents/the_system && clasp run createAdHocTaskFromCLI -p '["<TITLE>", "<NOTES>"]'
```
3. Wait for the command to finish and confirm the success output with the user.
