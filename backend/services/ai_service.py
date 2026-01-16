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
            response = self._generate_with_retry([*uploaded_files, prompt])
            return self._parse_json_result(response.text)
        finally:
            # クリーンアップ
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

    # --- 公開メソッド ---

    def _generate_assessment_prompt(self) -> str:
        """mapping.txtから動的にプロンプトを生成"""
        # マッピング定義の読み込み
        mapping_dict = {}
        if MAPPING_FILE.exists():
            try:
                mapping_text = MAPPING_FILE.read_text(encoding='utf-8')
                mapping_dict = MappingParser.parse_mapping(mapping_text)
            except Exception as e:
                print(f"Failed to load mapping.txt in AIService: {e}")
        
        # 項目リストの作成
        field_instructions = []
        for key, value in mapping_dict.items():
            instruction = f"- {key}"
            options = value.get("options", [])
            if options:
                options_str = "、".join(options)
                instruction += f" (選択肢: {options_str})"
            field_instructions.append(instruction)
        
        fields_str = "\n".join(field_instructions)

        prompt = f"""
あなたは、ベテランの認定調査員であり、ケアマネージャーです。
提供されたデータ（音声、PDF、画像など複数可）を注意深く分析し、
「アセスメントシート」を作成するために必要な情報を抽出してください。

以下の「抽出項目リスト」にある**全ての項目**について、入力データから情報を探してください。
特記事項や備考欄も含め、可能な限り詳細に抽出してください。

## 出力形式
以下のキーを持つフラットなJSON形式で出力してください。
キー名は「抽出項目リスト」の名称と完全に一致させてください。

```json
{{
  "項目名1": "値1",
  "項目名2": "値2",
  ...
}}
```

## 抽出ルール
1. **選択肢がある項目**: 必ず提示された選択肢の中から最も適切なものを選んでください。
2. **情報の不在**: 情報が見つからない項目は、空文字 "" または "（空白）" としてください。
3. **推測の禁止**: 明確な根拠がない場合は無理に埋めず、空白にしてください。
4. **統合**: 複数のファイル（例：音声とPDF）にまたがる情報は、矛盾がないように統合してください。

## 抽出項目リスト
{fields_str}
"""
        return prompt

    def extract_assessment_info(self, file_contents: list[tuple[bytes, str]]) -> Dict[str, Any]:
        """アセスメント情報を抽出（音声/PDF/画像対応、複数ファイル統合、動的プロンプト）"""
        prompt = self._generate_assessment_prompt()
        return self._run_analysis(file_contents, prompt)

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

1. "meeting_date" (日時)
2. "place" (開催場所)
3. "participants" (参加者)
4. "agenda" (議題項目)
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

5. "support_24h" (24時間対応)
6. "sharing_matters" (共有事項)
   - 形式:
     ■利用者情報共有
     　...
     ■その他共有事項
     　...

## 出力例 (JSON)
{
  "meeting_date": "令和7年10月6日（月）8時30分～8時40分",
  "place": "第一会議室",
  "participants": "武島、加藤、川路",
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
- "開催日": 日付のみ
- "開催場所": 場所のみ
- "開催時間": 時間のみ
- "開催回数": 回数のみ
- "担当者名": 名前のみ
- "利用者名": 名前のみ
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
