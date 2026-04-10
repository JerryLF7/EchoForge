from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from echoforge.models import TingwuTaskResult
from echoforge.pipeline.orchestrator import Orchestrator
from echoforge.pipeline.uploader import TingwuInputResolver
from echoforge.renderers.obsidian import ObsidianRenderer
from echoforge.storage.artifacts import ArtifactManager
from echoforge.storage.state import StateStore


class FakeProvider:
    def create_task(self, file_url: str, title: str | None = None) -> str:
        self.file_url = file_url
        self.title = title
        return "task-123"

    def wait_for_completion(self, task_id: str) -> TingwuTaskResult:
        return TingwuTaskResult(
            task_id=task_id,
            status="completed",
            result_urls={
                "transcription": "https://example.com/transcription.json",
                "summarization": "https://example.com/summarization.json",
            },
        )

    def download_results(self, result_urls: dict[str, str], output_dir: Path) -> dict[str, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        transcription = output_dir / "transcription.json"
        summarization = output_dir / "summarization.json"
        transcription.write_text(json.dumps({"Transcription": {"Utterances": []}}), encoding="utf-8")
        summarization.write_text(json.dumps({"ParagraphSummary": "摘要"}), encoding="utf-8")
        return {
            "transcription": transcription,
            "summarization": summarization,
        }


class StaticResolver(TingwuInputResolver):
    def resolve(self, file_path: Path, media_url: str | None = None, run_id: str | None = None) -> tuple[str, str | None]:
        return media_url or "https://example.com/audio.ogg", None


def test_orchestrator_processes_file_and_updates_state(settings, tmp_path: Path) -> None:
    artifact_manager = ArtifactManager(settings.outputs_dir)
    state_store = StateStore(settings.outputs_dir / "runs.json")
    renderer = ObsidianRenderer()
    provider = FakeProvider()
    orchestrator = Orchestrator(
        settings,
        state_store,
        artifact_manager,
        provider=provider,
        renderer=renderer,
        input_resolver=StaticResolver(),
    )

    audio_file = tmp_path / "meeting.ogg"
    audio_file.write_bytes(b"audio")
    vault = tmp_path / "vault"

    run = orchestrator.run_file(audio_file, output_vault=vault, media_url="https://example.com/audio.ogg")
    stored = state_store.get_run(run.run_id)

    assert run.status == "completed"
    assert stored.obsidian is not None
    assert Path(stored.obsidian.note_path).exists()
    assert provider.file_url == "https://example.com/audio.ogg"
