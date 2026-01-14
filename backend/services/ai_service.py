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
    
    def _fix_json_string(self, text: str) -> str:
        """文字列内の改行やエスケープ問題を修正"""
        import re
        # 文字列値内の改行を\\nにエスケープ
        # JSON文字列内（": "の後から次の","や"}"まで）の生の改行を処理
        def escape_newlines(match):
            value = match.group(1)
            # 改行を\\nに置換
            escaped = value.replace('\n', '\\n').replace('\r', '')
            return f'": "{escaped}"'
        
        # 簡易的なパターンマッチング: ": "値"の形式で改行を含むものを修正
        # より堅牢なアプローチ：全体をクリーンアップ
        lines = text.split('\n')
        result_lines = []
        in_string = False
        for line in lines:
            stripped = line.strip()
            if stripped:
                result_lines.append(stripped)
        
        cleaned = ' '.join(result_lines)
        return cleaned
    
    def _parse_json_result(self, text: str) -> Dict[str, Any]:
        """JSONをパースし、リストの場合は最初の要素を返す"""
        cleaned = self._clean_json_response(text)
        
        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            # パースエラー時は改行を処理してリトライ
            fixed = self._fix_json_string(cleaned)
            result = json.loads(fixed)
        
        # Geminiがリストで返すことがあるので、最初の要素を取り出す
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        return result
    
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
            return self._parse_json_result(response.text)
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
            return self._parse_json_result(response.text)
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
    
    def generate_management_meeting_summary(self, audio_data: bytes) -> Dict[str, Any]:
        """運営会議専用プロンプト（care-dx-app互換）"""
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
あなたは、医療・福祉分野のプロの記録担当者です。
入力された「会議の音声データ」を分析し、以下の情報を抽出・整理して、**JSON形式**で出力してください。

## 出力するJSONのキーと作成ルール

1. "meeting_date" (日時)
   - 会議の実施日と時間を抽出してください。
   - 例: "令和7年10月6日（月）8時30分～8時40分"

2. "place" (開催場所)
   - 開催場所を抽出してください。「場所は～」などの説明は不要です。

3. "participants" (参加者)
   - 参加者の名前を抽出し、「、」区切りの文字列にしてください。
   - 例: "武島、加藤、川路"

4. "agenda" (議題項目)
   - 以下の議題リストを確認し、話された内容が含まれていれば行末に「●」を付けてください。
   - 話されていない項目はそのまま記述してください。
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
   - 「24時間連絡対応」「営業時間外の対応」に関する発言があればまとめてください。
   - 日時、対応者、内容（退所など）を含めてください。
   - 文体: 「～とのこと」「～あり」などの体言止め。
   - なければ「特になし」としてください。

6. "sharing_matters" (共有事項)
   - 利用者情報の共有（利用開始、終了、状態変化など）や、その他の共有事項を抽出してください。
   - 形式:
     ■利用者情報共有
     　...
     ■その他共有事項
     　...
   - 発言者（〇〇さん）が明確な場合は「〇〇（職種）：内容」の形式で記載してください。

## 出力例 (JSON)
{
  "meeting_date": "令和7年10月6日（月）8時30分～8時40分",
  "place": "第一会議室",
  "participants": "武島、加藤、川路",
  "agenda": "①現に抱える処遇困難ケースについて●\\n②過去に取り扱ったケースについての問題点及びその改善方策\\n...",
  "support_24h": "12/5 18:00 佐藤対応: 〇〇様転倒により救急搬送。入院となる。",
  "sharing_matters": "■利用者情報共有\\n〇武島（ケアマネ）：宮城様 老健退所後の自宅生活...\\n\\n■その他共有事項\\n〇リハビリ：松浦クリニックでの利用が可能か..."
}

