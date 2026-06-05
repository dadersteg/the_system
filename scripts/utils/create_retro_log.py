import csv
import requests
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file('token.json')
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

access_token = creds.token
sheet_id = '1iHcD1dbDiCsYZy6gGJ2k5by6NUtQS8re1J5mBCrUgb4'

url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}:batchUpdate"
headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}

# Create the sheet
payload = {
  "requests": [
    {
      "addSheet": {
        "properties": {
          "title": "Drive 05 Retro Log"
        }
      }
    }
  ]
}

response = requests.post(url, headers=headers, json=payload)
if response.status_code == 200:
    data = response.json()
    new_sheet_id = data['replies'][0]['addSheet']['properties']['sheetId']
    print(f"Created sheet with GID: {new_sheet_id}")
    
    # Update headers
    headers_payload = {
      "requests": [
        {
          "updateCells": {
            "range": {
              "sheetId": new_sheet_id,
              "startRowIndex": 0,
              "endRowIndex": 1,
              "startColumnIndex": 0,
              "endColumnIndex": 18
            },
            "rows": [
              {
                "values": [
                  {"userEnteredValue": {"stringValue": "URL"}},
                  {"userEnteredValue": {"stringValue": "Original Name"}},
                  {"userEnteredValue": {"stringValue": "Description"}},
                  {"userEnteredValue": {"stringValue": "Final Name"}},
                  {"userEnteredValue": {"stringValue": "Path Code"}},
                  {"userEnteredValue": {"stringValue": "Context ID"}},
                  {"userEnteredValue": {"stringValue": "Summary"}},
                  {"userEnteredValue": {"stringValue": "Metadata Description"}},
                  {"userEnteredValue": {"stringValue": "Reasoning"}},
                  {"userEnteredValue": {"stringValue": "Tokens"}},
                  {"userEnteredValue": {"stringValue": "Status"}},
                  {"userEnteredValue": {"stringValue": "Source Folder Path"}},
                  {"userEnteredValue": {"stringValue": "Target Folder ID"}},
                  {"userEnteredValue": {"stringValue": "Target Folder Path"}},
                  {"userEnteredValue": {"stringValue": "Shortcuts Generated"}},
                  {"userEnteredValue": {"stringValue": "Revised Path (Override)"}},
                  {"userEnteredValue": {"stringValue": "Revised Name (Override)"}},
                  {"userEnteredValue": {"stringValue": "Override Status"}}
                ]
              }
            ],
            "fields": "userEnteredValue"
          }
        },
        {
          "repeatCell": {
            "range": {
              "sheetId": new_sheet_id,
              "startRowIndex": 0,
              "endRowIndex": 1
            },
            "cell": {
              "userEnteredFormat": {
                "textFormat": {
                  "bold": True
                },
                "backgroundColor": {
                  "red": 0.8,
                  "green": 0.88,
                  "blue": 0.95
                }
              }
            },
            "fields": "userEnteredFormat(textFormat,backgroundColor)"
          }
        }
      ]
    }
    res2 = requests.post(url, headers=headers, json=headers_payload)
    if res2.status_code == 200:
        print("Headers applied successfully.")
    else:
        print("Failed to apply headers:", res2.text)
else:
    print(f"Failed to create sheet: {response.text}")
