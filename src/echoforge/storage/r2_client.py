from __future__ import annotations

from pathlib import Path
from typing import Any

from config.settings import Settings
from echoforge.errors import ConfigMissingError, R2CleanupError, R2PresignError, R2UploadError


class R2Client:
    """Cloudflare R2 S3-compatible client for temporary audio transit."""

    def __init__(self, settings: Settings, s3_client: Any | None = None) -> None:
        self.bucket = settings.r2_bucket_name
        self.expiry = settings.r2_presigned_expiry

        if not settings.r2_account_id:
            raise ConfigMissingError("R2_ACCOUNT_ID is required")
        if not settings.r2_access_key_id:
            raise ConfigMissingError("R2_ACCESS_KEY_ID is required")
        if not settings.r2_secret_access_key:
            raise ConfigMissingError("R2_SECRET_ACCESS_KEY is required")
        if not self.bucket:
            raise ConfigMissingError("R2_BUCKET_NAME is required")

        if s3_client is not None:
            self._client = s3_client
        else:
            try:
                import boto3
                from botocore.config import Config as BotoConfig
            except ImportError as exc:
                raise ConfigMissingError("Install boto3 to use R2 transit") from exc

            endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
            self._client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
                config=BotoConfig(signature_version="s3v4"),
            )

    def upload_file(self, file_path: Path, object_key: str) -> str:
        try:
            self._client.upload_file(str(file_path), self.bucket, object_key)
        except Exception as exc:
            raise R2UploadError(f"Failed to upload {file_path} to R2: {exc}") from exc
        return object_key

    def generate_presigned_url(self, object_key: str, expiry: int | None = None) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": object_key},
                ExpiresIn=expiry or self.expiry,
            )
        except Exception as exc:
            raise R2PresignError(f"Failed to generate presigned URL for {object_key}: {exc}") from exc

    def delete_object(self, object_key: str) -> None:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=object_key)
        except Exception as exc:
            raise R2CleanupError(f"Failed to delete {object_key} from R2: {exc}") from exc
