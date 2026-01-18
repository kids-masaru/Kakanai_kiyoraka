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
        """マッピングファイルを読み込み（MappingParserを使用）"""
        try:
            from utils.mapping_parser import MappingParser
        except ImportError:
            from ..utils.mapping_parser import MappingParser
        
        print(f"DEBUG: Looking for mapping file at: {MAPPING_FILE}", flush=True)
        if MAPPING_FILE.exists():
            try:
                mapping_text = MAPPING_FILE.read_text(encoding='utf-8')
                self.mapping_dict = MappingParser.parse_mapping(mapping_text)
                print(f"DEBUG: Loaded mapping.txt with {len(self.mapping_dict)} keys", flush=True)
            except Exception as e:
                print(f"Failed to load mapping.txt: {e}", flush=True)
        else:
            print("DEBUG: mapping.txt NOT FOUND", flush=True)
        
        if MAPPING2_FILE.exists():
            try:
                mapping_text = MAPPING2_FILE.read_text(encoding='utf-8')
                self.mapping2_dict = MappingParser.parse_mapping(mapping_text)
            except Exception as e:
                print(f"Failed to load mapping2.txt: {e}")
    
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
            # 日時
            raw_date = date_str if date_str else data.get("meeting_date", "")
            val_date = raw_date
            
            # 日付フォーマットの統一 (YYYY年MM月DD日)
            if raw_date:
                import datetime
                try:
                    # 既にYYYY-MM-DD形式の場合
                    if "-" in raw_date:
                         # 時間が含まれている場合を除去 ("2026-01-17 10:00" -> "2026-01-17")
                         clean_date = raw_date.split(" ")[0]
                         dt = datetime.datetime.strptime(clean_date, "%Y-%m-%d")
                         val_date = dt.strftime("%Y年%m月%d日")
                    # スラッシュ区切りの場合
                    elif "/" in raw_date:
                         clean_date = raw_date.split(" ")[0]
                         dt = datetime.datetime.strptime(clean_date, "%Y/%m/%d")
                         val_date = dt.strftime("%Y年%m月%d日")
                except Exception as e:
                    print(f"Date formatting failed for {raw_date}: {e}")
                    # 変換失敗時はそのまま
            
            # 時間があれば後ろに付与する？画像ではA列は日付だけに見えるが、
            # 行35は "2026-01-17 10:0" となっているので時間が混ざっている。
            # 既存行(23-34)は日付のみ "2026年01月12日" なので、日付のみにするのが正解。
            
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
        sheet_name: str = None
    ) -> Dict[str, Any]:
        """
        アセスメントシート用に新規スプレッドシートを作成して書き込む
        Care-DX-App同様、2段階書き込みを行う
        Step 1: 1枚目のシート（基本情報）に mapping.txt で書き込み
        Step 2: 「２．ｱｾｽﾒﾝﾄｼｰﾄ」に mapping2.txt で書き込み
        """
        print(f"DEBUG: create_and_write_assessment called", flush=True)
        from .drive_service import drive_service
        
        # 1. 新規スプレッドシート作成
        import datetime
        date_str = datetime.datetime.now().strftime("%Y%m%d")
        
        # 名前を決定（利用者名があれば入れる）
        client_name = "名称未設定"
        
        # 優先順位: 利用者情報_氏名_漢字 > 氏名 > 基本情報.氏名
        if "利用者情報_氏名_漢字" in data_dict and data_dict["利用者情報_氏名_漢字"]:
            client_name = data_dict["利用者情報_氏名_漢字"]
        elif "氏名" in data_dict and data_dict["氏名"]:
            client_name = data_dict["氏名"]
        elif "基本情報" in data_dict and isinstance(data_dict["基本情報"], dict) and "氏名" in data_dict["基本情報"]:
            client_name = data_dict["基本情報"]["氏名"]
            
        # 空白除去
        client_name = client_name.replace(" ", "").replace("　", "").strip()
        if not client_name:
            client_name = "名称未設定"
            
        new_filename = f"{client_name}_{date_str}_アセスメントシート"
        
        new_id, new_url = drive_service.copy_spreadsheet(template_id, new_filename, folder_id)
        
        if not new_id:
            return {"success": False, "error": "スプレッドシートの作成に失敗しました"}
        
        # 2. データの書き込み
        try:
            total_write_count = 0
            
            # Step 1: 1枚目のシート（基本情報）
            # sheet_nameが指定されていなければNone（先頭シート）
            print("DEBUG: Writing Step 1 (Basic Info)...", flush=True)
            count1 = self.write_data(
                spreadsheet_id=new_id,
                sheet_name=sheet_name, # Noneなら先頭シート
                data=data_dict,
                mapping_type="assessment" # mapping.txt使用
            )
            total_write_count += count1
            
            # Step 2: 2枚目のシート（詳細情報）
            # 常に「２．ｱｾｽﾒﾝﾄｼｰﾄ」へ書き込む
            print("DEBUG: Writing Step 2 (Assessment Detail)...", flush=True)
            try:
                count2 = self.write_data(
                    spreadsheet_id=new_id,
                    sheet_name="２．ｱｾｽﾒﾝﾄｼｰﾄ",
                    data=data_dict,
                    mapping_type="assessment_detail" # mapping != "assessment" なので mapping2.txt使用
                )
                total_write_count += count2
            except Exception as e2:
                print(f"WARNING: Step 2 writing failed: {e2}", flush=True)
                # Step 2の失敗は致命的エラーにしない（Step 1が成功していればファイルはできている）

            return {
                "success": True,
                "sheet_url": new_url,
                "write_count": total_write_count,
                "spreadsheet_id": new_id
            }
        except Exception as e:
            print(f"ERROR: Failed to write to new spreadsheet: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": f"シート作成は成功しましたが書き込みに失敗: {str(e)}", "sheet_url": new_url}

    def _to_japanese_calendar(self, date_obj) -> str:
        """西暦対応日付オブジェクトを和暦文字列に変換"""
        if date_obj.year < 2019:
            return date_obj.strftime("%Y年%m月%d日") # 平成以前は簡易対応
        
        reiwa_year = date_obj.year - 2018
        # 令和1年は令和元年と表記するのが一般的だが、システム的には1年でも通じる。ユーザー要望は「令和7年」など。
        # 曜日
        weekdays = ["月", "火", "水", "木", "金", "土", "日"]
        wd = weekdays[date_obj.weekday()]
        
        return f"令和{reiwa_year}年{date_obj.month}月{date_obj.day}日（{wd}）"

    def create_and_write_management_meeting(
        self,
        template_id: str,
        folder_id: str,
        data: Dict[str, Any],
        date_str: str,
        time_str: str,
        place: str,
        participants: str
    ) -> Dict[str, Any]:
        """
        運営会議議事録を新規作成して直接書き込み（GAS代替）
        方針:
        1. 空のシート作成
        2. 原本シートのみコピー
        3. 値書き込み（数式上書き）
        """
        print(f"DEBUG: create_and_write_management_meeting called", flush=True)
        from .drive_service import drive_service
        import datetime
        
        
        # 0. ターゲットフォルダID（ユーザー指定の固定ID）
        target_folder_id = "1dAzH53gs3lDqlJ4TrV7CxtnvDhVPFVye"
        
        # 1. ファイル名・日付の準備
        if date_str:
            try:
                dt_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            except:
                dt_obj = datetime.datetime.now()
        else:
            dt_obj = datetime.datetime.now()
            date_str = dt_obj.strftime("%Y-%m-%d")
            
        file_date_str = date_str.replace("-", "").replace("/", "")
        
        # タイトル: YYYYMMDD_運営会議
        new_filename = f"{file_date_str}_運営会議"
        
        # 2. 空のスプレッドシート作成
        print(f"DEBUG: Creating empty spreadsheet '{new_filename}' in folder {target_folder_id}", flush=True)
        new_id, new_url = drive_service.create_empty_spreadsheet(new_filename, target_folder_id)
        
        if not new_id:
            return {"success": False, "error": "スプレッドシートの作成に失敗しました"}
            
        try:
            # クライアント初期化チェック
            if not self.client:
                raise ValueError("Google Sheets client not initialized")
            
            # --- シートコピー処理 ---
            
            # Master(Template)を開く
            master_ss = self.client.open_by_key(template_id)
            try:
                template_sheet = master_ss.worksheet("原本")
            except:
                print("Error: '原本' sheet not found in master spreadsheet.")
                return {"success": False, "error": "テンプレートに「原本」シートが見つかりません"}
            
            # 新しいスプレッドシートを開く
            new_ss = self.client.open_by_key(new_id)
            
            # 原本シートを新しいスプレッドシートにコピー
            print("DEBUG: Copying '原本' sheet to new spreadsheet...", flush=True)
            copied_sheet_meta = template_sheet.copy_to(new_id)
            # copy_to はプロパティを返すが、gspreadのバージョンによっては辞書か何か。
            # いずれにせよ、コピーされたシートは「原本 のコピー」などの名前になるはず。
            
            # 新しいスプレッドシートのシート一覧を取得して、コピーされたシートを特定
            # 通常、末尾に追加される
            all_sheets = new_ss.worksheets()
            copied_sheet = all_sheets[-1] # 最後に追加されたシートと仮定
            
            # コピーしたシートの名前を変更 (YYYYMMDD_運営会議)
            # GASではシート名もファイル名と同じにしていた
            final_sheet_name = f"{file_date_str}_運営会議"
            copied_sheet.update_title(final_sheet_name)
            
            # デフォルトの「シート1」を削除 (通常は index 0)
            default_sheet = all_sheets[0]
            if default_sheet.title != final_sheet_name: # 念のため自分を消さないように
                new_ss.del_worksheet(default_sheet)
                
            worksheet = copied_sheet
                
            # --- 書き込みデータの準備 (数式上書き) ---
            
            # 1. 日付・場所
            # 日付フォーマット: 令和7年10月25日（木） 8時30分〜9時15分
            jp_date_str = self._to_japanese_calendar(dt_obj)
            full_date_str = f"{jp_date_str} {time_str}".strip()
            
            # B3: 日付 (ユーザーフィードバックによりC3から変更)
            mtg_date_val = full_date_str
            # B4: 場所 (ユーザーフィードバックによりC4から変更)
            mtg_place_val = place
            
            # 2. 参加者判定 (A7:E7のヘッダーを読み取ってA9:E9に〇✕)
            header_range = worksheet.range('A7:H7')
            headers = [c.value for c in header_range]
            
            attendance_updates = []
            # 参加者文字列をリスト化 (カンマ区切り)
            attendees_str = participants.replace("、", ",").replace("　", "")
            attendee_list = [a.strip() for a in attendees_str.split(",") if a.strip()]
            
            for i, name in enumerate(headers):
                if not name: continue
                # マッチングロジック修正: 
                # ヘッダー名(例:武島由幸)の中に、入力された名前(例:武島)が含まれているか
                # または逆 (入力:武島由幸, ヘッダー:武島) も考慮
                is_attending = False
                for att in attendee_list:
                    if att in name or name in att:
                        is_attending = True
                        break
                
                if is_attending:
                    attendance_updates.append({'row': 9, 'col': 1 + i, 'val': "〇"})
                else:
                    attendance_updates.append({'row': 9, 'col': 1 + i, 'val': "✕"})
            
            # 3. 議題チェックボックス (A13:A19 -> I13:I19)
            agenda_range = worksheet.range('A13:A19')
            agenda_texts = [c.value for c in agenda_range]
            
            agenda_updates = []
            ai_agenda = data.get("agenda", "")
            
            for i, text in enumerate(agenda_texts):
                if not text: continue
                clean_text = text.strip()
                search_key = clean_text + "●"
                if search_key in ai_agenda:
                    agenda_updates.append({'row': 13 + i, 'col': 9, 'val': "☑"})
                else:
                    agenda_updates.append({'row': 13 + i, 'col': 9, 'val': "□"})

            # 4. 24時間対応 (A23:C27)
            # 全5行 (23-27) を必ず上書きして、テンプレートの数式を消す
            support_updates = []
            raw_24h = data.get("support_24h", "")
            circles = ["①", "②", "③", "④", "⑤"]
            
            # データ解析用リスト（最大5件）
            parsed_entries = []
            
            has_circles = any(c in raw_24h for c in circles)
            if has_circles:
                 for mark in circles:
                    if mark in raw_24h:
                        start = raw_24h.find(mark)
                        end = raw_24h.find("\n", start)
                        if end == -1: end = len(raw_24h)
                        line_text = raw_24h[start:end].replace(mark, "").strip()
                        if line_text:
                            # 分割トライ
                            parts = line_text.split(" ", 2)
                            if len(parts) >= 3:
                                parsed_entries.append([parts[0], parts[1], parts[2]])
                            elif len(parts) == 2:
                                parsed_entries.append([parts[0], "", parts[1]])
                            else:
                                parsed_entries.append(["", "", line_text])
            else:
                # 丸数字なし。改行で分割
                lines = raw_24h.split("\n")
                for line in lines:
                    if not line.strip(): continue
                    parts = line.split(" ", 2)
                    if len(parts) >= 3:
                        parsed_entries.append([parts[0], parts[1], parts[2]])
                    elif len(parts) == 2:
                         parsed_entries.append([parts[0], "", parts[1]])
                    else:
                         parsed_entries.append(["", "", line])
            
            # 5行分ループして書き込みデータを作成（足りない行は空文字で埋める）
            for i in range(5):
                target_row = 23 + i
                entry = parsed_entries[i] if i < len(parsed_entries) else ["", "", ""]
                
                # A列: 日時
                support_updates.append({'row': target_row, 'col': 1, 'val': entry[0]})
                # B列: 対応者
                support_updates.append({'row': target_row, 'col': 2, 'val': entry[1]})
                # C列: 内容
                support_updates.append({'row': target_row, 'col': 3, 'val': entry[2]})

            # 5. 共有事項 (A29)
            shared_info = data.get("sharing_matters", "")
            
            # --- Batch Update ---
            updates_batch = []
            
            # B3: 日付 (Formula Overwrite)
            updates_batch.append({'range': 'B3', 'values': [[mtg_date_val]]})
            # B4: 場所 (Formula Overwrite)
            updates_batch.append({'range': 'B4', 'values': [[mtg_place_val]]})
            # A29: 共有事項
            updates_batch.append({'range': 'A29', 'values': [[shared_info]]})
            
            # K2: 不要セル消去
            updates_batch.append({'range': 'K2', 'values': [[""]]})
            
            for item in attendance_updates:
                cell_addr = gspread.utils.rowcol_to_a1(item['row'], item['col'])
                updates_batch.append({'range': cell_addr, 'values': [[item['val']]]})
            for item in agenda_updates:
                cell_addr = gspread.utils.rowcol_to_a1(item['row'], item['col'])
                updates_batch.append({'range': cell_addr, 'values': [[item['val']]]})
            for item in support_updates:
                cell_addr = gspread.utils.rowcol_to_a1(item['row'], item['col'])
                updates_batch.append({'range': cell_addr, 'values': [[item['val']]]})

            # 値の書き込み実行
            worksheet.batch_update(updates_batch)
            
            # --- 構造データの修正 (プルダウン解除など) ---
            # B3セルのプルダウン(入力規則)を解除する
            # B3 = Row 2, Col 1 (0-indexed)
            try:
                requests = [
                    {
                        "setDataValidation": {
                            "range": {
                                "sheetId": worksheet.id,
                                "startRowIndex": 2,
                                "endRowIndex": 3,
                                "startColumnIndex": 1,
                                "endColumnIndex": 2
                            },
                            "rule": None # ルールをNoneにすると解除される
                        }
                    }
                ]
                new_ss.batch_update({"requests": requests})
                print(f"DEBUG: cleared data validation for B3", flush=True)
            except Exception as e_valid:
                print(f"WARNING: Failed to clear data validation: {e_valid}", flush=True)

            print(f"DEBUG: Successfully populated management meeting sheet: {new_filename}", flush=True)

            return {
                "success": True,
                "sheet_url": new_url,
                "write_count": len(updates_batch),
                "spreadsheet_id": new_id
            }

        except Exception as e:
            print(f"ERROR: Failed to write to management meeting sheet: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": f"シート作成完了、書き込み失敗: {str(e)}", "sheet_url": new_url}

    def create_and_write_service_meeting(
        self,
        template_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        サービス担当者会議議事録を新規作成して直接書き込み
        方針:
        1. 指定フォルダに空のシート作成
        2. 原本「４表（会議録）」のみコピー
        3. 値書き込み（数式上書き・プルダウン解除）
        """
        print(f"DEBUG: create_and_write_service_meeting called", flush=True)
        from .drive_service import drive_service
        import datetime
        import gspread.utils
        
        # 0. ターゲットフォルダID（ユーザー指定の固定ID）
        target_folder_id = "1nQ2RhVQPaKCnG6L04yP6rQdcheT230_C"
        
        # 1. データ準備 extraction
        # 日付
        raw_date = data.get("開催日", "")
        # 日付オブジェクト変換 (YYYYMMDD用)
        dt_obj = datetime.datetime.now()
        if raw_date:
            try:
                # "2026年01月14日" or "2026-01-14" format handling
                clean_date = raw_date.replace("年", "-").replace("月", "-").replace("日", "")
                # 時間が入っている場合がある "2026-01-14 10:00"
                clean_date = clean_date.split(" ")[0]
                
                if clean_date.count("-") == 2:
                     dt_obj = datetime.datetime.strptime(clean_date, "%Y-%m-%d")
            except:
                pass
        
        file_date_str = dt_obj.strftime("%Y%m%d")
        
        # 利用者名
        user_name = data.get("利用者名", "")
        name_suffix = f"【{user_name}】" if user_name else ""
        
        # ファイル名: YYYYMMDD_会議録【利用者名】
        new_filename = f"{file_date_str}_会議録{name_suffix}"
        
        # 2. 空のスプレッドシート作成
        print(f"DEBUG: Creating empty spreadsheet '{new_filename}' in folder {target_folder_id}", flush=True)
        new_id, new_url = drive_service.create_empty_spreadsheet(new_filename, target_folder_id)
        
        if not new_id:
            return {"success": False, "error": "スプレッドシートの作成に失敗しました"}
            
        try:
            if not self.client:
                raise ValueError("Google Sheets client not initialized")
            
            # --- シートコピー処理 ---
            
            # Master(Template)を開く
            master_ss = self.client.open_by_key(template_id)
            try:
                template_sheet = master_ss.worksheet("４表（会議録）")
            except:
                print("Error: '４表（会議録）' sheet not found in master spreadsheet.")
                return {"success": False, "error": "テンプレートに「４表（会議録）」シートが見つかりません"}
            
            # 新しいスプレッドシートを開く
            new_ss = self.client.open_by_key(new_id)
            
            # テンプレートシートを新しいスプレッドシートにコピー
            print("DEBUG: Copying '４表（会議録）' sheet to new spreadsheet...", flush=True)
            template_sheet.copy_to(new_id)
            
            # 新しいスプレッドシートのシート一覧を取得 Refresh
            all_sheets = new_ss.worksheets()
            copied_sheet = all_sheets[-1] # 最後に追加されたシート
            
            # コピーしたシートの名前を変更 (YYYYMMDD_会議録...)
            final_sheet_name = f"{file_date_str}_会議録{name_suffix}"
            copied_sheet.update_title(final_sheet_name)
            
            # デフォルトの「シート1」を削除
            default_sheet = all_sheets[0]
            if default_sheet.title != final_sheet_name:
                new_ss.del_worksheet(default_sheet)
                
            worksheet = copied_sheet
            
            # --- 書き込みデータの準備 ---
            
            # 和暦変換 for G5, H5
            jp_date_str = self._to_japanese_calendar(dt_obj)
            
            # 各フィールドの値
            val_place = data.get("開催場所", "")
            val_time = data.get("開催時間", "")
            val_count = data.get("開催回数", "")
            val_staff = data.get("担当者名", "")
            val_user = data.get("利用者名", "")
            
            val_item = data.get("検討した項目", "")
            val_content = data.get("検討内容", "")
            val_conclusion = data.get("結論", "")
            
            updates = []
            
            # 1. G5, H5: 日付 (和暦)
            updates.append({'range': 'G5', 'values': [[jp_date_str]]})
            updates.append({'range': 'H5', 'values': [[jp_date_str]]})
            
            # 2. Z5: 開催場所
            updates.append({'range': 'Z5', 'values': [[val_place]]})
            
            # 3. AO5: 開催時間
            updates.append({'range': 'AO5', 'values': [[val_time]]})
            
            # 4. BG5: 開催回数
            updates.append({'range': 'BG5', 'values': [[val_count]]})
            
            # 5. BF4: 担当者名
            updates.append({'range': 'BF4', 'values': [[val_staff]]})
            
            # 6. E4: 利用者名
            updates.append({'range': 'E4', 'values': [[val_user]]})
            
            # 7. その他の内容 (H11, H14, H24)
            updates.append({'range': 'H11', 'values': [[val_item]]})
            updates.append({'range': 'H14', 'values': [[val_content]]})
            updates.append({'range': 'H24', 'values': [[val_conclusion]]})
            
            # Batch Update
            worksheet.batch_update(updates)
            
            # --- 入力規則(プルダウン)の解除 ---
            # G5, H5, Z5, AO5, BG5, BF4, E4
            ranges_to_clear_validation = ["G5", "H5", "Z5", "AO5", "BG5", "BF4", "E4"]
            
            requests = []
            
            for rng in ranges_to_clear_validation:
                grid_range = gspread.utils.a1_range_to_grid_range(rng, worksheet.id)
                request = {
                    "setDataValidation": {
                        "range": grid_range,
                        "rule": None # None to clear
                    }
                }
                requests.append(request)
            
            if requests:
                print("DEBUG: Clearing data validations...", flush=True)
                new_ss.batch_update({"requests": requests})

            print(f"DEBUG: Successfully populated service meeting sheet: {new_filename}", flush=True)
            
            return {
                "success": True,
                "sheet_url": new_url,
                "write_count": 1,
                "spreadsheet_id": new_id
            }
            
        except Exception as e:
            print(f"ERROR: create_and_write_service_meeting failed: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e), "sheet_url": new_url}
