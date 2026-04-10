from __future__ import annotations

import json
from pathlib import Path

from echoforge.errors import RunNotFoundError
from echoforge.models import RunRecord, StateDocument


class StateStore:
    def __init__(self, state_path: Path) -> None:
        self.state_path = state_path
        self.state_path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> StateDocument:
        if not self.state_path.exists():
            return StateDocument()
        return StateDocument.model_validate_json(self.state_path.read_text(encoding="utf-8"))

    def save(self, document: StateDocument) -> None:
        self.state_path.write_text(
            json.dumps(document.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def upsert_run(self, run: RunRecord) -> RunRecord:
        document = self.load()
        document.runs[run.run_id] = run
        self.save(document)
        return run

    def get_run(self, run_id: str) -> RunRecord:
        document = self.load()
        run = document.runs.get(run_id)
        if run is None:
            raise RunNotFoundError(f"Run not found: {run_id}")
        return run

    def list_runs(self, status: str | None = None) -> list[RunRecord]:
        runs = list(self.load().runs.values())
        if status is not None:
            runs = [run for run in runs if run.status == status]
        return sorted(runs, key=lambda run: run.created_at, reverse=True)

    def find_latest_by_minute_token(self, minute_token: str) -> RunRecord | None:
        matches = [run for run in self.load().runs.values() if run.minute_token == minute_token]
        if not matches:
            return None
        return sorted(matches, key=lambda run: run.created_at, reverse=True)[0]

    def find_latest_by_media_path(self, media_path: Path) -> RunRecord | None:
        resolved = media_path.expanduser().resolve()
        matches = [
            run
            for run in self.load().runs.values()
            if run.media_path is not None and run.media_path.expanduser().resolve() == resolved
        ]
        if not matches:
            return None
        return sorted(matches, key=lambda run: run.created_at, reverse=True)[0]
