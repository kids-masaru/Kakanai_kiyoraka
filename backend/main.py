"""
Kakanai v2 - FastAPI Backend
介護業務DX バックエンドAPI
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import services
from services.ai_service import AIService
from services.sheets_service import SheetsService
from services.storage_service import StorageService
from services.drive_service import drive_service

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
    file_key: str
    analysis_type: str = "assessment"  # assessment, meeting, qa


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


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


class GenogramRequest(BaseModel):
    text: str


class BodyMapRequest(BaseModel):
    text: str


# --- Endpoints ---

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """ヘルスチェック"""
    return HealthResponse(status="healthy", version="2.1.0")


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
async def analyze_audio(request: AnalyzeAudioRequest):
    """
    R2経由の分析（古いエンドポイント、互換性のために残すが、AI Serviceの改修により動作しない可能性あり）
    TODO: 必要ならAI Serviceの旧メソッド（_upload_to_geminiを使わない形）を復活させるか、ここを改修する
    今回はDirect Uploadがメインなので一旦Direct推奨
    """
    try:
        # R2からファイルを取得
        audio_data = storage_service.get_file(request.file_key)
        
        # MIME Typeは不明だが、通常音声
        mime_type = "audio/mp4"

        # 分析タイプに応じて処理
        if request.analysis_type == "assessment":
            result = ai_service.extract_assessment_info(audio_data, mime_type)
        elif request.analysis_type == "management_meeting":
            result = ai_service.generate_management_meeting_summary(audio_data, mime_type)
        elif request.analysis_type == "service_meeting":
            result = ai_service.generate_service_meeting_summary(audio_data, mime_type)
        elif request.analysis_type == "meeting":
            result = ai_service.generate_meeting_summary(audio_data, mime_type)
        elif request.analysis_type == "qa":
            result = ai_service.extract_qa_from_audio(audio_data, mime_type)
        else:
            raise ValueError(f"Unknown analysis type: {request.analysis_type}")
        
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


# ユニバーサル分析エンドポイント（名前は互換性のために analyze/audio/direct も残すか、Frontendを変える）
# Frontendを /api/analyze/direct に変更する方針で実装
from typing import List

# ユニバーサル分析エンドポイント（名前は互換性のために analyze/audio/direct も残すか、Frontendを変える）
# Frontendを /api/analyze/direct に変更する方針で実装
@app.post("/api/analyze/direct", response_model=AnalyzeResponse)
@app.post("/api/analyze/audio/direct", response_model=AnalyzeResponse) # 互換性エイリアス
async def analyze_file_direct(
    files: List[UploadFile] = File(...),
    analysis_type: str = Form("assessment")
):
    """
    ファイル直接分析（Universal Input、複数ファイル対応）
    - 音声、PDF、画像を受け入れ（複数可）
    - 運営会議/サービス会議ならDriveへ保存（全ファイル）
    - 全ファイルを統合して分析実行
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

            print(f"DEBUG: File {file.filename} size: {len(content)} bytes, Mime: {mime_type}", flush=True)
            file_contents.append((content, mime_type))

            # 1. Google Driveへの自動保存 (会議系のみ)
            if analysis_type in ["management_meeting", "service_meeting"]:
                folder_id = drive_service.get_folder_id_by_type(analysis_type)
                if folder_id:
                    print(f"DEBUG: Uploading to Drive Folder: {folder_id}", flush=True)
                    success, link = drive_service.upload_file(content, file.filename, mime_type, folder_id)
                    if success:
                        print(f"DEBUG: Drive Upload Success: {link}", flush=True)
                    else:
                        print("DEBUG: Drive Upload Failed", flush=True)
                else:
                    print(f"DEBUG: No folder ID configured for {analysis_type}, skipping upload", flush=True)

        # 2. 分析実行（統合分析）
        if analysis_type == "assessment":
            result = ai_service.extract_assessment_info(file_contents)
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
                result = sheets_service.write_service_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data_dict=request.data,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
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
