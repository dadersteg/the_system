import sys
MARKDOWN_FILE = '/Users/daniel/Documents/agy_quantum21/artifacts/task_review_table.md'
with open(MARKDOWN_FILE, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    stripped = line.strip()
    if not (stripped.startswith('|') and stripped.endswith('|')):
        print(f"Line {i} not starting/ending with |: {repr(line)}")
