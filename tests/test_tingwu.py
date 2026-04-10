from __future__ import annotations

from typing import Any

from echoforge.providers.tingwu import TingwuProvider


class FakeExecutor:
    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.payload = payload
        return {"Data": {"TaskId": "task-123"}}

    def get_task_info(self, task_id: str) -> dict[str, Any]:
        return {
            "Data": {
                "TaskId": task_id,
                "TaskStatus": "SUCCESS",
                "Result": {
                    "Transcription": "https://example.com/transcription.json",
                    "Auto_Chapters": "https://example.com/chapters.json",
                },
            }
        }


def test_provider_builds_payload_and_normalizes_results(settings) -> None:
    executor = FakeExecutor()
    provider = TingwuProvider(settings, request_executor=executor)

    task_id = provider.create_task("https://example.com/audio.ogg", title="周会")
    task_info = provider.get_task_info(task_id)

    assert task_id == "task-123"
    assert executor.payload["Input"]["FileUrl"] == "https://example.com/audio.ogg"
    assert task_info.status == "completed"
    assert task_info.result_urls["transcription"] == "https://example.com/transcription.json"
    assert task_info.result_urls["auto_chapters"] == "https://example.com/chapters.json"
