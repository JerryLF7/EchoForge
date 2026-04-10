from __future__ import annotations

from pathlib import Path

from echoforge.errors import TingwuUploadError
from echoforge.storage.r2_client import R2Client


class TingwuInputResolver:
    def __init__(self, r2_client: R2Client | None = None) -> None:
        self.r2_client = r2_client

    def resolve(self, file_path: Path, media_url: str | None = None, run_id: str | None = None) -> tuple[str, str | None]:
        if media_url and media_url.startswith(("http://", "https://")):
            return media_url, None

        if self.r2_client is not None and run_id is not None:
            object_key = f"echoforge/{run_id}/{file_path.name}"
            self.r2_client.upload_file(file_path, object_key)
            presigned_url = self.r2_client.generate_presigned_url(object_key)
            return presigned_url, object_key

        raise TingwuUploadError(
            "Tingwu offline tasks require Input.FileUrl to be a public HTTP or HTTPS URL. "
            f"Local file paths like '{file_path}' cannot be submitted directly. "
            "Pass --media-url, configure R2 transit, or provide a source that already exposes a downloadable URL."
        )
