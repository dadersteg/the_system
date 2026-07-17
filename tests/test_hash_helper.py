import sys
import json
import re
import hashlib
import base64

def get_standardized_task_hash(title, notes, due, status, strip_title_tags):
    title = title or ""
    notes = notes or ""
    due = due or ""
    status = status or ""
    
    tag_regex = re.compile(r'(?:\[(?:DEADLINE|DURATION|GOAL):[^\]]*\]\s*\|?\s*)+')
    
    # 1. Process Title
    if strip_title_tags:
        title = tag_regex.sub("", title)
    title = " ".join(title.split()).strip()
    
    # 2. Process Notes
    parts = notes.split('---SYSTEM_METADATA---')
    base_notes = parts[0]
    lines = base_notes.splitlines()
    filtered_lines = []
    
    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith("SYS:"):
            continue
            
        no_tags = tag_regex.sub("", line)
        if re.match(r'^[ \t|]*$', no_tags):
            continue
            
        filtered_lines.append(no_tags)
        
    notes_str = " ".join(filtered_lines)
    notes_str = " ".join(notes_str.split()).strip()
    
    # 3. Process Due & Status
    due = " ".join(due.split()).strip()
    status = " ".join(status.split()).strip()
    
    # 4. Combine and hash
    content = f"{title}|{notes_str}|{due}|{status}"
    hasher = hashlib.md5(content.encode('utf-8'))
    return base64.b64encode(hasher.digest()).decode('utf-8')

def main():
    data = json.load(sys.stdin)
    results = []
    for case in data:
        h = get_standardized_task_hash(
            case.get('title'),
            case.get('notes'),
            case.get('due'),
            case.get('status'),
            case.get('stripTitleTags')
        )
        results.append(h)
    print(json.dumps(results))

if __name__ == '__main__':
    main()
