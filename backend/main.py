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

app = FastAPI(
    title="Kakanai API",
    description="介護業務DX バックエンドAPI",
    version="2.0.0"
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
    spreadsheet_id: str
    sheet_name: str
    data: Dict[str, Any]
    mapping_type: str = "assessment"
    # 会議用の追加フィールド
    write_mode: str = "mapping"  # "mapping" (fixed cell) or "append" (row append)
    meeting_type: str = ""  # "service_meeting" or "management_meeting"
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
    return HealthResponse(status="healthy", version="2.0.0")


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
        content = await file.read()
        file_key = storage_service.upload_file(
            file_data=content,
            filename=file.filename,
            content_type=file.content_type or "application/octet-stream"
        )
        return {"success": True, "file_key": file_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze/audio", response_model=AnalyzeResponse)
async def analyze_audio(request: AnalyzeAudioRequest):
    """
    音声ファイル分析（R2から取得して処理）
    """
    try:
        # R2からファイルを取得
        audio_data = storage_service.get_file(request.file_key)
        
        # 分析タイプに応じて処理
        if request.analysis_type == "assessment":
            result = ai_service.extract_assessment_from_audio(audio_data)
        elif request.analysis_type == "meeting":
            result = ai_service.generate_meeting_summary(audio_data)
        elif request.analysis_type == "qa":
            result = ai_service.extract_qa_from_audio(audio_data)
        else:
            raise ValueError(f"Unknown analysis type: {request.analysis_type}")
        
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/analyze/pdf", response_model=AnalyzeResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    """
    PDFファイル分析
    """
    try:
        content = await file.read()
        result = ai_service.extract_from_pdf(content, file.content_type)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/analyze/image", response_model=AnalyzeResponse)
async def analyze_image(file: UploadFile = File(...)):
    """
    画像ファイル（JPEG/PNG）分析
    """
    try:
        content = await file.read()
        # content_typeがない場合はファイル名から推測
        mime_type = file.content_type
        if not mime_type or mime_type == "application/octet-stream":
            filename = file.filename.lower() if file.filename else ""
            if filename.endswith(".jpg") or filename.endswith(".jpeg"):
                mime_type = "image/jpeg"
            elif filename.endswith(".png"):
                mime_type = "image/png"
            else:
                mime_type = "image/jpeg"  # デフォルト
        
        result = ai_service.extract_from_image(content, mime_type)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/sheets/write", response_model=AnalyzeResponse)
async def write_to_sheets(request: SheetsWriteRequest):
    """
    Googleスプレッドシートへの書き込み
    - write_mode="mapping": マッピングに基づく固定セル書き込み（アセスメントシート用）
    - write_mode="append": 行追加書き込み（会議用）
    """
    try:
        # 書き込みモードに応じて分岐
        if request.write_mode == "append":
            # 行追加モード（会議用）
            if request.meeting_type == "service_meeting":
                result = sheets_service.write_service_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data_dict=request.data,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
            elif request.meeting_type == "management_meeting":
                result = sheets_service.write_management_meeting_to_row(
                    spreadsheet_id=request.spreadsheet_id,
                    data=request.data,
                    date_str=request.date_str,
                    time_str=request.time_str,
                    place=request.place,
                    participants=request.participants,
                    sheet_name=request.sheet_name or "貼り付け用"
                )
            else:
                # デフォルトはサービス担当者会議形式
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
            # マッピングモード（アセスメントシート用 - 既存動作）
            written_count = sheets_service.write_data(
                spreadsheet_id=request.spreadsheet_id,
                sheet_name=request.sheet_name,
                data=request.data,
                mapping_type=request.mapping_type
            )
            return AnalyzeResponse(success=True, data={"written_cells": written_count})
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/genogram/generate", response_model=AnalyzeResponse)
async def generate_genogram(request: GenogramRequest):
    """
    ジェノグラムデータ生成
    """
    try:
        result = ai_service.generate_genogram_data(request.text)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


@app.post("/api/bodymap/generate", response_model=AnalyzeResponse)
async def generate_bodymap(request: BodyMapRequest):
    """
    身体図データ生成
    """
    try:
        result = ai_service.generate_bodymap_data(request.text)
        return AnalyzeResponse(success=True, data=result)
    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