**重要**: 必ず有効なJSONのみを出力してください。Markdown記法は不要です。
"""
            response = self._generate_with_retry([uploaded_file, prompt])
            return self._parse_json_result(response.text)
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
    
    def generate_service_meeting_summary(self, audio_data: bytes) -> Dict[str, Any]:
        """サービス担当者会議専用プロンプト（care-dx-app互換）"""
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
アップロードされたデータ（音声データ）を注意深く分析し、公式な会議録を作成します。
あなたのタスクは、入力データの内容を完全に理解・把握し、以下の【統合出力フォーマット】に厳密に従って会議録をまとめることです。

# 実行プロセス

## 全体把握
入力データ（音声）に含まれる全ての情報を詳細に確認し、文脈を理解します。

## 情報抽出
以下の情報に関連する内容をすべて抽出します。
- 「本人・家族の意向」
- 「心身・生活状況（身体・精神・生活）」
- 「ニーズ（困りごと、改善・維持の要望）」
- 「医学的所見（主治医の指示・留意点）」
- 「会議の主要な論点と結論（計画の変更点、継続の是非、新規対応など）」
- 「各事業所の具体的な役割分担（会議で特に確認・変更された点、連携上の留意事項）」
- 「福祉用具・住宅改修等の検討内容（検討経緯、専門職の意見、本人・家族の選択、導入理由）」

★重要チェック項目：以下のサービスの利用検討が含まれる場合、その「必要性」と「導入根拠」を重点的に抽出してください。
　・医療サービス（訪問看護やリハビリ等の医療連携）
　・福祉用具（特に特殊寝台等の特定用具や例外給付）
　・生活援助（家事支援の妥当性など）

# 出力要件
以下のキーを持つJSONオブジェクトを出力してください。
値はマークダウンを含まないプレーンテキストにしてください。
改行は \\n で表現してください。

JSONキー仕様:
- "開催日": 日付のみ（例: 2025年4月1日）
- "開催場所": 場所のみ
- "開催時間": 時間のみ（例: 10:00~11:00）
- "開催回数": 回数のみ（例: 第1回）
- "担当者名": 名前のみ
- "利用者名": 名前のみ
- "検討内容": 【統合出力フォーマット】に従った詳細な会議録テキスト
- "検討した項目": 会議の目的、暫定プラン、重要事項をまとめたテキスト
- "結論": 決定事項、今後の方針、モニタリング点などを箇条書き6~8項目程度

# 【統合出力フォーマット】（検討内容の形式）

①【本人及び家族の意向】
・本人⇒
「（ここに本人の発言内容、または意向の要約を記載）」
・家族⇒
「（ここに家族の発言内容、または意向の要約を記載）」

②【心身・生活状況】
・身体状況⇒（ここに該当する内容を記載）
・精神状況⇒（ここに該当する内容を記載）
・生活状況⇒（ここに該当する内容を記載）
・困りごと・生活ニーズ⇒（「改善、維持、悪化」を明記の上、ニーズごとに論点を整理して記載）
・主治医からの医学的所見⇒（留意事項、処方、禁忌、制限、付加の程度、サービス利用により期待すること等の医学的所見を記載）

③【会議の結論・ケアプラン詳細】
・主な検討事項と結論：
（抽出した「会議の主要な論点と結論」を記載。本人・家族の意向を踏まえ、話し合った結果どうなったかを具体的に記載する。）
（※特に医療サービス・福祉用具・生活援助の導入や変更がある場合は、その「必要性」と「決定の根拠（医学的所見やADL上の理由）」を必ず明記すること）

④【各事業所の役割分担と確認事項】
＊（事業所名A）⇒
　・提供内容：（内容・方法・頻度を簡潔に）
　・主な役割と留意点：（会議で確認・変更された具体的な役割、サービス提供時の留意事項、他事業所との連携点などを記載）
＊（事業所名B）⇒
　・提供内容：（内容・方法・頻度を簡潔に）
　・主な役割と留意点：（会議で確認・変更された具体的な役割、サービス提供時の留意事項、他事業所との連携点などを記載）
（※事業所がさらにあれば、上記に続けて＊で追加する）

⑤【福祉用具・住宅改修等に関する検討事項】
（抽出した「福祉用具・住宅改修等の検討内容」に基づき記載。該当ない場合は「（特記事項なし）」）
・現状の課題：（疾患名や症状、生活上の具体的な支障。例：変形性膝関節症により、自室からトイレへの移動にふらつき有り）
・検討内容と経緯：（会議で検討された用具や改修案、専門職の意見、導入の経緯を記載）
・結論：（本人・家族の意向、専門相談員の意見等を踏まえ、導入（貸与/購入/改修）が決定した用具名と、その妥当性（利用目的）を記載）
（※選択制対象用具の検討があった場合、結論に以下を含める）
　（対象用具名）について、貸与と購入の利点・欠点を説明した結果、（本人・家族の選択：貸与 or 購入）の意向が確認された。

# JSON出力例
{
  "開催日": "2025年4月1日",
  "開催場所": "自宅",
  "開催時間": "10:00~11:00",
  "開催回数": "第1回",
  "担当者名": "介護 太郎",
  "利用者名": "福祉 花子",
  "検討内容": "①【本人及び家族の意向】\\n・本人⇒「自分でできることは自分でやりたい」\\n・家族⇒「安全に過ごしてほしい」\\n\\n②【心身・生活状況】\\n・身体状況⇒...",
  "検討した項目": "1.【会議の目的】ケアプランの見直しと各事業所の役割確認\\n2.【暫定プランに関する事項】現行サービスの継続と新規サービスの検討\\n3.【重要事項の抽出】転倒リスクへの対応、医療連携の強化",
  "結論": "1. 現行のデイサービス（週2回）を継続する\\n2. 訪問看護を週1回追加し、健康管理を強化する\\n3. 福祉用具（歩行器）の導入を決定\\n4. 次回モニタリングは1ヶ月後に実施\\n5. 緊急時の連絡体制を確認した\\n6. 各事業所間の情報共有方法を統一した\\n7. サービス担当へ、個別援助計画書の提出を依頼する"
}

# 重要な注意事項
- 情報不足時の対応：入力データに特定の項目に関する情報が含まれていない場合は、その項目に「（特記事項なし）」または「（該当する言及なし）」と記載してください。
- 視認性の確保：改行（\\n）を適切に使用し、視認性の高いレイアウトにしてください。
- プレーンテキスト形式：出力にはマークダウン（#見出し、**太字**など）を一切使用せず、人間がそのまま読みやすいプレーンなテキスト形式で作成してください。
- **必須要件**：結論には必ず「サービス担当へ、個別援助計画書の提出を依頼する」という文言を含めてください。
"""
            response = self._generate_with_retry([uploaded_file, prompt])
            result = self._parse_json_result(response.text)
            
            # 必須文言の強制追加（AIが忘れた場合用）
            mandatory_text = "サービス担当へ、個別援助計画書の提出を依頼する"
            if "結論" in result:
                if mandatory_text not in result["結論"]:
                    result["結論"] = result["結論"] + "\n・" + mandatory_text
            
            return result
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
            return self._parse_json_result(response.text)
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
    
    def extract_from_image(self, image_data: bytes, mime_type: str) -> Dict[str, Any]:
        """画像（JPEG/PNG）から情報を抽出"""
        print(f"DEBUG: extract_from_image called with mime_type={mime_type}", flush=True)
        
        uploaded_file = genai.upload_file(
            io.BytesIO(image_data),
            mime_type=mime_type
        )
        
        while uploaded_file.state.name == "PROCESSING":
            time.sleep(1)
            uploaded_file = genai.get_file(uploaded_file.name)
        
        prompt = """
あなたは、ベテランの認定調査員であり、ケアマネージャーです。
提供された画像データ（書類の写真、アセスメントシート等）を注意深く読み取り、
「アセスメントシート（基本情報、課題分析、認定調査票）」を作成するために必要な情報を抽出してください。

出力は以下のJSON形式のみで行ってください。

## 抽出方針
- 画像内のテキスト、手書き文字、表形式のデータを読み取る
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
        try:
            response = self._generate_with_retry([uploaded_file, prompt])
            return self._parse_json_result(response.text)
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
