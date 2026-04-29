import urllib.request
import json
import os

with open('.env') as f:
    key = None
    for line in f:
        if line.startswith('GEMINI_API_KEY='):
            key = line.split('=')[1].strip()

url = f'https://generativelanguage.googleapis.com/v1beta/models?key={key}'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read())
    models = [m['name'] for m in data.get('models', []) if '3.1' in m['name'] or 'flash' in m['name']]
    print("MATCHING MODELS:")
    for m in models:
        print(m)
