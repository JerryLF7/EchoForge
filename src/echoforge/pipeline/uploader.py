from __future__ import annotations

from pathlib import Path

from echoforge.errors import TingwuUploadError


class TingwuInputResolver:
    def resolve(self, file_path: Path, media_url: str | None = None) -> str:
        if media_url and media_url.startswith(("http://", "https://")):
            return media_url
        raise TingwuUploadError(
            "Tingwu offline tasks require Input.FileUrl to be a public HTTP or HTTPS URL. "
            f"Local file paths like '{file_path}' cannot be submitted directly. "
            "Pass --media-url or provide a source that already exposes a downloadable URL."
        )
