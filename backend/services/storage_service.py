"""
Storage Service - Cloudflare R2統合
"""
import boto3
from botocore.config import Config
import os
import uuid
from datetime import datetime
from typing import Dict, Any


class StorageService:
    def __init__(self):
        self.account_id = os.getenv("R2_ACCOUNT_ID")
        self.access_key_id = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME", "kakanai-uploads")
        
        if self.account_id and self.access_key_id and self.secret_access_key:
            self.s3_client = boto3.client(
                "s3",
                endpoint_url=f"https://{self.account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                config=Config(signature_version="s3v4"),
                region_name="auto"
            )
        else:
            self.s3_client = None
    
    def generate_presigned_url(self, filename: str, content_type: str) -> Dict[str, str]:
        """
        R2へのダイレクトアップロード用署名付きURL発行
        """
        if not self.s3_client:
            raise ValueError("R2 credentials not configured")
        
        # ユニークなファイルキーを生成
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        ext = filename.split(".")[-1] if "." in filename else ""
        file_key = f"uploads/{timestamp}_{unique_id}.{ext}"
        
        # 署名付きURLを生成（60分有効）
        presigned_url = self.s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": file_key,
                "ContentType": content_type
            },
            ExpiresIn=3600
        )
        
        return {
            "upload_url": presigned_url,
            "file_key": file_key
        }
    
    def get_file(self, file_key: str) -> bytes:
        """
        R2からファイルを取得
        """
        if not self.s3_client:
            raise ValueError("R2 credentials not configured")
        
        response = self.s3_client.get_object(
            Bucket=self.bucket_name,
            Key=file_key
        )
        return response["Body"].read()
    
    def delete_file(self, file_key: str) -> bool:
        """
        R2からファイルを削除
        """
        if not self.s3_client:
            raise ValueError("R2 credentials not configured")
        
        self.s3_client.delete_object(
            Bucket=self.bucket_name,
            Key=file_key
        )
        return True
    
    def get_download_url(self, file_key: str, expires_in: int = 3600) -> str:
        """
        R2からのダウンロード用署名付きURL発行
        """
        if not self.s3_client:
            raise ValueError("R2 credentials not configured")
        
        return self.s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": file_key
            },
            ExpiresIn=expires_in
        )
