"""
Kakanai v2 - FastAPI Backend
介護業務DX バックエンドAPI
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
import uuid
import json

# Load environment variables
load_dotenv()

# Import services
from services.ai_service import AIService
from services.sheets_service import SheetsService
from services.storage_service import StorageService
from services.drive_service import drive_service
import io
from services.csv_service import csv_service
from fastapi.responses import Response, StreamingResponse

app = FastAPI(
    title="Kakanai API",
    description="介護業務DX バックエンドAPI",
    version="2.1.0"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://kakanai-kiyoraka.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services initialization
ai_service = AIService()
sheets_service = SheetsService()
storage_service = StorageService()


# --- Request/Response Models ---

class HealthResponse(BaseModel):
    status: str
    version: str


class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str


class PresignedUrlResponse(BaseModel):
    upload_url: str
    file_key: str


class AnalyzeAudioRequest(BaseModel):
    file_key: Optional[str] = None
    file_keys: Optional[List[str]] = None
    analysis_type: str = "assessment"  # assessment, meeting, qa
    # Optional filenames to rename uploads in Drive
    filenames: Optional[List[str]] = None


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    genogram_draft_id: Optional[str] = None
    bodymap_draft_id: Optional[str] = None


class SheetsWriteRequest(BaseModel):
    spreadsheet_id: str = "" # 新規作成時は空でもOK
    sheet_name: str = ""
    data: Dict[str, Any]
    mapping_type: str = "assessment"
    # 会議用の追加フィールド
    write_mode: str = "mapping"  # "mapping", "append", "create"
    meeting_type: str = ""  # "service_meeting", "management_meeting", "assessment"
    # 運営会議用の追加フィールド
    date_str: str = ""
    time_str: str = ""
    place: str = ""
    participants: str = ""
    # サービス担当者会議用の追加フィールド
    user_name: str = ""
    staff_name: str = ""
    meeting_count: str = ""
    # アセスメントシート用の追加フィールド
    consultant_name: str = ""      # 相談者氏名
    assessment_reason: str = ""    # アセスメント理由
    relationship: str = ""         # 続柄
    assessment_place: str = ""     # 実施場所
    reception_method: str = ""     # 受付方法


class GenogramGenerateRequest(BaseModel):
    text: str
    type: str = "genogram" # genogram or body_map


class GenogramRequest(BaseModel):
    text: str

class BodyMapRequest(BaseModel):
    text: str


# --- Background Tasks ---

def run_background_generation(text_data: str, genogram_id: str, bodymap_id: str):
    """
    バックグラウンドでジェノグラムと身体図のデータを生成し、R2に保存する
    """
    print(f"Background: Starting generation for IDs {genogram_id}, {bodymap_id}", flush=True)
    try:
        # 1. Genogram Generation
        if genogram_id:
            try:
                print("Background: Generating Genogram...", flush=True)
                genogram_data = ai_service.generate_genogram_data(text_data)
                # Save to R2 with specific key (drafts/{id}.json)
                key = f"drafts/{genogram_id}.json"
                json_bytes = json.dumps(genogram_data, ensure_ascii=False).encode("utf-8")
                
                # Use storage_service.s3_client directly to control key
                if storage_service.s3_client:
                    storage_service.s3_client.put_object(
                        Bucket=storage_service.bucket_name,
                        Key=key,
                        Body=json_bytes,
                        ContentType="application/json"
                    )
                    print(f"Background: Genogram draft saved to {key}", flush=True)
            except Exception as e:
                print(f"Background Error (Genogram): {e}", flush=True)

        # 2. BodyMap Generation
        if bodymap_id:
            try:
                print("Background: Generating BodyMap...", flush=True)
                bodymap_data = ai_service.generate_bodymap_data(text_data)
                # Save to R2
                key = f"drafts/{bodymap_id}.json"
                json_bytes = json.dumps(bodymap_data, ensure_ascii=False).encode("utf-8")
                
                if storage_service.s3_client:
                    storage_service.s3_client.put_object(
                        Bucket=storage_service.bucket_name,
                        Key=key,
                        Body=json_bytes,
                        ContentType="application/json"
                    )
                    print(f"Background: BodyMap draft saved to {key}", flush=True)
            except Exception as e:
                print(f"Background Error (BodyMap): {e}", flush=True)

    except Exception as e:
        print(f"Background Critical Error: {e}", flush=True)


# --- Endpoints ---

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """ヘルスチェック"""
    return HealthResponse(status="healthy", version="2.1.0")


@app.get("/api/draft/{draft_id}")
async def get_draft(draft_id: str):
    """下書きデータを取得"""
    try:
        key = f"drafts/{draft_id}.json"
        try:
            # R2からファイルを取得 (bytes)
            data_bytes = storage_service.get_file(key)
            return json.loads(data_bytes.decode("utf-8"))
        except Exception:
            # まだ生成されていないかエラー (404 Not Found)
            raise HTTPException(status_code=404, detail="Draft not found or not ready")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get Draft Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload/presign", response_model=PresignedUrlResponse)
async def get_presigned_url(request: PresignedUrlRequest):
    """
    Cloudflare R2へのダイレクトアップロード用署名付きURL発行
    """
    try:
        result = storage_service.generate_presigned_url(
            filename=request.filename,
            content_type=request.content_type
        )
        return PresignedUrlResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload/direct")
async def upload_file_direct(file: UploadFile = File(...)):
    """
    バックエンド経由でR2にアップロード（CORSバイパス）
    """
    try:
        # R2設定の確認
        if not storage_service.s3_client:
            raise HTTPException(status_code=500, detail="R2 credentials not configured.")
        
        content = await file.read()
        
        file_key = storage_service.upload_file(
            file_data=content,
            filename=file.filename,
            content_type=file.content_type or "application/octet-stream"
        )
        return {"success": True, "file_key": file_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze/audio", response_model=AnalyzeResponse)
async def analyze_audio(request: AnalyzeAudioRequest, background_tasks: BackgroundTasks):
    """
    R2経由の分析（複数ファイル対応）
    Background: Genogram/BodyMap generation for Assessment
    """
    try:
        file_contents = []

        # 1. file_keys (複数) があれば優先
        if request.file_keys:
            print(f"DEBUG: Processing {len(request.file_keys)} files from R2", flush=True)
            for key in request.file_keys:
                try:
                    data = storage_service.get_file(key)
                    # 仮のMIMEタイプ (拡張子から推測)
                    ext = key.split(".")[-1].lower() if "." in key else "bin"
                    mime = "application/octet-stream"
                    if ext in ["mp3", "m4a", "wav"]: mime = f"audio/{ext}"
                    elif ext == "pdf": mime = "application/pdf"
                    elif ext in ["jpg", "jpeg", "png"]: mime = f"image/{ext}"
                    
                    file_contents.append((data, mime))
                except Exception as e:
                    print(f"Error fetching file {key}: {e}", flush=True)
        
        # 2. file_key (単体) の場合 (後方互換)
        elif request.file_key:
            print(f"DEBUG: Processing single file from R2: {request.file_key}", flush=True)
            try:
                data = storage_service.get_file(request.file_key)
                mime = "audio/mp4"
                if request.file_key.lower().endswith(".pdf"): mime = "application/pdf"
                file_contents.append((data, mime))
            except Exception as e:
                print(f"Error fetching file {request.file_key}: {e}", flush=True)
        
        else:
            raise HTTPException(status_code=400, detail="No file_key or file_keys provided")

        if not file_contents:
             return AnalyzeResponse(success=False, error="No accessible files found")

        # 1.5 Google Driveへの自動保存 (会議系のみ・R2経由分)
        if request.analysis_type in ["management_meeting", "service_meeting"]:
            try:
                folder_id = drive_service.get_folder_id_by_type(request.analysis_type)
                if folder_id:
                    print(f"DEBUG: Uploading {len(file_contents)} files from R2 to Drive Folder: {folder_id}", flush=True)
                    for i, (data, mime) in enumerate(file_contents):
                        # ファイル名決定 (優先度: filenames > file_keys > file_key > default)
                        fname = f"audio_{i}"
                        
                        if request.filenames and i < len(request.filenames):
                             fname = request.filenames[i]
                        elif request.file_keys and i < len(request.file_keys):
                            fname = request.file_keys[i]
                        elif request.file_key:
                            fname = request.file_key
                        
                        drive_service.upload_file(io.BytesIO(data), fname, mime, folder_id)
                else:
                    print(f"DEBUG: No folder ID configured for {request.analysis_type}, skipping upload", flush=True)
            except Exception as e:
                 print(f"Drive Upload Error: {e}", flush=True)

        # 分析タイプに応じて処理
        result = {}
        if request.analysis_type == "assessment":
            print(f"Starting Assessment Analysis for {len(file_contents)} files...", flush=True)
            result = await ai_service.extract_assessment_info(file_contents)
            
            # --- Auto-Generation Trigger (Background) ---
            gen_id = str(uuid.uuid4())
            body_id = str(uuid.uuid4())
            result_text = json.dumps(result, ensure_ascii=False)
            
            background_tasks.add_task(run_background_generation, result_text, gen_id, body_id)
            
            return AnalyzeResponse(
                success=True, 
                data=result,
                genogram_draft_id=gen_id,
                bodymap_draft_id=body_id
            )

        elif request.analysis_type == "management_meeting":
            result = ai_service.generate_management_meeting_summary(file_contents)
        elif request.analysis_type == "service_meeting":
            result = ai_service.generate_service_meeting_summary(file_contents)
        elif request.analysis_type == "meeting":
            result = ai_service.generate_meeting_summary(file_contents)
        elif request.analysis_type == "qa":
            result = ai_service.extract_qa_from_audio(file_contents)
        else:
            raise ValueError(f"Unknown analysis type: {request.analysis_type}")
        
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        print(f"ERROR: analyze_audio failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return AnalyzeResponse(success=False, error=str(e))


# ユニバーサル分析エンドポイント（名前は互換性のために analyze/audio/direct も残すか、Frontendを変える）
# Frontendを /api/analyze/direct に変更する方針で実装
@app.post("/api/analyze/direct", response_model=AnalyzeResponse)
@app.post("/api/analyze/audio/direct", response_model=AnalyzeResponse) # 互換性エイリアス
async def analyze_file_direct(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    analysis_type: str = Form("assessment")
):
    """
    ファイル直接分析（Universal Input、複数ファイル対応）
    - 音声、PDF、画像を受け入れ（複数可）
    - 運営会議/サービス会議ならDriveへ保存（全ファイル）
    - 全ファイルを統合して分析実行
    - AssessmentならバックグラウンドでGenogram/BodyMap生成
    """
    try:
        print(f"DEBUG: analyze_file_direct called with {len(files)} files, type={analysis_type}", flush=True)
        
        file_contents = [] # [(content, mime_type), ...]

        for file in files:
            content = await file.read()
            mime_type = file.content_type or "application/octet-stream"
            
            # 簡易的なMIMEタイプ補正
            if mime_type == "application/octet-stream":
                fname = file.filename.lower()
                if fname.endswith(".pdf"): mime_type = "application/pdf"
                elif fname.endswith(".jpg") or fname.endswith(".jpeg"): mime_type = "image/jpeg"
                elif fname.endswith(".png"): mime_type = "image/png"
                elif fname.endswith(".m4a") or fname.endswith(".mp4"): mime_type = "audio/mp4"
                elif fname.endswith(".mp3"): mime_type = "audio/mpeg"

            file_contents.append((content, mime_type))

            # 1. Google Driveへの自動保存 (会議系のみ)
            if analysis_type in ["management_meeting", "service_meeting"]:
                try:
                    folder_id = drive_service.get_folder_id_by_type(analysis_type)
                    if folder_id:
                        print(f"DEBUG: Uploading to Drive Folder: {folder_id}", flush=True)
                        drive_service.upload_file(io.BytesIO(content), file.filename, mime_type, folder_id)
                    else:
                        print(f"DEBUG: No folder ID for {analysis_type}", flush=True)
                except Exception as e:
                     print(f"Drive Upload Error (Direct): {e}", flush=True)

        # 2. 分析実行（統合分析）
        result = {}
        if analysis_type == "assessment":
            result = await ai_service.extract_assessment_info(file_contents)
            
            # --- Auto-Generation Trigger (Background) ---
            gen_id = str(uuid.uuid4())
            body_id = str(uuid.uuid4())
            result_text = json.dumps(result, ensure_ascii=False)
            
            background_tasks.add_task(run_background_generation, result_text, gen_id, body_id)
            
            print(f"DEBUG: Analysis complete, Background tasks started. GenID={gen_id}", flush=True)
            return AnalyzeResponse(
                success=True, 
                data=result, 
                genogram_draft_id=gen_id, 
                bodymap_draft_id=body_id
            )

        elif analysis_type == "management_meeting":
            result = ai_service.generate_management_meeting_summary(file_contents)
        elif analysis_type == "service_meeting":
            result = ai_service.generate_service_meeting_summary(file_contents)
        elif analysis_type == "meeting":
            result = ai_service.generate_meeting_summary(file_contents)
        elif analysis_type == "qa":
            result = ai_service.extract_qa_from_audio(file_contents)
        else:
            # デフォルトでアセスメント扱い
            result = ai_service.extract_assessment_info(file_contents)
        
        print(f"DEBUG: Analysis complete for type={analysis_type}", flush=True)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        print(f"ERROR: analyze_file_direct failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/analyze/pdf", response_model=AnalyzeResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    """PDFファイル分析（互換性用: アセスメントとして処理）"""
    # 単一ファイルをリストにラップして呼び出す必要があるが実体がないため
    # ここでは analyze_file_direct を直接呼べないので、ロジックを再利用するか、
    # analyze_file_directのシグネチャ変更によりこちらは個別に実装しなおすのが安全
    # ただ、analyze_file_direct はList[UploadFile]を期待するので、[file]を渡せばよいはずだが
    # FastAPIのDIの仕組み上、関数呼び出しは単純ではないため、個別に処理を書くのが無難。
    # しかしDRY原則からして、ai_serviceを呼ぶだけにする。
    
    content = await file.read()
    mime_type = "application/pdf"
    result = ai_service.extract_assessment_info([(content, mime_type)])
    return AnalyzeResponse(success=True, data=result)


@app.post("/api/analyze/image", response_model=AnalyzeResponse)
async def analyze_image(file: UploadFile = File(...)):
    """画像ファイル分析（互換性用: アセスメントとして処理）"""
    content = await file.read()
    mime_type = file.content_type or "image/jpeg"
    result = ai_service.extract_assessment_info([(content, mime_type)])
    return AnalyzeResponse(success=True, data=result)


@app.post("/api/sheets/write", response_model=AnalyzeResponse)
async def write_to_sheets(request: SheetsWriteRequest):
    """
    Googleスプレッドシートへの書き込み
    """
    try:
        print(f"DEBUG: write_to_sheets called. Mode={request.write_mode}, Type={request.meeting_type}", flush=True)

        if request.write_mode == "create":
            # 新規作成モード（アセスメントシート用）
            template_id = drive_service.get_template_id_by_type("assessment")
            folder_id = drive_service.get_folder_id_by_type("assessment")
            
            if not template_id or not folder_id:
                return AnalyzeResponse(
                    success=False, 
                    error="Assessment Template ID or Folder ID not configured in backend variables."
                )

            # --- 手入力データの優先適用 (アセスメントシート) ---
            if not request.data:
                request.data = {}
            
            if request.consultant_name:
                request.data["相談者氏名"] = request.consultant_name
            if request.assessment_reason:
                request.data["アセスメント理由"] = request.assessment_reason
            if request.relationship:
                request.data["続柄"] = request.relationship
            if request.assessment_place:
                request.data["実施場所"] = request.assessment_place
            if request.reception_method:
                request.data["受付方法"] = request.reception_method
            
            # 注: アプリフォームから「利用者名(相談対象者)」が送られてくるフィールドがあるか確認が必要
            # もし request.user_name がアセスメントでも使われるならここでマッピングする
            if request.user_name:
                 # マッピング定義に従い「利用者情報_氏名_漢字」や「基本情報.氏名」に入れるべきだが
                 # create_and_write_assessment は data_dict["利用者情報_氏名_漢字"] や data_dict["氏名"] を見る
                 request.data["利用者情報_氏名_漢字"] = request.user_name

            result = sheets_service.create_and_write_assessment(
                template_id=template_id,
                folder_id=folder_id,
                data_dict=request.data,
                sheet_name=request.sheet_name
            )
            return AnalyzeResponse(
                success=result.get("success", False),
                data=result,
                error=result.get("error")
            )

        elif request.write_mode == "append":
            # 行追加モード（会議用）
            if request.meeting_type == "service_meeting":
                # --- 手入力データの優先適用 ---
                # アプリから別途送られてくる「日時」「場所」「氏名」「回数」を
                # AIの分析結果(request.data)に強制上書きする。
                if not request.data:
                    request.data = {}
                
                # 日時: date_str + time_str
                if request.date_str:
                    request.data["開催日"] = request.date_str
                if request.time_str:
                     request.data["開催時間"] = request.time_str
                if request.place:
                    request.data["開催場所"] = request.place
                
                # 新規追加: user_name, staff_name, meeting_count
                if request.user_name:
                    request.data["利用者名"] = request.user_name
                if request.staff_name:
                    request.data["担当者名"] = request.staff_name
                if request.meeting_count:
                    # 数値のみ抽出（「第6回」→「6」）
                    # "第"と"回"を除去するシンプルな実装
                    clean_count = request.meeting_count.replace("第", "").replace("回", "")
                    request.data["開催回数"] = clean_count
                
                # 1. 既存のマスタシートへ行追加
                append_result = sheets_service.write_service_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data_dict=request.data,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
                
                # 2. 個別ファイルの新規作成 (New Feature)
                # request.spreadsheet_id passed as the template ID (base spreadsheet)
                create_result = {}
                try:
                    create_result = sheets_service.create_and_write_service_meeting(
                        template_id=request.spreadsheet_id,
                        data=request.data
                    )
                except Exception as e:
                    print(f"ERROR: Failed to create individual service meeting file: {e}")
                    import traceback
                    traceback.print_exc()

                # 結果の統合
                result = append_result
                if create_result.get("success"):
                    # 個別ファイルが作成できた場合は、そのURLを優先して返す (ユーザーがすぐ開けるように)
                    result["sheet_url"] = create_result.get("sheet_url")
            elif request.meeting_type == "management_meeting":
                # 1. 既存のマスタシートへ行追加
                append_result = sheets_service.write_management_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data=request.data,
                    date_str=request.date_str,
                    time_str=request.time_str,
                    place=request.place,
                    participants=request.participants,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
                
                # 2. 個別ファイルの新規作成（アセスメントシート方式）
                folder_id = drive_service.get_folder_id_by_type("management_meeting")
                create_result = {}
                
                if folder_id:
                    print(f"DEBUG: Creating separate management meeting file in folder {folder_id}", flush=True)
                    create_result = sheets_service.create_and_write_management_meeting(
                        template_id=request.spreadsheet_id, # マスタシートをテンプレートとして使用
                        folder_id=folder_id,
                        data=request.data,
                        date_str=request.date_str,
                        time_str=request.time_str,
                        place=request.place,
                        participants=request.participants
                    )
                else:
                    print("DEBUG: No management meeting folder ID configured, skipping individual file creation", flush=True)

                # 結果の統合（個別ファイル作成が成功していれば、そのURLを優先して返す）
                result = append_result
                if create_result.get("success"):
                    result["sheet_url"] = create_result.get("sheet_url")
                    result["individual_file_created"] = True
                    result["individual_file_id"] = create_result.get("spreadsheet_id")
                    print(f"DEBUG: Returned URL updated to new file: {result['sheet_url']}", flush=True)
            else:
                result = sheets_service.write_service_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data_dict=request.data,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
            return AnalyzeResponse(
                success=result.get("success", False),
                data=result,
                error=result.get("error")
            )
        else:
            # マッピングモード（旧互換、明示的にID指定されたアセスメントなど）
            if not request.spreadsheet_id:
                 return AnalyzeResponse(success=False, error="Spreadsheet ID required for mapping mode")

            written_count = sheets_service.write_data(
                spreadsheet_id=request.spreadsheet_id,
                sheet_name=request.sheet_name,
                data=request.data,
                mapping_type=request.mapping_type
            )
            return AnalyzeResponse(success=True, data={"written_cells": written_count})

    except Exception as e:
        print(f"ERROR: write_to_sheets failed: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/genogram/generate", response_model=AnalyzeResponse)
async def generate_genogram(request: GenogramRequest):
    """ジェノグラムデータ生成"""
    try:
        result = ai_service.generate_genogram_data(request.text)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/csv/convert")
async def convert_csv(file: UploadFile = File(...)):
    """CSVをExcelに変換"""
    try:
        content = await file.read()
        
        # サービスの呼び出し
        # 戻り値は (excel_binary, output_filename)
        excel_data, filename = csv_service.convert_csv_to_excel(content, file.filename)
        
        # 日本語ファイル名対応 (URLエンコード)
        from urllib.parse import quote
        encoded_filename = quote(filename)
        
        # StreamingResponseで返す
        return StreamingResponse(
            io.BytesIO(excel_data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )

    except Exception as e:
        print(f"ERROR: CSV convert failed: {e}", flush=True)
        # traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bodymap/generate", response_model=AnalyzeResponse)
async def generate_bodymap(request: BodyMapRequest):
    """身体図データ生成"""
    try:
        result = ai_service.generate_bodymap_data(request.text)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
