import os
import io
import datetime
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from typing import Optional, Tuple

SCOPES = ['https://www.googleapis.com/auth/drive']

class DriveService:
    def __init__(self):
        self.creds = self._get_credentials()
        self.service = None
        if self.creds:
            self.service = build('drive', 'v3', credentials=self.creds)

    def _get_credentials(self):
        """
        環境変数 GOOGLE_SERVICE_ACCOUNT_JSON または BASE64 から認証情報を取得
        (sheets_service.pyと同様のロジック)
        """
        service_account_info = None
        
        # 1. Raw JSON
        sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        if sa_json:
            try:
                service_account_info = json.loads(sa_json)
                if "private_key" in service_account_info:
                     # 秘密鍵の正規化（念のため）
                    raw_key = service_account_info["private_key"]
                    if "\\n" in raw_key:
                        raw_key = raw_key.replace("\\n", "\n")
                    # スペース欠落の自動修正
                    if "BEGIN PRIVATEKEY" in raw_key:
                        raw_key = raw_key.replace("BEGIN PRIVATEKEY", "BEGIN PRIVATE KEY")
                    if "END PRIVATEKEY" in raw_key:
                        raw_key = raw_key.replace("END PRIVATEKEY", "END PRIVATE KEY")
                    service_account_info["private_key"] = raw_key
            except Exception as e:
                print(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON in DriveService: {e}")

        # 2. Base64 (Fallback)
        if not service_account_info:
            sa_base64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_BASE64")
            if sa_base64:
                try:
                    import base64
                    decoded = base64.b64decode(sa_base64)
                    service_account_info = json.loads(decoded.decode('utf-8'))
                     # 秘密鍵正規化
                    if "private_key" in service_account_info:
                        service_account_info["private_key"] = service_account_info["private_key"].replace("\\n", "\n")
                except Exception as e:
                    print(f"Failed to parse Base64 creds in DriveService: {e}")

        # 3. Local File (Dev)
        if not service_account_info:
            local_path = "service_account.json" # バックエンドルート想定
            if os.path.exists(local_path):
                 try:
                    return service_account.Credentials.from_service_account_file(
                        local_path, scopes=SCOPES
                    )
                 except Exception:
                     pass

        if service_account_info:
            return service_account.Credentials.from_service_account_info(
                service_account_info, scopes=SCOPES
            )
        return None

    def upload_file(self, file_content: bytes, filename: str, mime_type: str, folder_id: str) -> Tuple[bool, Optional[str]]:
        """
        ファイルを指定フォルダにアップロード
        Returns: (success, web_view_link)
        """
        if not self.service:
            print("Drive Service not initialized")
            return False, None

        if not folder_id:
            print("No folder_id provided for upload")
            return False, None

        try:
            # タイムスタンプ付与
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            new_filename = f"{timestamp}_{filename}"

            file_metadata = {
                'name': new_filename,
                'parents': [folder_id]
            }

            media = MediaIoBaseUpload(
                io.BytesIO(file_content),
                mimetype=mime_type,
                resumable=True
            )

            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink',
                supportsAllDrives=True
            ).execute()

            print(f"Uploaded file to Drive: {new_filename} (ID: {file.get('id')})")
            return True, file.get('webViewLink')

        except Exception as e:
            print(f"Failed to upload to Drive: {e}")
            return False, None

    def copy_spreadsheet(self, template_id: str, new_name: str, folder_id: str = None) -> Tuple[Optional[str], Optional[str]]:
        """
        スプレッドシートをコピーして新規作成
        Returns: (new_spreadsheet_id, new_spreadsheet_url)
        """
        if not self.service:
             return None, None
        
        try:
            body = {'name': new_name}
            if folder_id:
                body['parents'] = [folder_id]

            # copyメソッドは body で名前を指定
            new_file = self.service.files().copy(
                fileId=template_id,
                body=body,
                fields='id, webViewLink, name',
                supportsAllDrives=True
            ).execute()
            
            print(f"Created new spreadsheet: {new_file.get('name')} (ID: {new_file.get('id')})")
            return new_file.get('id'), new_file.get('webViewLink')

        except Exception as e:
            print(f"Failed to copy spreadsheet: {e}")
            return None, None

    def get_folder_id_by_type(self, meeting_type: str) -> Optional[str]:
        """会議タイプに応じたフォルダIDを環境変数から取得"""
        if meeting_type == "management_meeting": # 運営会議
            return os.getenv("GOOGLE_DRIVE_MANAGEMENT_MEETING_FOLDER_ID")
        elif meeting_type == "service_meeting": # サービス担当者会議
            return os.getenv("GOOGLE_DRIVE_SERVICE_MEETING_FOLDER_ID")
        elif meeting_type == "assessment": # アセスメント（新規作成用フォルダ）
             return os.getenv("GOOGLE_DRIVE_ASSESSMENT_FOLDER_ID")
        return None

    def get_template_id_by_type(self, meeting_type: str) -> Optional[str]:
         """テンプレートID取得"""
         if meeting_type == "assessment":
             return os.getenv("GOOGLE_SHEETS_ASSESSMENT_TEMPLATE_ID")
         return None

# Singleton instance
drive_service = DriveService()
