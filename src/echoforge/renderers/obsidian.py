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

    def render_transcript_only(
        self,
        *,
        transcription_path: Path,
        vault_path: Path,
        title: str,
        note_name: str | None = None,
        source_label: str = "Imported Transcript",
        created_at_label: str | None = None,
    ) -> Path:
        transcription = self._load_json(transcription_path)
        if self._is_doubao_transcription(transcription):
            transcription = self._normalize_doubao_transcription(transcription)
        safe_name = sanitize_title(note_name or title)
        context = self._build_transcript_context(
            title=title,
            source_label=source_label,
            created_at=created_at_label or datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
            generated_at=datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
            duration=self._format_millis(transcription.get("Transcription", {}).get("AudioInfo", {}).get("Duration", 0)),
            note_name=safe_name,
            utterances=self._transcript_utterances(transcription),
        )
        body = self.environment.get_template("transcript.md.j2").render(**context).strip()
        transcript_dir = vault_path / "meetings" / "Transcripts"
        transcript_dir.mkdir(parents=True, exist_ok=True)
        transcript_path = transcript_dir / f"{safe_name}.md"
        try:
            transcript_path.write_text(body + "\n", encoding="utf-8")
        except OSError as exc:
            raise ObsidianWriteError(f"Failed to write transcript: {transcript_path}") from exc
        return transcript_path

    def render(self, run: RunRecord, *, vault_path: Path, template: str = "full") -> tuple[Path, Path]:
        """Render both the summary note (B) and the transcript (A), then update index."""
        base_name = self._base_name(run)
        transcript_name = f"{base_name}-transcript"

        # 1. Build shared data
        transcription = self._load_json(run.outputs.transcription)
        chapters_payload = self._load_json(run.outputs.chapters)
        summarization = self._load_json(run.outputs.summarization)
        meeting_assistance = self._load_json(run.outputs.meeting_assistance)

        if self._is_doubao_transcription(transcription):
            transcription = self._normalize_doubao_transcription(transcription)
            chapters_payload = self._normalize_doubao_chapters(chapters_payload)
            summarization = self._normalize_doubao_summarization(summarization)
            meeting_assistance = self._normalize_doubao_meeting_assistance(meeting_assistance)

        # 2. Render transcript (A)
        transcript_path = self._render_transcript(
            run, vault_path=vault_path, name=transcript_name, transcription=transcription
        )

        # 3. Resolve chapter anchors against transcript paragraphs
        anchors = self._resolve_chapter_anchors(chapters_payload, transcription)

        # 4. Render summary note (B)
        note_path = self._render_minutes(
            run,
            vault_path=vault_path,
            template=template,
            base_name=base_name,
            transcript_name=transcript_name,
            transcription=transcription,
            chapters_payload=chapters_payload,
            summarization=summarization,
            meeting_assistance=meeting_assistance,
            anchors=anchors,
        )

        # 5. Update index
        self._update_index(run, vault_path=vault_path, note_name=base_name)

        return note_path, transcript_path

    # Kept for backward-compat; new code should call .render()
    def render_to_run(self, run: RunRecord, *, vault_path: Path, template: str = "full") -> Path:
        note_path, _ = self.render(run, vault_path=vault_path, template=template)
        return note_path

    def _base_name(self, run: RunRecord) -> str:
        return f"{run.created_at.date().isoformat()}-{sanitize_title(run.title)}"

    def _render_transcript(
        self,
        run: RunRecord,
        *,
        vault_path: Path,
        name: str,
        transcription: dict[str, Any],
    ) -> Path:
        if self._is_doubao_transcription(transcription):
            transcription = self._normalize_doubao_transcription(transcription)
        context = self._build_transcript_context(
            title=run.title,
            source_label="Feishu Minutes" if run.source == "feishu" else "Local File",
            created_at=run.created_at.astimezone().strftime("%Y-%m-%d %H:%M"),
            generated_at=datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
            duration=self._format_millis(transcription.get("Transcription", {}).get("AudioInfo", {}).get("Duration", 0)),
            note_name=self._base_name(run),
            utterances=self._transcript_utterances(transcription),
        )

        body = self.environment.get_template("transcript.md.j2").render(**context).strip()
        transcript_dir = vault_path / "meetings" / "Transcripts"
        transcript_dir.mkdir(parents=True, exist_ok=True)
        transcript_path = transcript_dir / f"{name}.md"
        try:
            transcript_path.write_text(body + "\n", encoding="utf-8")
        except OSError as exc:
            raise ObsidianWriteError(f"Failed to write transcript: {transcript_path}") from exc
        return transcript_path

    def _resolve_chapter_anchors(
        self,
        chapters_payload: dict[str, Any],
        transcription: dict[str, Any],
    ) -> dict[int, str]:
        """Map each chapter index to the closest transcript paragraph anchor."""
        paragraphs = transcription.get("Transcription", {}).get("Paragraphs", [])
        paragraph_starts: list[int] = []
        for para in paragraphs:
            words = para.get("Words", [])
            paragraph_starts.append(words[0].get("Start", 0) if words else 0)

        anchors: dict[int, str] = {}
        for idx, chapter in enumerate(chapters_payload.get("AutoChapters", [])):
            chapter_start = chapter.get("StartTime", 0)
            best_idx = 0
            best_diff = abs(paragraph_starts[0] - chapter_start) if paragraph_starts else 0
            for pidx, pstart in enumerate(paragraph_starts[1:], 1):
                diff = abs(pstart - chapter_start)
                if diff < best_diff:
                    best_diff = diff
                    best_idx = pidx
            anchors[idx] = f"ef-{best_idx:03d}"
        return anchors

    def _render_minutes(
        self,
        run: RunRecord,
        *,
        vault_path: Path,
        template: str,
        base_name: str,
        transcript_name: str,
        transcription: dict[str, Any],
        chapters_payload: dict[str, Any],
        summarization: dict[str, Any],
        meeting_assistance: dict[str, Any],
        anchors: dict[int, str],
    ) -> Path:
        chapters = self._chapters_context(chapters_payload, anchors)
        duration_ms = transcription.get("Transcription", {}).get("AudioInfo", {}).get("Duration", 0)

        context = {
            "title": run.title,
            "source_label": "Feishu Minutes" if run.source == "feishu" else "Local File",
            "created_at": run.created_at.astimezone().strftime("%Y-%m-%d %H:%M"),
            "generated_at": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
            "duration": self._format_millis(duration_ms),
            "transcript_name": transcript_name,
            "chapters": chapters,
            "paragraph_summary": summarization.get("ParagraphSummary", ""),
            "speakers": self._speaker_summaries(summarization),
            "qa_pairs": summarization.get("QaPairs", []),
            "actions": meeting_assistance.get("Actions", []),
            "key_information": meeting_assistance.get("KeyInformation", []),
        }

        body = self.environment.get_template(f"{template}.md.j2").render(**context).strip()
        note_dir = vault_path / "meetings"
        note_dir.mkdir(parents=True, exist_ok=True)
        note_path = note_dir / f"{base_name}.md"
        document = f"{self._build_front_matter(run)}\n{body}\n"
        try:
            note_path.write_text(document, encoding="utf-8")
        except OSError as exc:
            raise ObsidianWriteError(f"Failed to write Obsidian note: {note_path}") from exc
        return note_path

    def _update_index(self, run: RunRecord, *, vault_path: Path, note_name: str) -> None:
        index_path = vault_path / "EchoForge Index.md"
        entry = f"- [[{note_name}|{run.title}]] — {run.created_at.date().isoformat()}"
        header = "# EchoForge 录音索引\n\n"
        if index_path.exists():
            content = index_path.read_text(encoding="utf-8")
            if entry not in content:
                content = content.rstrip("\n") + "\n" + entry + "\n"
                index_path.write_text(content, encoding="utf-8")
        else:
            index_path.write_text(header + entry + "\n", encoding="utf-8")

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
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return {"_raw_list": data}
        return data

    def _is_doubao_transcription(self, transcription: dict[str, Any]) -> bool:
        return "_raw_list" in transcription and isinstance(transcription["_raw_list"], list)

    def _normalize_doubao_transcription(self, transcription: dict[str, Any]) -> dict[str, Any]:
        raw = transcription.get("_raw_list", [])
        if not raw:
            return {}
        last = raw[-1]
        duration = last.get("end_time", 0)
        paragraphs = []
        for sentence in raw:
            words = sentence.get("words", [])
            paragraph_words = [
                {"Text": w.get("content", ""), "Start": w.get("start_time", 0)}
                for w in words
            ]
            speaker = sentence.get("speaker", {})
            paragraphs.append({
                "Words": paragraph_words,
                "SpeakerId": speaker.get("id", "Unknown"),
            })
        return {
            "Transcription": {
                "AudioInfo": {"Duration": duration},
                "Paragraphs": paragraphs,
            }
        }

    def _normalize_doubao_chapters(self, chapters_payload: dict[str, Any]) -> dict[str, Any]:
        if "chapter_summary" in chapters_payload:
            return {"AutoChapters": chapters_payload.get("chapter_summary", [])}
        return chapters_payload

    def _normalize_doubao_summarization(self, summarization: dict[str, Any]) -> dict[str, Any]:
        if "paragraph" in summarization:
            return {
                "ParagraphSummary": summarization.get("paragraph", ""),
                "QaPairs": [],
                "ConversationalSummary": [],
            }
        return summarization

    def _normalize_doubao_meeting_assistance(self, meeting_assistance: dict[str, Any]) -> dict[str, Any]:
        if "question_answer" in meeting_assistance or "todo_list" in meeting_assistance:
            return {
                "Actions": meeting_assistance.get("todo_list", []),
                "KeyInformation": [],
            }
        return meeting_assistance

    def _chapters_context(
        self, payload: dict[str, Any], anchors: dict[int, str]
    ) -> list[dict[str, Any]]:
        chapters = payload.get("AutoChapters", [])
        result: list[dict[str, Any]] = []
        for idx, chapter in enumerate(chapters):
            result.append(
                {
                    "title": chapter.get("Headline") or chapter.get("ChapterTitle", "Untitled"),
                    "summary": chapter.get("Summary", ""),
                    "start_label": self._format_millis(chapter.get("StartTime") or chapter.get("Start")),
                    "end_label": self._format_millis(chapter.get("EndTime") or chapter.get("End")),
                    "anchor": anchors.get(idx, ""),
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

    def _transcript_utterances(self, transcription: dict[str, Any]) -> list[dict[str, Any]]:
        paragraphs = transcription.get("Transcription", {}).get("Paragraphs", [])
        utterances: list[dict[str, Any]] = []
        for idx, para in enumerate(paragraphs):
            words = para.get("Words", [])
            if not words:
                continue
            start_ms = words[0].get("Start", 0)
            text = "".join(str(w.get("Text", "")) for w in words)
            speaker_id = para.get("SpeakerId", "Unknown")
            utterances.append(
                {
                    "time_label": self._format_millis(start_ms),
                    "speaker": self._format_speaker_label(speaker_id),
                    "text": text,
                    "anchor": f"ef-{idx:03d}",
                }
            )
        return utterances

    def _build_transcript_context(
        self,
        *,
        title: str,
        source_label: str,
        created_at: str,
        generated_at: str,
        duration: str,
        note_name: str,
        utterances: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "title": title,
            "source_label": source_label,
            "created_at": created_at,
            "generated_at": generated_at,
            "duration": duration,
            "note_name": note_name,
            "utterances": utterances,
        }

    def _format_speaker_label(self, speaker_id: Any) -> str:
        text = str(speaker_id or "Unknown").strip()
        if text in {"字幕", "caption", "captions", "subtitle", "subtitles"}:
            return "字幕"
        if text.startswith("说话人 "):
            return text
        return f"说话人 {text}"

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
