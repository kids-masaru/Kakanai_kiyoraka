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
from typing import Dict, Any, Optional


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
    
    def extract_assessment_from_audio(self, audio_data: bytes) -> Dict[str, Any]:
        """音声データからアセスメント情報を抽出"""
        # 一時ファイルに保存してからアップロード
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        uploaded_file = None
        try:
            uploaded_file = genai.upload_file(tmp_path, mime_type="audio/mp4")
            
            # Processing待機
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)
        
            prompt = """
あなたは、ベテランの認定調査員であり、ケアマネージャーです。
提供された音声データ（アセスメント面談の録音）を注意深く聞き取り、
「アセスメントシート（基本情報、課題分析、認定調査票）」を作成するために必要な情報を抽出してください。

出力は以下のJSON形式のみで行ってください。

## 抽出方針
- 会話の中から「事実関係」「本人の発言」「家族の発言」「専門職の判断」を拾う
- 雑談は除外する
- 不明な項目は \"（空白）\" とする

## 出力JSONフォーマット
{
  "基本情報": {
    "氏名": "", "性別": "", "生年月日": "", "年齢": "", "住所": "", "電話番号": ""
  },
  "利用者情報": {
     "既往歴": "", "主訴": "", "家族構成": "", "キーパーソン": ""
  },
  "認定調査項目": {
    "身体機能": "（麻痺、拘縮、寝返り、歩行などの状況）",
    "生活機能": "（食事、排泄、入浴、着脱、移動などの介助量）",
    "認知機能": "（意思疎通、短期記憶、徘徊、生年月日等の認識）",
    "精神・行動障害": "（感情不安定、暴言、暴力、拒絶など）",
    "社会生活": "（服薬管理、金銭管理、買い物、調理など）"
  },
  "アセスメント情報": {
    "相談の経緯": "",
    "本人・家族の意向": "",
    "生活状況": "（起床就寝、日中の過ごし方、外出頻度など）",
    "住環境": "（段差、手すり、住宅改修の必要性など）",
    "他サービス利用状況": ""
  },
  "主治医・医療": {
    "主治医": "", "医療機関": "", "特別な医療処置": ""
  }
}
"""
            response = self._generate_with_retry([uploaded_file, prompt])
            text = self._clean_json_response(response.text)
            return json.loads(text)
        finally:
            # クリーンアップ
            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except:
                    pass
            # 一時ファイル削除
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    def generate_meeting_summary(self, audio_data: bytes) -> Dict[str, Any]:
        """音声データから会議録を生成"""
        # 一時ファイルに保存してからアップロード
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        uploaded_file = None
        try:
            uploaded_file = genai.upload_file(tmp_path, mime_type="audio/mp4")
            
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)
            
            prompt = """
あなたはケアマネジメントの専門家であり、医療・福祉分野のプロの記録担当者です。
アップロードされたデータを注意深く分析し、公式な会議録を作成します。

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
            response = self._generate_with_retry([uploaded_file, prompt])
            text = self._clean_json_response(response.text)
            return json.loads(text)
        finally:
            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except:
                    pass
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    def extract_qa_from_audio(self, audio_data: bytes) -> Dict[str, Any]:
        """音声データからQ&A形式で抽出"""
        # 一時ファイルに保存してからアップロード
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        uploaded_file = None
        try:
            uploaded_file = genai.upload_file(tmp_path, mime_type="audio/mp4")
            
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)
            
            prompt = """
提供された音声データを質問と回答のペアとして抽出してください。

出力形式：
{
  "qa_pairs": [
    {"question": "質問1", "answer": "回答1"},
    {"question": "質問2", "answer": "回答2"}
  ]
}
"""
            response = self._generate_with_retry([uploaded_file, prompt])
            text = self._clean_json_response(response.text)
            return json.loads(text)
        finally:
            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except:
                    pass
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    def extract_from_pdf(self, pdf_data: bytes, mime_type: str) -> Dict[str, Any]:
        """PDFから情報を抽出"""
        uploaded_file = genai.upload_file(
            io.BytesIO(pdf_data),
            mime_type=mime_type
        )
        
        while uploaded_file.state.name == "PROCESSING":
            time.sleep(1)
            uploaded_file = genai.get_file(uploaded_file.name)
        
        prompt = """
提供されたPDFドキュメントから、アセスメントに必要な全情報を抽出してください。
JSON形式で出力してください。
"""
        try:
            response = self._generate_with_retry([uploaded_file, prompt])
            text = self._clean_json_response(response.text)
            return json.loads(text)
        finally:
            try:
                genai.delete_file(uploaded_file.name)
            except:
                pass
    
    def generate_genogram_data(self, text: str) -> Dict[str, Any]:
        """テキストからジェノグラムデータを生成"""
        prompt = f"""
以下のテキストから家族情報を抽出し、ジェノグラム（家系図）データを生成してください。

テキスト:
{text}

出力JSON形式:
{{
  "nodes": [
    {{"id": "1", "type": "personNode", "data": {{"name": "名前", "gender": "male/female", "birthYear": 1950, "isAlive": true}}, "position": {{"x": 0, "y": 0}}}}
  ],
  "edges": [
    {{"id": "e1-2", "source": "1", "target": "2", "type": "marriage/parent-child"}}
  ]
}}
"""
        response = self._generate_with_retry([prompt])
        text = self._clean_json_response(response.text)
        return json.loads(text)
    
    def generate_bodymap_data(self, text: str) -> Dict[str, Any]:
        """テキストから身体図データを生成"""
        prompt = f"""
以下のテキストから身体状況（マヒ、欠損、機能低下など）を抽出してください。

テキスト:
{text}

出力JSON形式:
{{
  "findings": [
    {{"part": "部位名", "condition": "状態", "note": "補足"}}
  ]
}}
"""
        response = self._generate_with_retry([prompt])
        text = self._clean_json_response(response.text)
        return json.loads(text)
