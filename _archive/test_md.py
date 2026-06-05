import sys
MARKDOWN_FILE = '/Users/daniel/Documents/agy_quantum21/artifacts/task_review_table.md'
row_count = 0
with open(MARKDOWN_FILE, 'r', encoding='utf-8') as f:
    lines = f.readlines()
in_table = False
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('|') and stripped.endswith('|'):
        if stripped.replace('|', '').replace('-', '').strip() == '':
            continue
        if in_table:
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if not cells[0] or not cells[1]:
                print(f"Empty cell row {i}: {stripped}")
        row_count += 1
        in_table = True
    else:
        if stripped:
            print(f"Line not matched {i}: {stripped}")
print("Markdown rows counted:", row_count - 1)
print("Total lines in file:", len(lines))
