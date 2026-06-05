import sys, re
sys.path.append('/Users/daniel/Documents/agy_quantum21/scripts')
import analyze_tasks

tasks = analyze_tasks.get_tasks()
api_titles = set(analyze_tasks.sanitize_md(t.get('title', '')).strip() for t in tasks)

MARKDOWN_FILE = '/Users/daniel/Documents/agy_quantum21/artifacts/task_review_table.md'
md_titles = set()
with open(MARKDOWN_FILE, 'r', encoding='utf-8') as f:
    for line in f:
        stripped = line.strip()
        if stripped.startswith('|') and not stripped.replace('|', '').replace('-', '').strip() == '':
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if cells[0] != 'Task Title':
                md_titles.add(cells[0])

print("Titles in API but not in MD:")
for t in api_titles - md_titles:
    print(repr(t))
print("Titles in MD but not in API:")
for t in md_titles - api_titles:
    print(repr(t))

