import json

with open('/Users/daniel/Documents/AGY/the_system/batch_1.json', 'r') as f:
    data = json.load(f)

for k in data.keys():
    print(k)
