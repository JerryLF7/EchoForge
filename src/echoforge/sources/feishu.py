from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from shutil import copy2
from typing import Any

from config.settings import Settings
from echoforge.errors import ConfigMissingError, EchoForgeError, FeishuNotFoundError, FeishuPermissionError
from echoforge.models import FeishuMinuteResult


class FeishuSource:
    def __init__(self, settings: Settings, runner: Any = None) -> None:
        self.settings = settings
        self.runner = runner or subprocess.run

    def ensure_cli_available(self) -> bool:
        binary = self.settings.feishu_minutes_sync_bin
        if "/" in binary:
            return Path(binary).expanduser().exists()
        return shutil.which(binary) is not None

    def fetch(self, minute_token: str) -> FeishuMinuteResult:
        if not self.ensure_cli_available():
            raise ConfigMissingError(
                f"Feishu CLI not found: {self.settings.feishu_minutes_sync_bin}"
            )
        self._run_cli("fetch-minute", minute_token, extra_args=["--export", "--download-media"])
        minute_json_path = self._minute_json_path(minute_token)
        if not minute_json_path.exists():
            raise FeishuNotFoundError(f"Expected minute manifest not found: {minute_json_path}")
        raw = json.loads(minute_json_path.read_text(encoding="utf-8"))
        export_dir = minute_json_path.parent
        media_path = self._find_media_file(export_dir)
        # If no media file found in export dir, try minute.json's media_path field
        if media_path is None:
            raw_media = raw.get("media_path")
            if raw_media:
                candidate = Path(raw_media)
                if candidate.is_absolute():
                    media_path = candidate
                else:
                    # Relative to the feishu project dir (config parent) or export dir
                    config_path = self.settings.feishu_minutes_sync_config_path
                    if config_path is not None:
                        candidate = config_path.expanduser().resolve().parent / raw_media
                        if candidate.exists():
                            media_path = candidate
        return FeishuMinuteResult(
            minute_token=minute_token,
            title=self._extract_title(raw, minute_token),
            minute_json_path=minute_json_path,
            export_dir=export_dir,
            media_path=media_path,
            media_url=None,
            raw=raw,
        )

    def download_media(self, minute_token: str, output_dir: Path) -> Path:
        if not self.ensure_cli_available():
            raise ConfigMissingError(
                f"Feishu CLI not found: {self.settings.feishu_minutes_sync_bin}"
            )
        self._run_cli("download-media", minute_token)
        export_dir = self._export_dir(minute_token)
        media_path = self._find_media_file(export_dir)
        if media_path is None:
            raise EchoForgeError(f"No downloaded media found in {export_dir}")
        output_dir.mkdir(parents=True, exist_ok=True)
        destination = output_dir / media_path.name
        if media_path.resolve() != destination.resolve():
            copy2(media_path, destination)
        return destination

    def _run_cli(self, command: str, minute_token: str, extra_args: list[str] | None = None) -> None:
        cmd = [self.settings.feishu_minutes_sync_bin]
        cwd = None
        config_path = self.settings.feishu_minutes_sync_config_path
        if config_path is not None:
            resolved_config = config_path.expanduser().resolve()
            cmd.extend(["--config", str(resolved_config)])
            cwd = str(resolved_config.parent)
        cmd.extend([command, "--token", minute_token])
        if extra_args:
            cmd.extend(extra_args)
        result = self.runner(cmd,
            capture_output=True,
            text=True,
            check=False,
            cwd=cwd,
        )
        if result.returncode == 0:
            return
        stderr = (result.stderr or "").lower()
        if "permission" in stderr or "403" in stderr:
            raise FeishuPermissionError(result.stderr.strip() or minute_token)
        if "not found" in stderr or "404" in stderr:
            raise FeishuNotFoundError(result.stderr.strip() or minute_token)
        raise EchoForgeError(result.stderr.strip() or f"Feishu CLI failed for {minute_token}")

    def _export_dir(self, minute_token: str) -> Path:
        return self.settings.resolved_feishu_exports_dir() / minute_token

    def _minute_json_path(self, minute_token: str) -> Path:
        return self._export_dir(minute_token) / "minute.json"

    def _find_media_file(self, export_dir: Path) -> Path | None:
        candidates: list[Path] = []
        for extension in ("*.mp3", "*.m4a", "*.mp4", "*.aac", "*.wav", "*.ogg", "*.flac"):
            candidates.extend(sorted(export_dir.glob(extension)))
        return candidates[0] if candidates else None

    def _extract_title(self, raw: dict[str, Any], fallback: str) -> str:
        for key in ("title", "name", "topic", "meeting_title"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return fallback

    def _extract_media_url(self, raw: dict[str, Any]) -> str | None:
        keys = {"audio_url", "audioUrl", "file_url", "fileUrl", "media_url", "mediaUrl", "download_url", "downloadUrl"}

        def walk(value: Any) -> str | None:
            if isinstance(value, dict):
                for key, nested in value.items():
                    if key in keys and isinstance(nested, str) and nested.startswith(("http://", "https://")):
                        return nested
                    found = walk(nested)
                    if found is not None:
                        return found
            elif isinstance(value, list):
                for nested in value:
                    found = walk(nested)
                    if found is not None:
                        return found
            return None

        return walk(raw)
