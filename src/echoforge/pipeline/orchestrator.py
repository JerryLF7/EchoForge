from __future__ import annotations

import secrets
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
            raise ConfigMissingError("Tingwu provider is not configured")
        if self.input_resolver is None:
            raise ConfigMissingError("Tingwu input resolver is not configured")

        try:
            run.media_path = staged_media
            self._persist_run(run)
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
