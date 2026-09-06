import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

def create_md_file(service, folder_id, file_name):
    file_metadata = {
        'name': file_name,
        'parents': [folder_id],
        'mimeType': 'text/plain'
    }
    media = MediaIoBaseUpload(io.BytesIO(b"# Initial 28-Day Strategic Pruning Report\n"), mimetype='text/plain', resumable=True)
    file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
    return file.get('id')

def main():
    creds = Credentials.from_authorized_user_file('auth/token.json', ['https://www.googleapis.com/auth/drive'])
    service = build('drive', 'v3', credentials=creds)

    private_folder = "13Nvsav_Gt1zTXjPH0crBMdERN9HkN2pc"
    ce_folder = "1MuDEjRgrh6l2wvtpdoi3Tiq_oRUjzBwx"

    private_name = "TS - Task Master > 28 Day Strategic Pruning (Private).md"
    ce_name = "TS - Task Master > 28 Day Strategic Pruning (CE).md"

    print("Creating files...")
    p_id = create_md_file(service, private_folder, private_name)
    print(f"Private ID: {p_id}")

    w_id = create_md_file(service, ce_folder, ce_name)
    print(f"CE ID: {w_id}")

if __name__ == '__main__':
    main()
