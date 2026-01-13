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
SCOPES = [
    'https://spreadsheets.google.com/feeds',
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
        """Google Sheets APIクライアントを初期化（oauth2clientライブラリ使用 - care-dx-app互換）"""
        import base64
        import datetime
        
        # サーバー時刻のログ
        print(f"DEBUG: Server time: {datetime.datetime.now()}", flush=True)

        # 認証情報を保持する変数
        service_account_info = None

        # 1. Raw JSON文字列環境変数から認証（推奨）
        service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        
        if service_account_json:
            try:
                print("DEBUG: Found GOOGLE_SERVICE_ACCOUNT_JSON", flush=True)
                service_account_info = json.loads(service_account_json)
                print("DEBUG: Successfully parsed JSON", flush=True)
            except Exception as e:
                print(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: {e}", flush=True)

        # 2. Base64エンコードされた環境変数から認証（フォールバック）
        if not service_account_info:
            service_account_base64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_BASE64")
            if service_account_base64:
                try:
                    print("DEBUG: Found GOOGLE_SERVICE_ACCOUNT_BASE64", flush=True)
                    service_account_base64 = service_account_base64.strip()
                    decoded_bytes = base64.b64decode(service_account_base64)
                    service_account_info = json.loads(decoded_bytes.decode('utf-8'))
                    print("DEBUG: Successfully parsed Base64", flush=True)
                except Exception as e:
                    print(f"Failed to initialize from Base64 env var: {e}", flush=True)

        # 3. ファイルから認証（ローカル開発用）
        if not service_account_info:
            service_account_file = CONFIG_DIR / "service_account.json"
            if service_account_file.exists():
                try:
                    print(f"DEBUG: Found service_account_file at {service_account_file}", flush=True)
                    with open(service_account_file, 'r', encoding='utf-8') as f:
                         service_account_info = json.load(f)
                except Exception as e:
                    print(f"Failed to load from file: {e}", flush=True)

        # 認証処理
        if service_account_info:
            # 診断ログ出力（秘密鍵の中身は出さずに、形式的な健全性をチェック）
            self._diagnose_credentials(service_account_info)

            try:
                # private_keyの修復・正規化ロジック
                if "private_key" in service_account_info:
                    pk = service_account_info["private_key"]
                    
                    # 1. \n を実際の改行に置換
                    if "\\n" in pk:
                        pk = pk.replace("\\n", "\n")
                    
                    # 2. ヘッダー/フッター周りの空白不足を修正
                    if "-----BEGIN PRIVATE KEY-----" in pk and "-----BEGIN PRIVATE KEY-----\n" not in pk:
                         pk = pk.replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
                    
                    if "-----END PRIVATE KEY-----" in pk and "\n-----END PRIVATE KEY-----" not in pk:
                         pk = pk.replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
                    
                    # 3. 秘密鍵本体のスペースを改行に置換
                    import re
                    match = re.search(r"-----BEGIN PRIVATE KEY-----\n(.*?)\n-----END PRIVATE KEY-----", pk, re.DOTALL)
                    if match:
                        body = match.group(1)
                        if " " in body and body.count("\n") < 5:
                             print("DEBUG: Detected spaces in private key body, attempting to fix...", flush=True)
                             new_body = body.replace(" ", "\n")
                             pk = pk.replace(body, new_body)
                        # 4. 改行が全くない場合（1行になっている場合）、64文字ごとに改行を挿入
                        elif "\n" not in body:
                             print("DEBUG: Detected single-line private key body, fixing...", flush=True)
                             new_body = '\n'.join(body[i:i+64] for i in range(0, len(body), 64))
                             pk = pk.replace(body, new_body)
                             print("DEBUG: Applied 64-char line wrapping fix", flush=True)

                    service_account_info["private_key"] = pk
                    
                    # 修復後の診断
                    print("DEBUG: --- Post-Repair Diagnosis ---", flush=True)
                    self._diagnose_credentials(service_account_info)

                print(f"DEBUG: Attempting auth for: {service_account_info.get('client_email')}", flush=True)
                
                # oauth2clientを使用（care-dx-appと同じ）
                # from_json_keyfile_dict ではなく、ファイル経由にして完全に同じ挙動にする
                import tempfile
                
                # 一時ファイルにJSONを書き出す
                # ※Railwayはephemeral filesystemなので一時ファイルは作成可能
                try:
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as temp_file:
                        json.dump(service_account_info, temp_file)
                        temp_file_path = temp_file.name
                    
                    print(f"DEBUG: Wrote credentials to temp file: {temp_file_path}", flush=True)
                    
                    credentials = ServiceAccountCredentials.from_json_keyfile_name(
                        temp_file_path, SCOPES
                    )
                    
                    # 使用後は消すのが理想だが、プロセス中で再利用されるなら消さない方が無難か
                    # Security warning: temp file persists until container restart
                    # os.unlink(temp_file_path) 
                    
                except Exception as file_error:
                    print(f"ERROR: Failed to create temp credential file: {file_error}", flush=True)
                    # フォールバック
                    credentials = ServiceAccountCredentials.from_json_keyfile_dict(
                        service_account_info, SCOPES
                    )

                self.client = gspread.authorize(credentials)
                print("Google Sheets client initialized successfully (oauth2client + file-based)", flush=True)
                return

            except Exception as e:
                print(f"ERROR: Auth failed: {e}", flush=True)
                import traceback
                traceback.print_exc()
                self.client = None
        else:
            print("No service account configuration found")
            self.client = None

    def _diagnose_credentials(self, info: Dict[str, Any]):
        """認証情報の健全性を診断してログに出力（秘密情報はマスキング）"""
        print("DEBUG: === Credential Diagnosis ===", flush=True)
        try:
            import hashlib
            import rsa
            import pyasn1
            print(f"DEBUG: Library versions: gspread={gspread.__version__}, rsa={rsa.__version__}, pyasn1={pyasn1.__version__}", flush=True)
            
            # Email Check
            email = info.get("client_email", "MISSING")
            print(f"DEBUG: client_email: {email}", flush=True)
            
            # Project ID
            project_id = info.get("project_id", "MISSING")
            print(f"DEBUG: project_id: {project_id}", flush=True)
            
            # Private Key Analysis
            pk = info.get("private_key", "")
            if not pk:
                print("DEBUG: private_key: MISSING or EMPTY", flush=True)
                return
            
            print(f"DEBUG: private_key length: {len(pk)} chars", flush=True)
            
            # SHA256 Hash (to compare with local working key)
            pk_hash = hashlib.sha256(pk.encode('utf-8')).hexdigest()
            print(f"DEBUG: private_key SHA256: {pk_hash}", flush=True)
            
            # Structure Checks
            has_begin = "-----BEGIN PRIVATE KEY-----" in pk
            has_end = "-----END PRIVATE KEY-----" in pk
            print(f"DEBUG: Header present: {has_begin}", flush=True)
            print(f"DEBUG: Footer present: {has_end}", flush=True)
            
            # Content formatting
            line_count = pk.count('\n')
            space_count = pk.count(' ')
            print(f"DEBUG: Newline count: {line_count}", flush=True)
            print(f"DEBUG: Space count: {space_count}", flush=True)
            
            # Body Analysis (between header and footer)
            import re
            match = re.search(r"-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----", pk, re.DOTALL)
            if match:
                body = match.group(1)
                print(f"DEBUG: Key body length: {len(body)} chars", flush=True)
                print(f"DEBUG: First 20 chars of raw body: {repr(body[:20])}", flush=True)
                print(f"DEBUG: Last 20 chars of raw body: {repr(body[-20:])}", flush=True)
            else:
                print("DEBUG: Could not extract key body via Regex", flush=True)

        except Exception as e:
            print(f"DEBUG: Diagnosis failed: {e}", flush=True)
        print("DEBUG: ============================", flush=True)

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
        print("DEBUG: Flattening data...", flush=True)
        try:
            flat_data = self._flatten_data(data)
            print(f"DEBUG: Flattened data keys: {list(flat_data.keys())}", flush=True)
        except Exception as e:
            print(f"ERROR: Failed to flatten data: {e}", flush=True)
            raise

        print(f"DEBUG: Mapping keys (first 10): {list(mapping.keys())[:10]}", flush=True)
        
        # バッチ更新用のリスト
        cells_to_update = []
        written_count = 0
        
        # マッピングに基づいてセルを更新
        try:
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
            
            # 更新実行
            print(f"DEBUG: Cells to update: {len(cells_to_update)}", flush=True)
            if cells_to_update:
                print(f"DEBUG: First 5 cells: {cells_to_update[:5]}", flush=True)
                for cell_data in cells_to_update:
                    try:
                        print(f"DEBUG: Updating cell {cell_data['cell']} with value: {cell_data['value']}", flush=True)
                        worksheet.update_acell(cell_data["cell"], cell_data["value"])
                        print(f"DEBUG: Updated cell {cell_data['cell']}", flush=True)
                    except Exception as e:
                        print(f"ERROR: Failed to update cell {cell_data['cell']}: {e}", flush=True)
                        raise # 再送してエラー詳細をキャッチさせる
            else:
                print("DEBUG: No cells to update - mapping did not match any data fields", flush=True)
                
        except Exception as e:
            print(f"ERROR: Error during cell update loop: {e}", flush=True)
            import traceback
            traceback.print_exc()
            raise

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
