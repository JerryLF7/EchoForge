from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


RunStatus = Literal["pending", "processing", "completed", "failed"]
RunSource = Literal["feishu", "file"]


class EchoForgeModel(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)


class RunOutputs(EchoForgeModel):
    transcription: Path | None = None
    chapters: Path | None = None
    summarization: Path | None = None
    meeting_assistance: Path | None = None


class ObsidianNote(EchoForgeModel):
    note_path: Path | None = None
    rendered_at: datetime | None = None
    template: str | None = None


class RunRecord(EchoForgeModel):
    run_id: str
    source: RunSource
    title: str
    status: RunStatus = "pending"
    created_at: datetime
    completed_at: datetime | None = None
    minute_token: str | None = None
    tingwu_task_id: str | None = None
    tingwu_status: str | None = None
    media_path: Path | None = None
    media_url: str | None = None
    outputs: RunOutputs = Field(default_factory=RunOutputs)
    obsidian: ObsidianNote | None = None
    error_message: str | None = None


class StateDocument(EchoForgeModel):
    runs: dict[str, RunRecord] = Field(default_factory=dict)


class FeishuMinuteResult(EchoForgeModel):
    minute_token: str
    title: str
    minute_json_path: Path
    export_dir: Path
    media_path: Path | None = None
    media_url: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class TingwuTaskResult(EchoForgeModel):
    task_id: str
    status: str
    result_urls: dict[str, str] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
