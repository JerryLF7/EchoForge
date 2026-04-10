from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader

from echoforge.errors import ObsidianWriteError
from echoforge.models import RunRecord
from echoforge.storage.artifacts import sanitize_title


class ObsidianRenderer:
    def __init__(self, template_dir: Path | None = None) -> None:
        resolved_template_dir = template_dir or Path(__file__).with_name("templates")
        self.environment = Environment(
            loader=FileSystemLoader(str(resolved_template_dir)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
        )

    def render_to_run(self, run: RunRecord, *, vault_path: Path, template: str = "full") -> Path:
        context = self._build_context(run)
        body = self.environment.get_template(f"{template}.md.j2").render(**context).strip()
        note_dir = vault_path / "meetings"
        note_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"{run.created_at.date().isoformat()}-{sanitize_title(run.title)}.md"
        note_path = note_dir / file_name
        document = f"{self._build_front_matter(run)}\n{body}\n"
        try:
            note_path.write_text(document, encoding="utf-8")
        except OSError as exc:
            raise ObsidianWriteError(f"Failed to write Obsidian note: {note_path}") from exc
        return note_path

    def _build_context(self, run: RunRecord) -> dict[str, Any]:
        transcription = self._load_json(run.outputs.transcription)
        chapters = self._load_json(run.outputs.chapters)
        summarization = self._load_json(run.outputs.summarization)
        meeting_assistance = self._load_json(run.outputs.meeting_assistance)
        return {
            "title": run.title,
            "source_label": "Feishu Minutes" if run.source == "feishu" else "Local File",
            "created_at": run.created_at.astimezone().strftime("%Y-%m-%d %H:%M"),
            "generated_at": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
            "chapters": self._chapters_context(chapters),
            "paragraph_summary": summarization.get("ParagraphSummary", ""),
            "speakers": self._speaker_summaries(summarization),
            "qa_pairs": summarization.get("QaPairs", []),
            "actions": meeting_assistance.get("Actions", []),
            "key_information": meeting_assistance.get("KeyInformation", []),
            "utterances": transcription.get("Transcription", {}).get("Utterances", []),
        }

    def _build_front_matter(self, run: RunRecord) -> str:
        tags = ["meetings", "feishu-minutes" if run.source == "feishu" else "local-audio"]
        lines = ["---", f"uid: {run.run_id}", f"source: {run.source}"]
        if run.minute_token:
            lines.append(f"minute_token: {run.minute_token}")
        lines.append(f"created: {run.created_at.date().isoformat()}")
        lines.append("tags:")
        for tag in tags:
            lines.append(f"  - {tag}")
        lines.append("---")
        return "\n".join(lines)

    def _load_json(self, path: Path | None) -> dict[str, Any]:
        if path is None or not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def _chapters_context(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        chapters = payload.get("AutoChapters", [])
        result: list[dict[str, Any]] = []
        for chapter in chapters:
            result.append(
                {
                    "title": chapter.get("ChapterTitle", "Untitled"),
                    "summary": chapter.get("Summary", ""),
                    "start_label": self._format_millis(chapter.get("StartTime")),
                    "end_label": self._format_millis(chapter.get("EndTime")),
                }
            )
        return result

    def _speaker_summaries(self, payload: dict[str, Any]) -> list[dict[str, str]]:
        summaries = payload.get("ConversationalSummary", [])
        result: list[dict[str, str]] = []
        for item in summaries:
            speaker_id = item.get("SpeakerId") or "speaker"
            result.append({"name": speaker_id, "summary": item.get("Summary", "")})
        return result

    def _format_millis(self, value: Any) -> str:
        try:
            total_seconds = int(value or 0) // 1000
        except (TypeError, ValueError):
            total_seconds = 0
        minutes, seconds = divmod(total_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"


def sanitize_markdown_heading(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
