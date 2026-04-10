from __future__ import annotations

import json
from pathlib import Path

import typer

from config.settings import get_settings
from echoforge.errors import EchoForgeError
from echoforge.log import configure_logging
from echoforge.pipeline.orchestrator import Orchestrator
from echoforge.pipeline.uploader import TingwuInputResolver
from echoforge.providers.tingwu import TingwuProvider
from echoforge.renderers.obsidian import ObsidianRenderer
from echoforge.sources.feishu import FeishuSource
from echoforge.storage.artifacts import ArtifactManager
from echoforge.storage.r2_client import R2Client
from echoforge.storage.state import StateStore

app = typer.Typer(no_args_is_help=True)


def _build_state_store() -> tuple[ArtifactManager, StateStore]:
    settings = get_settings()
    configure_logging(settings.log_level)
    outputs_dir = settings.resolved_outputs_dir()
    artifacts = ArtifactManager(outputs_dir)
    state_store = StateStore(outputs_dir / "runs.json")
    return artifacts, state_store


def _build_orchestrator(*, with_provider: bool, with_feishu: bool) -> Orchestrator:
    settings = get_settings()
    configure_logging(settings.log_level)
    outputs_dir = settings.resolved_outputs_dir()
    artifacts = ArtifactManager(outputs_dir)
    state_store = StateStore(outputs_dir / "runs.json")
    renderer = ObsidianRenderer()
    provider = TingwuProvider(settings) if with_provider else None
    feishu_source = FeishuSource(settings) if with_feishu else None
    r2_client: R2Client | None = None
    if with_provider:
        try:
            r2_client = R2Client(settings)
        except EchoForgeError:
            r2_client = None
    input_resolver = TingwuInputResolver(r2_client=r2_client) if with_provider else None
    return Orchestrator(
        settings,
        state_store,
        artifacts,
        provider=provider,
        renderer=renderer,
        feishu_source=feishu_source,
        input_resolver=input_resolver,
        r2_client=r2_client,
    )


def _echo_run(run: object) -> None:
    typer.echo(json.dumps(run.model_dump(mode="json"), ensure_ascii=False, indent=2))


@app.command("process-feishu")
def process_feishu(
    minute_token: str,
    output_vault: Path | None = typer.Option(default=None, help="Override Obsidian vault path."),
    template: str | None = typer.Option(default=None, help="Renderer template name."),
    skip_render: bool = typer.Option(default=False, help="Skip Obsidian rendering."),
    force: bool = typer.Option(default=False, help="Ignore latest successful run cache."),
    media_url: str | None = typer.Option(default=None, help="Override the media URL passed to Tingwu."),
) -> None:
    try:
        run = _build_orchestrator(with_provider=True, with_feishu=True).run_feishu(
            minute_token,
            output_vault=output_vault,
            template=template,
            skip_render=skip_render,
            force=force,
            media_url=media_url,
        )
        _echo_run(run)
    except EchoForgeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1)


@app.command("process-file")
def process_file(
    file_path: Path,
    output_vault: Path | None = typer.Option(default=None, help="Override Obsidian vault path."),
    template: str | None = typer.Option(default=None, help="Renderer template name."),
    title: str | None = typer.Option(default=None, help="Override the note title."),
    skip_render: bool = typer.Option(default=False, help="Skip Obsidian rendering."),
    force: bool = typer.Option(default=False, help="Ignore latest successful run cache."),
    media_url: str | None = typer.Option(default=None, help="Public HTTP or HTTPS URL required by Tingwu."),
) -> None:
    try:
        run = _build_orchestrator(with_provider=True, with_feishu=False).run_file(
            file_path,
            output_vault=output_vault,
            template=template,
            title=title,
            skip_render=skip_render,
            force=force,
            media_url=media_url,
        )
        _echo_run(run)
    except EchoForgeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1)


@app.command()
def render(
    run_id: str,
    template: str | None = typer.Option(default=None, help="Renderer template name."),
    output_vault: Path | None = typer.Option(default=None, help="Override Obsidian vault path."),
) -> None:
    try:
        note_path = _build_orchestrator(with_provider=False, with_feishu=False).render_only(
            run_id,
            template=template,
            output_vault=output_vault,
        )
        typer.echo(str(note_path))
    except EchoForgeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1)


@app.command("list-runs")
def list_runs(status: str | None = typer.Option(default=None, help="Optional run status filter.")) -> None:
    _, state_store = _build_state_store()
    runs = state_store.list_runs(status=status)
    typer.echo(json.dumps([run.model_dump(mode="json") for run in runs], ensure_ascii=False, indent=2))


@app.command("inspect-run")
def inspect_run(run_id: str) -> None:
    _, state_store = _build_state_store()
    run = state_store.get_run(run_id)
    _echo_run(run)


def main() -> None:
    app()
