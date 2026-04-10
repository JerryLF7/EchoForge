from __future__ import annotations

from pathlib import Path
from typing import Protocol

from echoforge.models import TingwuTaskResult


class UnderstandingProvider(Protocol):
    def create_task(self, file_url: str, title: str | None = None) -> str:
        ...

    def get_task_info(self, task_id: str) -> TingwuTaskResult:
        ...

    def wait_for_completion(self, task_id: str) -> TingwuTaskResult:
        ...

    def download_result(self, url: str, output_path: Path) -> None:
        ...

    def download_results(self, result_urls: dict[str, str], output_dir: Path) -> dict[str, Path]:
        ...
