import os
import re

# Project root directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
AUTH_DIR = os.path.join(BASE_DIR, 'auth')

# Google OAuth Credentials & Tokens Paths
PRIVATE_TOKEN_PATH = os.path.join(AUTH_DIR, 'token_tasks_private.json' if os.path.exists(os.path.join(AUTH_DIR, 'token_tasks_private.json')) else 'token_tasks.json')
PRIVATE_CREDS_PATH = os.path.join(AUTH_DIR, 'creds_private.json' if os.path.exists(os.path.join(AUTH_DIR, 'creds_private.json')) else 'creds.json')

WORK_TOKEN_PATH = os.path.join(AUTH_DIR, 'token_tasks_work.json')
WORK_CREDS_PATH = os.path.join(AUTH_DIR, 'creds_work.json')

SHEET_TOKEN_PATH = os.path.join(AUTH_DIR, 'token.json')
SHEET_CREDS_PATH = os.path.join(AUTH_DIR, 'credentials.json')

# Spreadsheet IDs
TASK_REVIEW_GID = 1580572400
PRIVATE_SPREADSHEET_ID = "13bU68Lg4l0qV6-iSoZRrwSgHHS6jfA7yrrx9YLuXNNY"
WORK_SPREADSHEET_ID = "1FO-iNKasPpen9MpG2Urt7IFFgw4psrm6sArxjuAWDxY"
