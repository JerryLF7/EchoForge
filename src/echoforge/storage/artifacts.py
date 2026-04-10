from __future__ import annotations

import json
import re
from pathlib import Path
from shutil import copy2

from echoforge.models import RunRecord


class ArtifactManager:
    def __init__(self, outputs_dir: Path) -> None:
        self.outputs_dir = outputs_dir
        self.runs_dir = self.outputs_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        path = self.runs_dir / run_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def results_dir(self, run_id: str) -> Path:
        path = self.run_dir(run_id) / "results"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def run_metadata_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run.json"

    def stage_media(self, run_id: str, source_path: Path) -> Path:
        destination = self.run_dir(run_id) / f"media{source_path.suffix}"
        if source_path.resolve() == destination.resolve():
            return destination
        copy2(source_path, destination)
        return destination

    def result_path(self, run_id: str, result_name: str) -> Path:
        return self.results_dir(run_id) / f"{result_name}.json"

    def write_run_metadata(self, run: RunRecord) -> Path:
        path = self.run_metadata_path(run.run_id)
        path.write_text(
            json.dumps(run.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path


def sanitize_title(title: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|]", "-", title)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned or "untitled"
