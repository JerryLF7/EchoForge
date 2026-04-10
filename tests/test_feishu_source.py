from __future__ import annotations

import json
import subprocess
from pathlib import Path

from echoforge.sources.feishu import FeishuSource


class FakeRunner:
    def __call__(self, args: list[str], capture_output: bool, text: bool, check: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")


def test_fetch_reads_manifest_and_media(settings, tmp_path: Path) -> None:
    export_dir = settings.feishu_minutes_sync_exports_dir / "minute-1"
    export_dir.mkdir(parents=True)
    (export_dir / "minute.json").write_text(
        json.dumps({"title": "周会", "audio_url": "https://example.com/audio.ogg"}),
        encoding="utf-8",
    )
    (export_dir / "audio.ogg").write_bytes(b"audio")

    source = FeishuSource(settings, runner=FakeRunner())
    result = source.fetch("minute-1")

    assert result.title == "周会"
    assert result.media_path == export_dir / "audio.ogg"
    assert result.media_url == "https://example.com/audio.ogg"
