"""
AI Service - Google Gemini統合
"""
import google.generativeai as genai
import json
import os
import io
import time
import re
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional
try:
    from utils.mapping_parser import MappingParser
except ImportError:
    # Fallback for different execution contexts
    from ..utils.mapping_parser import MappingParser

# マッピングファイルのパス
CONFIG_DIR = Path(__file__).parent.parent / "config"
MAPPING_FILE = CONFIG_DIR / "mapping.txt"
MAPPING2_FILE = CONFIG_DIR / "mapping2.txt"

class AIService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
        
        self.model_name = "gemini-3-flash-preview"
        self.generation_config = {
            "temperature": 0.1,
            "top_p": 0.95,
            "top_k": 64,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        }
        self.safety_settings = {
            "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
            "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
        }
    
    def _get_model(self):
        return genai.GenerativeModel(
            model_name=self.model_name,
            generation_config=self.generation_config,
            safety_settings=self.safety_settings
        )
    
    def _generate_with_retry(self, prompt_parts, retries=3):
        """Rate limit対応のリトライ機能付きAPI呼び出し"""
        model = self._get_model()
        for attempt in range(retries):
            try:
                return model.generate_content(prompt_parts)
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "quota" in error_str.lower():
                    wait_time = 32
                    match = re.search(r"retry in (\d+(\.\d+)?)s", error_str)
                    if match:
                        wait_time = float(match.group(1)) + 2
                    if attempt < retries - 1:
                        time.sleep(wait_time)
                        continue
                raise e
    
    def _clean_json_response(self, text: str) -> str:
        """JSONレスポンスのMarkdown記法を除去"""
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return text
    
    def _fix_json_string(self, text: str) -> str:
        """文字列内の改行やエスケープ問題を修正"""
        import re
        lines = text.split('\n')
        result_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped:
                result_lines.append(stripped)
        return ' '.join(result_lines)
    
    def _parse_json_result(self, text: str) -> Dict[str, Any]:
        """JSONをパースし、リストの場合は最初の要素を返す"""
        cleaned = self._clean_json_response(text)
        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            fixed = self._fix_json_string(cleaned)
            result = json.loads(fixed)
        
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        return result

    def _upload_to_gemini(self, file_data: bytes, mime_type: str):
        """Geminiへのファイルアップロード共通処理"""
        # 拡張子の決定（mime_typeから）
        suffix = ".bin"
        if "audio" in mime_type:
            suffix = ".m4a"
        elif "pdf" in mime_type:
            suffix = ".pdf"
        elif "image" in mime_type:
            suffix = ".jpg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        
        try:
            uploaded_file = genai.upload_file(tmp_path, mime_type=mime_type)
            # Processing待機
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)
            return uploaded_file, tmp_path
        except Exception as e:
            try:
                os.unlink(tmp_path)
            except:
                pass
            raise e

    def _run_analysis(self, file_contents: list[tuple[bytes, str]], prompt: str) -> Dict[str, Any]:
        """共通分析実行メソッド（複数ファイル対応）"""
        uploaded_files = []
        tmp_paths = []
        try:
            # 全ファイルをアップロード
            for file_data, mime_type in file_contents:
                uploaded_file, tmp_path = self._upload_to_gemini(file_data, mime_type)
                uploaded_files.append(uploaded_file)
                tmp_paths.append(tmp_path)
            
            # 生成実行
            # 注意: extract_assessment_info以外で使われる汎用メソッド（会議録など）
            response = self._generate_with_retry([*uploaded_files, prompt])
            return self._parse_json_result(response.text)
        finally:
            self._cleanup_files(uploaded_files, tmp_paths)

    # --- 公開メソッド ---

    # --- 内部ヘルパー: ファイル管理 ---

    def _upload_files_to_gemini(self, file_contents: list[tuple[bytes, str]]) -> tuple[list[Any], list[str]]:
        """ファイルをまとめてアップロードし、ファイルオブジェクトと一時パスを返す"""
        uploaded_files = []
        tmp_paths = []
        try:
            for file_data, mime_type in file_contents:
                uploaded_file, tmp_path = self._upload_to_gemini(file_data, mime_type)
                uploaded_files.append(uploaded_file)
                tmp_paths.append(tmp_path)
            return uploaded_files, tmp_paths
        except Exception as e:
            # 失敗時はそこまでアップロードしたものをクリーンアップして再送出
            self._cleanup_files(uploaded_files, tmp_paths)
            raise e

    def _cleanup_files(self, uploaded_files: list[Any], tmp_paths: list[str]):
        """Gemini上のファイルとローカル一時ファイルを削除"""
        for uploaded_file in uploaded_files:
            try:
                genai.delete_file(uploaded_file.name)
            except:
                pass
        for tmp_path in tmp_paths:
            try:
                os.unlink(tmp_path)
            except:
                pass

    def _load_all_mappings(self) -> Dict[str, Any]:
        """mapping.txt と mapping2.txt の両方を読み込んで統合した辞書を返す"""
        combined_mapping = {}
        
        # Mapping 1
        if MAPPING_FILE.exists():
            try:
                text = MAPPING_FILE.read_text(encoding='utf-8')
                combined_mapping.update(MappingParser.parse_mapping(text))
            except Exception as e:
                print(f"Failed to load mapping.txt: {e}")
        
        # Mapping 2
        if MAPPING2_FILE.exists():
            try:
                text = MAPPING2_FILE.read_text(encoding='utf-8')
                combined_mapping.update(MappingParser.parse_mapping(text))
            except Exception as e:
                print(f"Failed to load mapping2.txt: {e}")
                
        return combined_mapping

    def _categorize_fields(self, all_keys: list[str]) -> list[list[str]]:
        """フィールドを7つのグループに分類する"""
        groups = [[], [], [], [], [], [], []]
        
        # Keyword Definitions
        # G1: Basic/Social
        g1_keywords = ["作成", "受付", "相談者", "利用者", "家族", "世帯", "住居", "設備", "年金", "保険", "認定", "障害高齢者", "認知症高齢者", "被保険者"]
        # G2: Medical/History
        g2_keywords = ["経緯", "搬送", "これまでの生活", "生活リズム", "健康", "病名", "薬", "受診", "主治医", "医療機関"]
        # G3: Body/Mind (Physical Condition, Mental)
        g3_keywords = ["視力", "聴力", "口腔", "栄養", "身長", "体重", "血圧", "アレルギー", "麻痺", "拘縮", "痛み", "褥瘡", "認知機能", "行動障害", "精神", "阻害要因", "体温", "脈拍"]
        # G4: Physical ADL (Basic Movement)
        g4_keywords = ["移動", "食事", "水分", "排泄", "入浴", "更衣", "整容", "寝返り", "起き上がり", "立ち上がり", "座位", "立位", "移乗"]
        # G5: IADL/Comm (Cognitive Tasks, Communication)
        # Added "指示" for 指示反応
        g5_keywords = ["服薬", "調理", "掃除", "洗濯", "買物", "物品", "金銭", "コミュニケーション", "意思", "指示"]
        # G6: Services (Specific Service Usage block)
        g6_keywords = ["利用している支援", "社会資源", "フォーマル", "インフォーマル"]
        # G7: Social/Env (Environment & Summary)
        # Added "参加" explicitly
        g7_keywords = ["社会", "役割", "介護力", "支援", "サービス", "留意", "環境因子", "個人因子", "見通し", "住宅改修", "福祉用具", "社会保障", "参加"]

        used_keys = set()

        for key in all_keys:
            assigned = False
            
            # Check G6 (Services) FIRST (To prevent '支援' in G7 from catching it)
            for kw in g6_keywords:
                if kw in key:
                    groups[5].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G7 (Env)
            for kw in g7_keywords:
                if kw in key:
                    groups[6].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G5
            for kw in g5_keywords:
                if kw in key:
                    groups[4].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G4
            for kw in g4_keywords:
                if kw in key:
                    groups[3].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G3
            for kw in g3_keywords:
                if kw in key:
                    groups[2].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G2
            for kw in g2_keywords:
                if kw in key:
                    groups[1].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue

            # Check G1
            for kw in g1_keywords:
                if kw in key:
                    groups[0].append(key)
                    used_keys.add(key)
                    assigned = True
                    break
            if assigned: continue
            
            # Default to G7 if no match
            groups[6].append(key)
        
        return groups

    def _generate_partial_prompt(self, fields: list[str], mapping_dict: Dict[str, Any], phase_name: str) -> str:
        """指定されたフィールドリスト専用のプロンプトを生成"""
        instructions = []
        
        # 特殊処理が必要なフィールドグループの定義
        # 心身機能・身体構造の課題・ストレングス (順序スロット)
        body_challenges = ["BC22", "BM22", "BC30", "BM30"]
        # 活動の課題・ストレングス (順序スロット)
        activity_challenges = ["BC38", "BM38", "BC47", "BM47", "BC59", "BM59"]
        # 参加の課題・ストレングス
        participation_challenges = ["BC68", "BM68"]
        # その他・留意事項の課題・ストレングス
        other_challenges = ["BC72", "BM72", "BC76", "BM76"]
        # 見通し (順序スロット)
        outlooks = ["BX22", "BX32", "BX42", "BX52", "BX64", "BX72"]
        # チェックボックス (真偽値判定)
        checkboxes = ["N76", "U76", "Z76", "AE76", "AK76", "AO76"]
        
        special_instructions = []

        for key in fields:
            info = mapping_dict.get(key, {})
            line = f"- {key}"
            if "options" in info and info["options"]:
                opts = "、".join(info["options"])
                line += f" (選択肢: {opts})"
            instructions.append(line)
            
            # 特殊指示の蓄積
            if any(k in key for k in checkboxes):
                special_instructions.append(f"※ {key} は、該当する場合のみ「✔」を出力し、該当しない場合は空文字にしてください。")
        
        fields_str = "\n".join(instructions)
        special_instr_str = "\n".join(set(special_instructions))
        
        # 順序スロット論理の注入
        sequential_logic = ""
        
        # 心身機能系が含まれている場合
        if any(f in fields for f in body_challenges):
            sequential_logic += """
## 心身機能・身体構造に関する課題・ストレングスの抽出ルール
- 「心身機能」に関連する課題をすべて抽出し、リストの上から順に埋めてください。
- 1つ目の課題は BC22、2つ目の課題があれば BC30 に記入してください。
- ストレングスも同様に BM22, BM30 の順に記入してください。
"""
        # 活動系が含まれている場合
        if any(f in fields for f in activity_challenges):
            sequential_logic += """
## 活動に関する課題・ストレングスの抽出ルール
- 「活動（ADL/IADL全般）」に関連する課題をすべて抽出し、リストの上から順に埋めてください。
- 特定の生活動作（排泄や調理など）の横にセルがあっても、それはあくまで記入欄の順番です。
- 全体を通して1つ目の課題は BC38、2つ目は BC47、3つ目は BC59 に順に記入してください（空欄を作らず詰めてください）。
"""
        # 見通しが含まれている場合
        if any(f in fields for f in outlooks):
            sequential_logic += """
## 見通しの抽出ルール
- 今後の見通しに関する記述をすべて抽出し、BX22 から順に BX32, BX42... と詰めて記入してください。
"""
        # 参加・その他が含まれている場合(BC68等)
        if any(f in fields for f in participation_challenges):
            sequential_logic += """
## 参加に関する課題・ストレングス
- 社会参加や役割に関する課題は BC68/BM68 に記入してください。
"""

        return f"""
あなたはベテランの認定調査員・ケアマネージャーです。
今回は**「{phase_name}」**に関する情報のみを抽出してください。

## 抽出対象項目
以下のリストにある項目についてのみ、情報を見つけてください。
リストにない情報は無視してください。

{fields_str}

{special_instr_str}

{sequential_logic}

## 出力形式
JSON形式で、上記リストの項目名をキーとして出力してください。
値が見つからない場合は空文字 "" にしてください（推測で埋めないでください）。
"""

    def extract_assessment_info(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """アセスメント情報を7段階で抽出して統合"""
        
        # 1. 準備：マッピング読み込みとグループ化
        full_mapping = self._load_all_mappings()
        all_keys = list(full_mapping.keys())
        field_groups = self._categorize_fields(all_keys)
        phase_names = [
            "基本情報・社会基盤（氏名、住所、家族、認定情報など）",
            "医療・経歴（病歴、受診状況、生活歴など）",
            "心身機能・精神状態（麻痺、感覚、認知症、BPSDなど）",
            "身体ADL（移動、食事、排泄、入浴などの基本動作）",
            "IADL・認知・伝達（家事、金銭管理、コミュニケーション）",
            "サービスの利用状況・社会資源（フォーマル/インフォーマル、頻度、事業者）",
            "社会・環境・見通し・留意事項（居住環境、介護力、総合的方針）"
        ]

        master_result = {}
        
        # 2. ファイルアップロード（1回のみ）
        uploaded_files, tmp_paths = self._upload_files_to_gemini(file_contents)
        
        try:
            # 3. 7段階の抽出実行
            for i, fields in enumerate(field_groups):
                if not fields:
                    continue
                
                print(f"DEBUG: Starting Assessment Phase {i+1}/7: {phase_names[i]} ({len(fields)} fields)", flush=True)
                
                # プロンプト生成
                prompt = self._generate_partial_prompt(fields, full_mapping, phase_names[i])
                
                # API実行
                try:
                    # _generate_with_retry はモデル取得も内部でやるので再利用可
                    response = self._generate_with_retry([*uploaded_files, prompt])
                    partial_result = self._parse_json_result(response.text)
                    
                    # 結果をマージ
                    if isinstance(partial_result, dict):
                        master_result.update(partial_result)
                        print(f"DEBUG: Phase {i+1} completed. Merged {len(partial_result)} keys.", flush=True)
                    else:
                        print(f"WARNING: Phase {i+1} returned non-dict result: {type(partial_result)}", flush=True)
                        
                except Exception as e:
                    print(f"ERROR: Phase {i+1} failed: {e}", flush=True)
                    # 1つのフェーズが失敗しても他は続ける
            
            return master_result

        finally:
            # 4. クリーンアップ
            self._cleanup_files(uploaded_files, tmp_paths)

    # 互換性のために残す（中身は新メソッド呼出）
    def extract_from_pdf(self, pdf_data: bytes, mime_type: str) -> Dict[str, Any]:
        return self.extract_assessment_info([(pdf_data, mime_type)])

    def extract_from_image(self, image_data: bytes, mime_type: str) -> Dict[str, Any]:
        return self.extract_assessment_info([(image_data, mime_type)])
    
    def extract_assessment_from_audio(self, audio_data: bytes) -> Dict[str, Any]:
        return self.extract_assessment_info([(audio_data, "audio/mp4")])

    # 会議系（音声/PDF/画像対応に拡張。引数名は後方互換でfile_dataを想定）
    def generate_meeting_summary(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """会議録を生成（汎用、複数ファイル統合）"""
        prompt = """
あなたはケアマネジメントの専門家であり、医療・福祉分野のプロの記録担当者です。
アップロードされたデータ（複数ファイル可）を注意深く分析し、統合して1つの公式な会議録を作成します。

出力形式は以下のJSONです：
{
  "開催日": "日付",
  "開催場所": "場所",
  "開催時間": "時間",
  "開催回数": "回数",
  "担当者名": "名前",
  "利用者名": "名前",
  "検討内容": "詳細な会議録テキスト",
  "検討した項目": "会議の目的、暫定プラン、重要事項",
  "結論": "決定事項リスト"
}
"""
        return self._run_analysis(file_contents, prompt)

    def generate_management_meeting_summary(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """運営会議専用プロンプト（care-dx-app互換、複数ファイル統合）"""
        prompt = """
あなたは、医療・福祉分野のプロの記録担当者です。
入力されたデータ（会議の音声、または記録書類など複数可）を分析・統合し、以下の情報を抽出・整理して、**JSON形式**で出力してください。

## 出力するJSONのキーと作成ルール

1. "agenda" (議題項目)
   - 以下の議題リストを確認し、話された内容が含まれていれば行末に「●」を付けてください。
   - 形式はリスト形式ではなく、改行を含む1つのテキスト文字列としてください。
   【議題リストテンプレート】
   ①現に抱える処遇困難ケースについて
   ②過去に取り扱ったケースについての問題点及びその改善方策
   ③地域における事業所や活用できる社会資源の状況
   ④保健医療及び福祉に関する諸制度
   ⑤ケアマネジメントに関する技術
   ⑥利用者からの苦情があった場合は、その内容及び改善方針
   ⑦その他必要な事項

2. "support_24h" (24時間対応)
3. "sharing_matters" (共有事項)
   - 形式:
     ■利用者情報共有
     　...
     ■その他共有事項
     　...

## 出力例 (JSON)
{
  "agenda": "①現に抱える処遇困難ケースについて●\\n②過去に取り扱ったケースについての問題点及びその改善方策\\n...",
  "support_24h": "12/5 18:00 佐藤対応: 〇〇様転倒により救急搬送。入院となる。",
  "sharing_matters": "■利用者情報共有\\n〇武島（ケアマネ）：宮城様 老健退所後の自宅生活...\\n\\n■その他共有事項\\n〇リハビリ：松浦クリニックでの利用が可能か..."
}
"""
        return self._run_analysis(file_contents, prompt)

    def generate_service_meeting_summary(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """サービス担当者会議専用プロンプト（care-dx-app互換、複数ファイル統合）"""
        prompt = """
あなたはケアマネジメントの専門家であり、医療・福祉分野のプロの記録担当者です。
アップロードされたデータ（複数ファイル可）を注意深く分析し、統合して1つの公式な会議録を作成します。
あなたのタスクは、入力データ全体の内容を完全に理解・把握し、以下の【統合出力フォーマット】に厳密に従って会議録をまとめることです。

# 出力要件
以下のキーを持つJSONオブジェクトを出力してください。
値はマークダウンを含まないプレーンテキストにしてください。
改行は \\n で表現してください。

JSONキー仕様:
- "検討内容": 【統合出力フォーマット】に従った詳細な会議録テキスト
- "検討した項目": 会議の目的、暫定プラン、重要事項をまとめたテキスト
- "結論": 決定事項、今後の方針、モニタリング点などを箇条書き6~8項目程度

# 【統合出力フォーマット】（検討内容の形式）
①【本人及び家族の意向】...
②【心身・生活状況】...
③【会議の結論・ケアプラン詳細】...
④【各事業所の役割分担と確認事項】...
⑤【福祉用具・住宅改修等に関する検討事項】...

**必須要件**：結論には必ず「サービス担当へ、個別援助計画書の提出を依頼する」という文言を含めてください。
"""
        response = self._run_analysis(file_contents, prompt)
        
        # 必須文言の強制追加
        mandatory_text = "サービス担当へ、個別援助計画書の提出を依頼する"
        if "結論" in response:
            if mandatory_text not in response["結論"]:
                response["結論"] = response["結論"] + "\n・" + mandatory_text
        
        return response

    def extract_qa_from_audio(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """Q&A抽出"""
        prompt = """
提供されたデータを質問と回答のペアとして抽出してください。
出力形式：
{
  "qa_pairs": [
    {"question": "質問1", "answer": "回答1"},
    {"question": "質問2", "answer": "回答2"}
  ]
}
"""
        return self._run_analysis(file_contents, prompt)

    def generate_genogram_data(self, text: str) -> Dict[str, Any]:
        """テキストからジェノグラムデータを生成"""
        prompt = f"""
以下のテキストから家族情報を抽出し、ジェノグラム（家系図）データを生成してください。
テキスト: {text}
出力JSON形式: {{ "nodes": [...], "edges": [...] }}
"""
        response = self._generate_with_retry([prompt])
        text = self._clean_json_response(response.text)
        return json.loads(text)
    
    def generate_bodymap_data(self, text: str) -> Dict[str, Any]:
        """テキストから身体図データを生成"""
        prompt = f"""
以下のテキストから身体状況（マヒ、欠損、機能低下など）を抽出してください。
テキスト: {text}
出力JSON形式: {{ "findings": [{{ "part": "...", "condition": "...", "note": "..." }}] }}
"""
        response = self._generate_with_retry([prompt])
        text = self._clean_json_response(response.text)
        return json.loads(text)
