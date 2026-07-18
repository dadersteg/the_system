import json
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from lib.google_auth import get_service, get_credentials
import sys

def get_file(token_file, file_id, out_name):
    
    service = get_service('drive', 'v3', token_file)
    content = service.files().get_media(fileId=file_id).execute().decode('utf-8')
    with open(out_name, 'w') as f:
        f.write(content)

try:
    get_file('auth/token.json', '1_TMGaK2U00kMeagblJjrcD6MJFcY18Kq', 'plan_private.txt')
    print("Fetched private plan")
except Exception as e:
    print("Private failed:", e)

try:
    get_file('auth/token_tasks_work.json', '1zCKlhaTchntW-2Lk1_el7ShnOzZSqmO7', 'plan_pmt.txt')
    print("Fetched PMT plan")
except Exception as e:
    print("PMT failed:", e)

