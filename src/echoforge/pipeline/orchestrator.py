from __future__ import annotations

import json
import secrets
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from config.settings import Settings
from echoforge.errors import ConfigMissingError, EchoForgeError, R2CleanupError
from echoforge.models import ObsidianNote, RunRecord, utc_now
from echoforge.storage.artifacts import ArtifactManager
from echoforge.storage.r2_client import R2Client
from echoforge.storage.state import StateStore


class Orchestrator:
    def __init__(
        self,
        settings: Settings,
        state_store: StateStore,
        artifacts: ArtifactManager,
        *,
        provider: Any | None = None,
        renderer: Any,
        feishu_source: Any | None = None,
        input_resolver: Any | None = None,
        r2_client: R2Client | None = None,
    ) -> None:
        self.settings = settings
        self.state_store = state_store
        self.artifacts = artifacts
        self.provider = provider
        self.renderer = renderer
        self.feishu_source = feishu_source
        self.input_resolver = input_resolver
        self.r2_client = r2_client

    def run_feishu(
        self,
        minute_token: str,
        *,
        output_vault: Path | None = None,
        template: str | None = None,
        skip_render: bool = False,
        force: bool = False,
        media_url: str | None = None,
    ) -> RunRecord:
        if self.feishu_source is None:
            raise ConfigMissingError("Feishu source is not configured")
        if not force:
            existing = self.state_store.find_latest_by_minute_token(minute_token)
            if existing is not None and existing.status == "completed":
                return existing

        run = self._new_run(source="feishu", title=minute_token, minute_token=minute_token)
        self._persist_run(run)
        fetched = self.feishu_source.fetch(minute_token)
        run.title = fetched.title
        self._persist_run(run)
        source_media = fetched.media_path
        if source_media is None:
            source_media = self.feishu_source.download_media(minute_token, self.artifacts.run_dir(run.run_id))
        staged_media = self.artifacts.stage_media(run.run_id, source_media)
        return self._process_understanding(
            run,
            staged_media=staged_media,
            media_url=media_url or fetched.media_url,
            output_vault=output_vault,
            template=template,
            skip_render=skip_render,
        )

    def run_file(
        self,
        file_path: Path,
        *,
        output_vault: Path | None = None,
        template: str | None = None,
        title: str | None = None,
        skip_render: bool = False,
        force: bool = False,
        media_url: str | None = None,
    ) -> RunRecord:
        resolved_file = file_path.expanduser().resolve()
        if not resolved_file.exists():
            raise EchoForgeError(f"File not found: {resolved_file}")
        if not force:
            existing = self.state_store.find_latest_by_media_path(resolved_file)
            if existing is not None and existing.status == "completed":
                return existing

        run = self._new_run(source="file", title=title or resolved_file.stem)
        self._persist_run(run)
        staged_media = self.artifacts.stage_media(run.run_id, resolved_file)
        return self._process_understanding(
            run,
            staged_media=staged_media,
            media_url=media_url,
            output_vault=output_vault,
            template=template,
            skip_render=skip_render,
        )

    def render_only(
        self,
        run_id: str,
        *,
        template: str | None = None,
        output_vault: Path | None = None,
    ) -> Path:
        run = self.state_store.get_run(run_id)
        vault = self._resolve_vault(output_vault)
        if vault is None:
            raise ConfigMissingError("No Obsidian vault configured")
        selected_template = template or self.settings.default_template
        note_path = self.renderer.render_to_run(run, vault_path=vault, template=selected_template)
        run.obsidian = ObsidianNote(
            note_path=note_path,
            rendered_at=utc_now(),
            template=selected_template,
        )
        self._persist_run(run)
        return note_path

    def _process_understanding(
        self,
        run: RunRecord,
        *,
        staged_media: Path,
        media_url: str | None,
        output_vault: Path | None,
        template: str | None,
        skip_render: bool,
    ) -> RunRecord:
        if self.provider is None:
            raise ConfigMissingError("Understanding provider is not configured")
        if self.input_resolver is None:
            raise ConfigMissingError("Tingwu input resolver is not configured")

        try:
            run.media_path = staged_media
            self._persist_run(run)

            # --- detect long audio and split if needed ----------------
            duration_sec = self._get_audio_duration(staged_media)
            if duration_sec > self._MAX_SEGMENT_SECONDS:
                segments = self._split_audio(staged_media, run.run_id)
                offsets_ms: list[int] = []
                current_offset_ms = 0
                all_transcriptions: list[Path] = []
                all_chapters: list[Path] = []
                all_summarizations: list[Path] = []
                all_meeting_assistances: list[Path] = []

                for idx, segment_path in enumerate(segments):
                    offsets_ms.append(current_offset_ms)
                    seg_dur_ms = int(self._get_audio_duration(segment_path) * 1000)
                    downloaded = self._process_segment(run, segment_path, current_offset_ms)
                    current_offset_ms += seg_dur_ms

                    if "transcription" in downloaded:
                        all_transcriptions.append(downloaded["transcription"])
                    if "chapters" in downloaded:
                        all_chapters.append(downloaded["chapters"])
                    if "summarization" in downloaded:
                        all_summarizations.append(downloaded["summarization"])
                    if "meeting_assistance" in downloaded:
                        all_meeting_assistances.append(downloaded["meeting_assistance"])

                results_dir = self.artifacts.results_dir(run.run_id)
                if all_transcriptions:
                    self._merge_transcriptions(
                        all_transcriptions, offsets_ms, results_dir / "transcription.json",
                    )
                    run.outputs.transcription = results_dir / "transcription.json"
                if all_chapters:
                    self._merge_chapters(
                        all_chapters, offsets_ms, results_dir / "chapters.json",
                    )
                    run.outputs.chapters = results_dir / "chapters.json"
                if all_summarizations:
                    self._select_best_file(all_summarizations, results_dir / "summarization.json")
                    run.outputs.summarization = results_dir / "summarization.json"
                if all_meeting_assistances:
                    self._select_best_file(
                        all_meeting_assistances, results_dir / "meeting_assistance.json",
                    )
                    run.outputs.meeting_assistance = results_dir / "meeting_assistance.json"

                run.status = "completed"
                run.completed_at = utc_now()
                self._persist_run(run)

                if not skip_render:
                    vault = self._resolve_vault(output_vault)
                    if vault is not None:
                        selected_template = template or self.settings.default_template
                        note_path = self.renderer.render_to_run(run, vault_path=vault, template=selected_template)
                        run.obsidian = ObsidianNote(
                            note_path=note_path,
                            rendered_at=utc_now(),
                            template=selected_template,
                        )
                        self._persist_run(run)
                return run

            # --- original single-file flow ----------------------------
            resolved_media_url, r2_object_key = self.input_resolver.resolve(staged_media, media_url, run_id=run.run_id)
            run.media_url = resolved_media_url
            if r2_object_key:
                run.r2_object_key = r2_object_key
            self._persist_run(run)
            task_id = self.provider.create_task(file_url=resolved_media_url, title=run.title)
            run.tingwu_task_id = task_id
            run.status = "processing"
            run.tingwu_status = "pending"
            self._persist_run(run)

            task_result = self.provider.wait_for_completion(task_id)
            run.tingwu_status = task_result.status
            downloaded = self.provider.download_results(task_result.result_urls, self.artifacts.results_dir(run.run_id))
            self._apply_outputs(run, downloaded)
            run.status = "completed"
            run.completed_at = utc_now()
            self._persist_run(run)

            if not skip_render:
                vault = self._resolve_vault(output_vault)
                if vault is not None:
                    selected_template = template or self.settings.default_template
                    note_path = self.renderer.render_to_run(run, vault_path=vault, template=selected_template)
                    run.obsidian = ObsidianNote(
                        note_path=note_path,
                        rendered_at=utc_now(),
                        template=selected_template,
                    )
                    self._persist_run(run)

            if run.r2_object_key and self.r2_client:
                try:
                    self.r2_client.delete_object(run.r2_object_key)
                    run.media_cleaned = True
                except R2CleanupError:
                    run.media_cleaned = False
                self._persist_run(run)

            return run
        except EchoForgeError as exc:
            run.status = "failed"
            run.completed_at = utc_now()
            run.error_message = str(exc)
            self._persist_run(run)
            if run.r2_object_key and self.r2_client:
                try:
                    self.r2_client.delete_object(run.r2_object_key)
                    run.media_cleaned = True
                except R2CleanupError:
                    run.media_cleaned = False
                self._persist_run(run)
            raise

    def _new_run(self, *, source: str, title: str, minute_token: str | None = None) -> RunRecord:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_id = f"run_{timestamp}_{secrets.token_hex(3)}"
        run = RunRecord(
            run_id=run_id,
            source=source,
            title=title,
            minute_token=minute_token,
            created_at=utc_now(),
        )
        self.artifacts.run_dir(run_id)
        self.artifacts.results_dir(run_id)
        return run

    def _persist_run(self, run: RunRecord) -> None:
        self.state_store.upsert_run(run)
        self.artifacts.write_run_metadata(run)

    def _apply_outputs(self, run: RunRecord, downloaded: dict[str, Path]) -> None:
        for key, path in downloaded.items():
            if hasattr(run.outputs, key):
                setattr(run.outputs, key, path)

    def _resolve_vault(self, output_vault: Path | None) -> Path | None:
        if output_vault is not None:
            return output_vault.expanduser().resolve()
        return self.settings.resolved_obsidian_vault_path()

    # ------------------------------------------------------------------
    # Audio splitting for long files (>2h with Doubao/Lark ASR)
    # ------------------------------------------------------------------

    _MAX_SEGMENT_SECONDS: int = 7140  # 119 min — 1 min margin under 2h limit

    def _get_audio_duration(self, path: Path) -> float:
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
                capture_output=True, text=True, check=True, timeout=30,
            )
            data = json.loads(result.stdout)
            return float(data["format"]["duration"])
        except Exception as exc:
            raise EchoForgeError(f"Failed to probe audio duration: {exc}") from exc

    def _split_audio(self, path: Path, run_id: str) -> list[Path]:
        duration = self._get_audio_duration(path)
        if duration <= self._MAX_SEGMENT_SECONDS:
            return [path]

        segment_dir = self.artifacts.run_dir(run_id) / "segments"
        segment_dir.mkdir(parents=True, exist_ok=True)

        # Find silence points near target duration for clean cuts
        split_points = self._find_silence_split_points(path, duration)

        segments: list[Path] = []
        for idx, (start, end) in enumerate(zip([0] + split_points, split_points + [None])):
            part_path = segment_dir / f"part{idx:03d}.ogg"
            cmd = [
                "ffmpeg", "-y", "-i", str(path),
                "-ss", str(start),
            ]
            if end is not None:
                cmd += ["-to", str(end)]
            cmd += ["-c", "copy", str(part_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120)
            segments.append(part_path)

        if not segments:
            raise EchoForgeError("ffmpeg segmentation produced no files")
        return segments

    def _find_silence_split_points(self, path: Path, duration: float) -> list[float]:
        """Find silence points near target duration for clean segment boundaries."""
        result = subprocess.run(
            [
                "ffmpeg", "-i", str(path),
                "-af", "silencedetect=noise=-50dB:d=1.5",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=60,
        )
        # Parse silence_start / silence_end from stderr
        silence_starts: list[float] = []
        for line in result.stderr.splitlines():
            if "silence_start:" in line:
                try:
                    t = float(line.split("silence_start:")[1].strip())
                    silence_starts.append(t)
                except ValueError:
                    continue

        target = self._MAX_SEGMENT_SECONDS
        split_points: list[float] = []
        current_end = target

        while current_end < duration - 60:  # leave at least 60s tail
            # Find silence_start closest to current_end
            best = None
            best_diff = float("inf")
            for t in silence_starts:
                if t <= current_end + 120 and t >= current_end - 120 and t > (split_points[-1] if split_points else 0):
                    diff = abs(t - current_end)
                    if diff < best_diff:
                        best_diff = diff
                        best = t
            if best is not None:
                split_points.append(best)
                current_end = best + target
            else:
                # No suitable silence found, fall back to fixed point
                split_points.append(current_end)
                current_end += target

        return split_points

    def _process_segment(
        self,
        run: RunRecord,
        segment_path: Path,
        time_offset_ms: int,
    ) -> dict[str, Path]:
        resolved_media_url, r2_object_key = self.input_resolver.resolve(
            segment_path, media_url=None, run_id=run.run_id,
        )
        task_id = self.provider.create_task(file_url=resolved_media_url, title=run.title)
        task_result = self.provider.wait_for_completion(task_id)
        if task_result.status != "completed":
            raise EchoForgeError(f"Segment ASR failed: {task_result.message}")
        segment_results_dir = segment_path.parent / f"results_{segment_path.stem}"
        downloaded = self.provider.download_results(
            task_result.result_urls, segment_results_dir,
        )
        if r2_object_key and self.r2_client:
            try:
                self.r2_client.delete_object(r2_object_key)
            except R2CleanupError:
                pass
        return downloaded

    def _merge_transcriptions(
        self,
        paths: list[Path],
        offsets_ms: list[int],
        output_path: Path,
    ) -> None:
        merged: list[dict[str, Any]] = []
        sentence_counter = 0
        for path, offset in zip(paths, offsets_ms):
            data = json.loads(path.read_text(encoding="utf-8"))
            sentences = data if isinstance(data, list) else data.get("_raw_list", [])
            for sentence in sentences:
                new_sent = dict(sentence)
                new_sent["sentence_id"] = str(sentence_counter)
                sentence_counter += 1
                new_sent["start_time"] = sentence.get("start_time", 0) + offset
                new_sent["end_time"] = sentence.get("end_time", 0) + offset
                if "words" in sentence:
                    new_words = []
                    for w in sentence["words"]:
                        new_w = dict(w)
                        new_w["start_time"] = w.get("start_time", 0) + offset
                        new_w["end_time"] = w.get("end_time", 0) + offset
                        new_words.append(new_w)
                    new_sent["words"] = new_words
                merged.append(new_sent)
        output_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    def _merge_chapters(
        self,
        paths: list[Path],
        offsets_ms: list[int],
        output_path: Path,
    ) -> None:
        merged_chapters: list[dict[str, Any]] = []
        for path, offset in zip(paths, offsets_ms):
            data = json.loads(path.read_text(encoding="utf-8"))
            chapters = data.get("chapter_summary", []) or data.get("AutoChapters", [])
            for ch in chapters:
                new_ch = dict(ch)
                for key in ("StartTime", "start_time", "Start", "start"):
                    if key in new_ch:
                        new_ch[key] = new_ch[key] + offset
                for key in ("EndTime", "end_time", "End", "end"):
                    if key in new_ch:
                        new_ch[key] = new_ch[key] + offset
                merged_chapters.append(new_ch)
        payload = {"chapter_summary": merged_chapters} if merged_chapters else {"chapter_summary": []}
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _select_best_file(self, paths: list[Path], output_path: Path) -> None:
        """Copy the largest (presumably most informative) file to output_path."""
        if not paths:
            output_path.write_text("{}", encoding="utf-8")
            return
        best = max(paths, key=lambda p: p.stat().st_size)
        output_path.write_text(best.read_text(encoding="utf-8"), encoding="utf-8")
