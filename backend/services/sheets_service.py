"""
Sheets Service - Google Sheets統合（マッピング対応版）
"""
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

# マッピングファイルのパス
CONFIG_DIR = Path(__file__).parent.parent / "config"
MAPPING_FILE = CONFIG_DIR / "mapping.txt"
MAPPING2_FILE = CONFIG_DIR / "mapping2.txt"

# Google Sheets APIスコープ（care-dx-appと同じ設定）
# Google Sheets APIスコープ（推奨設定）
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]


class SheetsService:
    def __init__(self):
        self.client = None
        self.mapping_dict = None
        self.mapping2_dict = None
        self._initialize_client()
        self._load_mappings()
    
    def _initialize_client(self):
        """Google Sheets APIクライアントを初期化（google.oauth2を使用 - 安全対策済み）"""
        from google.oauth2 import service_account
        import google.auth
        
        # 認証情報を保持する変数
        service_account_info = None

        # 1. Raw JSON文字列環境変数から認証（推奨）
        service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        
        if service_account_json:
            try:
                print("DEBUG: Found GOOGLE_SERVICE_ACCOUNT_JSON", flush=True)
                service_account_info = json.loads(service_account_json)
                
                if "private_key" in service_account_info:
                    raw_key = service_account_info["private_key"]
                    # Log key format for debugging (safe subset)
                    print(f"DEBUG: Private Key Start: {repr(raw_key[:50])}", flush=True)
                    print(f"DEBUG: Private Key Length: {len(raw_key)}", flush=True)
                    
                    if "\\n" in raw_key:
                        print("DEBUG: Normalizing private key newlines", flush=True)
                        service_account_info["private_key"] = raw_key.replace("\\n", "\n")
                    else:
                        print("DEBUG: Private key does not contain literal \\n. Treating as valid or already normalized.", flush=True)

                print(f"DEBUG: Service Account Email: {service_account_info.get('client_email')}", flush=True)
                print(f"DEBUG: Project ID: {service_account_info.get('project_id')}", flush=True)
                print("DEBUG: Successfully parsed JSON", flush=True)
            except Exception as e:
                print(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: {e}", flush=True)

        # 2. Base64エンコードされた環境変数から認証（フォールバック）
        if not service_account_info:
            service_account_base64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_BASE64")
            if service_account_base64:
                try:
                    import base64
                    print("DEBUG: Found GOOGLE_SERVICE_ACCOUNT_BASE64", flush=True)
                    service_account_base64 = service_account_base64.strip()
                    decoded_bytes = base64.b64decode(service_account_base64)
                    service_account_info = json.loads(decoded_bytes.decode('utf-8'))
                    
                    # Base64の場合も念のため正規化
                    if "private_key" in service_account_info:
                        service_account_info["private_key"] = service_account_info["private_key"].replace("\\n", "\n")
                        
                    print("DEBUG: Successfully parsed Base64", flush=True)
                except Exception as e:
                    print(f"Failed to initialize from Base64 env var: {e}", flush=True)

        # 3. ファイルから認証（ローカル開発用）
        if not service_account_info:
            service_account_file = CONFIG_DIR / "service_account.json"
            if service_account_file.exists():
                try:
                    print(f"DEBUG: Found service_account_file at {service_account_file}", flush=True)
                    # ファイルから直接読み込む場合も新しいライブラリを使用
                    credentials = service_account.Credentials.from_service_account_file(
                        str(service_account_file), scopes=SCOPES
                    )
                    self.client = gspread.authorize(credentials)
                    print("Google Sheets client initialized successfully (file-based)", flush=True)
                    return
                except Exception as e:
                    print(f"Failed to load from file: {e}", flush=True)

        # 認証処理（環境変数からのJSON）
        if service_account_info:
            try:
                print(f"DEBUG: Attempting auth for: {service_account_info.get('client_email')}", flush=True)
                
                # 新しいライブラリ google.oauth2 を使用
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=SCOPES
                )
                self.client = gspread.authorize(credentials)
                print("Google Sheets client initialized successfully (dict-based)", flush=True)
                return

            except Exception as e:
                print(f"ERROR: Auth failed: {e}", flush=True)
                import traceback
                traceback.print_exc()
                self.client = None
        else:
            print("No service account configuration found")
            self.client = None


    def _load_mappings(self):
        """マッピングファイルを読み込み"""
        print(f"DEBUG: Looking for mapping file at: {MAPPING_FILE}", flush=True)
        print(f"DEBUG: MAPPING_FILE exists: {MAPPING_FILE.exists()}", flush=True)
        if MAPPING_FILE.exists():
            try:
                mapping_text = MAPPING_FILE.read_text(encoding='utf-8')
                self.mapping_dict = self._parse_mapping(mapping_text)
                print(f"DEBUG: Loaded mapping.txt with {len(self.mapping_dict)} keys", flush=True)
            except Exception as e:
                print(f"Failed to load mapping.txt: {e}", flush=True)
        else:
            print("DEBUG: mapping.txt NOT FOUND", flush=True)
        
        if MAPPING2_FILE.exists():
            try:
                mapping_text = MAPPING2_FILE.read_text(encoding='utf-8')
                self.mapping2_dict = self._parse_mapping(mapping_text)
            except Exception as e:
                print(f"Failed to load mapping2.txt: {e}")
    
    def _parse_mapping(self, mapping_text: str) -> Dict[str, Dict[str, Any]]:
        """
        マッピング定義テキストを解析し、辞書形式に変換する
        """
        mapping_dict = {}
        lines = mapping_text.strip().split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # 空行やセパレータはスキップ
            if not line or line.startswith('-'):
                i += 1
                continue
            
            # 項目名：セル番地 の形式を解析
            if '：' in line:
                parts = line.split('：')
                if len(parts) == 2:
                    item_name = parts[0].strip()
                    cell_and_options = parts[1].strip()
                    
                    # セル番地と選択肢を分離
                    cell_match = re.match(r'^([A-Z]+\d+)', cell_and_options)
                    if cell_match:
                        cell = cell_match.group(1)
                        options = []
                        
                        # 選択肢の解析（同じ行にある場合）
                        options_match = re.search(r'（(.+?)）', cell_and_options)
                        if options_match:
                            options_str = options_match.group(1)
                            options = [opt.strip() for opt in options_str.split('、')]
                        
                        # 次の行に選択肢がある場合もチェック
                        if i + 1 < len(lines):
                            next_line = lines[i + 1].strip()
                            if next_line.startswith('（') and next_line.endswith('）'):
                                options_str = next_line[1:-1]
                                options = [opt.strip() for opt in options_str.split('、')]
                                i += 1
                        
                        mapping_dict[item_name] = {
                            "cell": cell,
                            "options": options
                        }
            
            i += 1
        
        return mapping_dict
    
    def _flatten_data(self, data: Dict[str, Any], prefix: str = "") -> Dict[str, str]:
        """
        ネストされた辞書をフラットに変換
        例: {"基本情報": {"氏名": "田中"}} -> {"氏名": "田中"}
        """
        flat = {}
        for key, value in data.items():
            if isinstance(value, dict):
                # ネストされた辞書は再帰的に処理
                nested = self._flatten_data(value, f"{prefix}{key}_")
                flat.update(nested)
            else:
                # 値をフラットに追加（キーの最後の部分を使用）
                flat_key = key
                flat[flat_key] = str(value) if value else ""
        return flat
    
    def write_data(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        data: Dict[str, Any],
        mapping_type: str = "assessment"
    ) -> int:
        """
        マッピング定義に基づいてスプレッドシートにデータを書き込み
        """
        print(f"DEBUG: write_data called with spreadsheet_id={spreadsheet_id}", flush=True)
        print(f"DEBUG: client initialized: {self.client is not None}", flush=True)
        
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        # マッピング辞書を選択
        mapping = self.mapping_dict if mapping_type == "assessment" else self.mapping2_dict
        print(f"DEBUG: mapping_type={mapping_type}, mapping loaded: {mapping is not None}", flush=True)
        if not mapping:
            raise ValueError(f"Mapping not loaded for type: {mapping_type}")
        
        print(f"DEBUG: Opening spreadsheet...", flush=True)
        try:
            spreadsheet = self.client.open_by_key(spreadsheet_id)
            print(f"DEBUG: Spreadsheet opened successfully", flush=True)
        except Exception as e:
            print(f"ERROR: Failed to open spreadsheet: {type(e).__name__}: {e}", flush=True)
            raise
        
        # シート名が指定されていない場合は最初のシートを使用
        if sheet_name:
            worksheet = spreadsheet.worksheet(sheet_name)
        else:
            worksheet = spreadsheet.sheet1
        
        # データをフラット化
        flat_data = self._flatten_data(data)
        print(f"DEBUG: Flattened data keys: {list(flat_data.keys())}", flush=True)
        print(f"DEBUG: Mapping keys (first 10): {list(mapping.keys())[:10]}", flush=True)
        
        # バッチ更新用のリスト
        cells_to_update = []
        written_count = 0
        
        # マッピングに基づいてセルを更新
        for item_name, mapping_info in mapping.items():
            cell = mapping_info.get("cell")
            if not cell:
                continue
            
            # データから値を取得（完全一致または部分一致）
            value = None
            if item_name in flat_data:
                value = flat_data[item_name]
            else:
                # 部分一致を試みる
                for data_key, data_value in flat_data.items():
                    if item_name in data_key or data_key in item_name:
                        value = data_value
                        break
            
            if value and value != "（空白）":
                cells_to_update.append({
                    "cell": cell,
                    "value": value
                })
                written_count += 1
        
        # バッチ更新（care-dx-appと同じ効率的な方式）
        print(f"DEBUG: Cells to update: {len(cells_to_update)}", flush=True)
        if cells_to_update:
            print(f"DEBUG: First 5 cells: {cells_to_update[:5]}", flush=True)
            try:
                # バッチ更新用のデータ形式に変換
                updates = [
                    {'range': cell_data["cell"], 'values': [[cell_data["value"]]]}
                    for cell_data in cells_to_update
                ]
                worksheet.batch_update(updates)
                print(f"DEBUG: Batch updated {len(updates)} cells successfully", flush=True)
            except Exception as e:
                print(f"ERROR: Batch update failed: {e}", flush=True)
                # フォールバック: 1セルずつ更新
                for cell_data in cells_to_update:
                    try:
                        worksheet.update_acell(cell_data["cell"], cell_data["value"])
                    except Exception as e2:
                        print(f"Failed to update cell {cell_data['cell']}: {e2}", flush=True)
        else:
            print("DEBUG: No cells to update - mapping did not match any data fields", flush=True)
        
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
        
        if sheet_name:
            worksheet = spreadsheet.worksheet(sheet_name)
        else:
            worksheet = spreadsheet.sheet1
        
        if range_str:
            return worksheet.get(range_str)
        else:
            return worksheet.get_all_values()
    
    def get_sheet_names(self, spreadsheet_id: str) -> List[str]:
        """
        スプレッドシートのシート名一覧を取得
        """
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        spreadsheet = self.client.open_by_key(spreadsheet_id)
        return [ws.title for ws in spreadsheet.worksheets()]

    def write_service_meeting_to_row(
        self,
        spreadsheet_id: str,
        data_dict: Dict[str, Any],
        sheet_name: str = "貼り付け用"
    ) -> Dict[str, Any]:
        """
        サービス担当者会議のデータを行追加で書き込み（care-dx-app互換）
        - 1行目のヘッダーを読み取り、データキーとマッチング
        - 最終行の次に新しい行を追加
        """
        print(f"DEBUG: write_service_meeting_to_row called", flush=True)
        
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        try:
            spreadsheet = self.client.open_by_key(spreadsheet_id)
            
            try:
                worksheet = spreadsheet.worksheet(sheet_name)
            except:
                # シートがなければ作成
                worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=100, cols=20)
                print(f"DEBUG: Created new worksheet: {sheet_name}", flush=True)
            
            # 1行目のヘッダーを取得
            headers = worksheet.row_values(1)
            if not headers:
                print("DEBUG: No headers found, cannot write", flush=True)
                return {"success": False, "error": "ヘッダーがありません", "write_count": 0}
            
            print(f"DEBUG: Headers found: {headers}", flush=True)
            
            # データをフラット化
            flat_data = self._flatten_data(data_dict)
            
            # 書き込みデータの準備（ヘッダー順に並べる）
            row_data = []
            for header in headers:
                val = ""
                # データのキーとヘッダーを柔軟にマッチング（完全一致または部分一致）
                for key, value in flat_data.items():
                    if key in header or header in key:
                        # リストの場合は改行区切りの文字列に変換
                        if isinstance(value, list):
                            val = "\n".join([str(item) for item in value])
                        else:
                            val = str(value) if value else ""
                        break
                row_data.append(val)
            
            # 最終行の次の行に追加
            worksheet.append_row(row_data)
            print(f"DEBUG: Appended row with {len(row_data)} columns", flush=True)
            
            return {
                "success": True,
                "sheet_url": spreadsheet.url,
                "write_count": 1
            }
            
        except Exception as e:
            print(f"ERROR: write_service_meeting_to_row failed: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e), "write_count": 0}

    def write_management_meeting_to_row(
        self,
        spreadsheet_id: str,
        data: Dict[str, Any],
        date_str: str = "",
        time_str: str = "",
        place: str = "",
        participants: str = "",
        sheet_name: str = "貼り付け用"
    ) -> Dict[str, Any]:
        """
        運営会議のデータを行追加で書き込み（care-dx-app互換）
        - ヘッダー: 日時, 開催場所, 参加者, 議題項目, 24時間対応, 共有事項
        - 最終行の次に新しい行を追加
        """
        print(f"DEBUG: write_management_meeting_to_row called", flush=True)
        
        if not self.client:
            raise ValueError("Google Sheets client not initialized")
        
        try:
            spreadsheet = self.client.open_by_key(spreadsheet_id)
            
            try:
                worksheet = spreadsheet.worksheet(sheet_name)
            except:
                # シートがなければ作成してヘッダーを追加
                worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=100, cols=20)
                worksheet.append_row(["日時", "開催場所", "参加者", "議題項目", "24時間対応", "共有事項"])
                print(f"DEBUG: Created new worksheet with headers: {sheet_name}", flush=True)
            
            # ヘッダーを読み込む
            headers = worksheet.row_values(1)
            if not headers:
                # ヘッダーがない場合は作成して再取得
                headers = ["日時", "開催場所", "参加者", "議題項目", "24時間対応", "共有事項"]
                worksheet.append_row(headers)
            
            print(f"DEBUG: Headers: {headers}", flush=True)
            
            # データの準備
            # 日時
            ui_dt = f"{date_str} {time_str}".strip()
            ai_dt = data.get("meeting_date", "")
            val_date = ui_dt if (date_str and time_str) else (ai_dt if ai_dt else ui_dt)
            
            # 参加者
            val_participants = participants if participants else data.get("participants", "")
            
            # 場所
            val_place = place if place else data.get("place", "")
            
            # その他
            val_agenda = data.get("agenda", "")
            val_24h = data.get("support_24h", "")
            val_sharing = data.get("sharing_matters", "")
            
            # 行データの構築（ヘッダーにマッチ）
            row_data = []
            for header in headers:
                h = header.strip()
                if "日時" in h:
                    row_data.append(val_date)
                elif "参加者" in h:
                    row_data.append(val_participants)
                elif "場所・共有" in h:
                    # 結合カラム
                    row_data.append(f"場所: {val_place}\n\n{val_sharing}")
                elif "場所" in h:
                    row_data.append(val_place)
                elif "共有" in h:
                    row_data.append(val_sharing)
                elif "議題" in h:
                    row_data.append(val_agenda)
                elif "24時間" in h:
                    row_data.append(val_24h)
                else:
                    row_data.append("")  # 不明なカラムは空
            
            # 追記実行
            worksheet.append_row(row_data)
            print(f"DEBUG: Appended management meeting row with {len(row_data)} columns", flush=True)
            
            return {
                "success": True,
                "sheet_url": spreadsheet.url,
                "write_count": 1
            }
            
        except Exception as e:
            print(f"ERROR: write_management_meeting_to_row failed: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e), "write_count": 0}

    def create_and_write_assessment(
        self,
        template_id: str,
        folder_id: str,
        data_dict: Dict[str, Any],
        sheet_name: str = "貼り付け用"
    ) -> Dict[str, Any]:
        """
        アセスメントシート用に新規スプレッドシートを作成して書き込む
        """
        print(f"DEBUG: create_and_write_assessment called", flush=True)
        from .drive_service import drive_service
        
        # 1. 新規スプレッドシート作成
        import datetime
        now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        # 名前を決定（利用者名があれば入れる）
        client_name = ""
        if "基本情報" in data_dict and "氏名" in data_dict["基本情報"]:
            client_name = data_dict["基本情報"]["氏名"]
        elif "氏名" in data_dict:
            client_name = data_dict["氏名"]
            
        new_filename = f"アセスメント_{client_name}_{now_str}" if client_name else f"アセスメント_{now_str}"
        
        new_id, new_url = drive_service.copy_spreadsheet(template_id, new_filename, folder_id)
        
        if not new_id:
            return {"success": False, "error": "スプレッドシートの作成に失敗しました"}
        
        # 2. データの書き込み
        try:
            write_count = self.write_data(
                spreadsheet_id=new_id,
                sheet_name=sheet_name,
                data=data_dict,
                mapping_type="assessment"
            )
            return {
                "success": True,
                "sheet_url": new_url,
                "write_count": write_count,
                "spreadsheet_id": new_id
            }
        except Exception as e:
            print(f"ERROR: Failed to write to new spreadsheet: {e}")
            return {"success": False, "error": f"シート作成は成功しましたが書き込みに失敗: {str(e)}", "sheet_url": new_url}
