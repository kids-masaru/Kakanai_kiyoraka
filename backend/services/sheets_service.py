"""
Sheets Service - Google Sheets統合
"""
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os
import json
from typing import Dict, Any, List, Optional


class SheetsService:
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Google Sheets APIクライアントを初期化"""
        scope = [
            'https://spreadsheets.google.com/feeds',
            'https://www.googleapis.com/auth/drive'
        ]
        
        # 環境変数からサービスアカウント情報を取得
        service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        
        if service_account_json:
            try:
                service_account_info = json.loads(service_account_json)
                credentials = ServiceAccountCredentials.from_json_keyfile_dict(
                    service_account_info, scope
                )
                self.client = gspread.authorize(credentials)
            except Exception as e:
                print(f"Failed to initialize Google Sheets client: {e}")
                self.client = None
    
    def write_data(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        data: Dict[str, Any],
        mapping_type: str = "assessment"
    ) -> int:
        """
        スプレッドシートにデータを書き込み
        
        Args:
            spreadsheet_id: スプレッドシートID
            sheet_name: シート名
            data: 書き込むデータ（キー: 値の辞書）
            mapping_type: マッピングタイプ（assessment, meeting等）
        
        Returns:
            書き込んだセル数
        """
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        spreadsheet = self.client.open_by_key(spreadsheet_id)
        worksheet = spreadsheet.worksheet(sheet_name)
        
        # マッピングファイルを読み込み（将来の拡張用）
        # 現在はシンプルに行追加で実装
        
        written_count = 0
        cells_to_update = []
        
        # データを行として追加
        # TODO: マッピング定義に基づいてセル位置を決定
        for key, value in data.items():
            if value and value != "（空白）":
                # シンプルな実装: A列にキー、B列に値
                cells_to_update.append({
                    "key": key,
                    "value": str(value)
                })
                written_count += 1
        
        # バッチ更新（効率化）
        if cells_to_update:
            # 最終行を取得
            all_values = worksheet.get_all_values()
            next_row = len(all_values) + 1
            
            for i, cell_data in enumerate(cells_to_update):
                worksheet.update_cell(next_row + i, 1, cell_data["key"])
                worksheet.update_cell(next_row + i, 2, cell_data["value"])
        
        return written_count
    
    def read_data(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        range_str: Optional[str] = None
    ) -> List[List[str]]:
        """
        スプレッドシートからデータを読み込み
        """
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        spreadsheet = self.client.open_by_key(spreadsheet_id)
        worksheet = spreadsheet.worksheet(sheet_name)
        
        if range_str:
            return worksheet.get(range_str)
        else:
            return worksheet.get_all_values()
    
    def create_spreadsheet(self, title: str, template_id: Optional[str] = None) -> str:
        """
        新しいスプレッドシートを作成
        
        Returns:
            新しいスプレッドシートのID
        """
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        if template_id:
            # テンプレートからコピー
            template = self.client.open_by_key(template_id)
            new_spreadsheet = self.client.copy(template_id, title)
            return new_spreadsheet.id
        else:
            # 新規作成
            spreadsheet = self.client.create(title)
            return spreadsheet.id
