from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path
from typing import Any

import httpx

from config.settings import Settings
from echoforge.errors import ConfigMissingError, TingwuTaskError
from echoforge.models import TingwuTaskResult
from echoforge.pipeline.poller import poll_until


class DoubaoProvider:
    RESULT_NAME_MAP = {
        "audiotranscriptionfile": "transcription",
        "chapterfile": "chapters",
        "summarizationfile": "summarization",
        "informationextractionfile": "meeting_assistance",
        "translationfile": "translation",
    }

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        if not settings.doubao_app_key or not settings.doubao_access_key:
            raise ConfigMissingError("DOUBAO_APP_KEY and DOUBAO_ACCESS_KEY are required")
        self.settings = settings
        self.client = client or httpx.Client(timeout=30.0, follow_redirects=True)

    def create_task(self, file_url: str, title: str | None = None) -> str:
        request_id = str(uuid.uuid4())
        response = self.client.post(
            self.settings.doubao_submit_url,
            headers=self._headers(request_id=request_id),
            json=self.build_task_payload(file_url=file_url, title=title),
        )
        self._raise_for_api_error(response, action="submit")
        payload = response.json()
        task_id = self._find_first(payload, {"TaskID", "TaskId", "task_id"})
        if not isinstance(task_id, str) or not task_id:
            raise TingwuTaskError(f"Could not extract Doubao task id from response: {payload}")
        return task_id

    def build_task_payload(self, file_url: str, title: str | None = None) -> dict[str, Any]:
        del title
        return {
            "Input": {
                "Offline": {
                    "FileURL": file_url,
                    "FileType": self._infer_file_type(file_url),
                }
            },
            "Params": {
                "AllActivate": False,
                "SourceLang": self.settings.doubao_source_lang,
                "AudioTranscriptionEnable": True,
                "AudioTranscriptionParams": {
                    "SpeakerIdentification": self.settings.doubao_speaker_identification,
                    "NumberOfSpeaker": self.settings.doubao_number_of_speakers,
                    "HotWords": "",
                    "NeedWordTimeSeries": self.settings.doubao_need_word_time_series,
                },
                "InformationExtractionEnabled": True,
                "InformationExtractionParams": {
                    "Types": ["todo_list", "question_answer"],
                },
                "SummarizationEnabled": True,
                "SummarizationParams": {
                    "Types": ["summary"],
                },
                "ChapterEnabled": True,
            },
        }

    def get_task_info(self, task_id: str) -> TingwuTaskResult:
        response = self.client.post(
            self.settings.doubao_query_url,
            headers=self._headers(request_id=task_id),
            json={"TaskID": task_id},
        )
        self._raise_for_api_error(response, action="query")
        payload = response.json()
        status_value = self._find_first(payload, {"Status", "status"})
        status = self._normalize_status(status_value)
        return TingwuTaskResult(
            task_id=task_id,
            status=status,
            result_urls=self._extract_result_urls(payload),
            raw=payload,
            message=self._extract_message(payload),
        )

    def wait_for_completion(self, task_id: str) -> TingwuTaskResult:
        return poll_until(
            lambda: self.get_task_info(task_id),
            get_status=lambda result: result.status,
            get_message=lambda result: result.message,
            poll_interval_seconds=max(self.settings.poll_interval_seconds, 30),
            slow_interval_seconds=max(self.settings.poll_slow_interval_seconds, 30),
            timeout_seconds=self.settings.poll_timeout_seconds,
        )

    def download_result(self, url: str, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        response = self.client.get(url)
        response.raise_for_status()
        output_path.write_bytes(response.content)

    def download_results(self, result_urls: dict[str, str], output_dir: Path) -> dict[str, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        downloaded: dict[str, Path] = {}
        for remote_name, url in result_urls.items():
            normalized_name = self.RESULT_NAME_MAP.get(remote_name, remote_name)
            destination = output_dir / f"{normalized_name}.json"
            self.download_result(url, destination)
            downloaded[normalized_name] = destination
        return downloaded

    def _headers(self, *, request_id: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Api-App-Key": self.settings.doubao_app_key or "",
            "X-Api-Access-Key": self.settings.doubao_access_key or "",
            "X-Api-Resource-Id": self.settings.doubao_resource_id,
            "X-Api-Request-Id": request_id,
            "X-Api-Sequence": "-1",
        }

    def _raise_for_api_error(self, response: httpx.Response, *, action: str) -> None:
        response.raise_for_status()
        status_code = response.headers.get("X-Api-Status-Code")
        if status_code and status_code != "20000000":
            message = response.headers.get("X-Api-Message", "")
            raise TingwuTaskError(f"Doubao {action} failed with status {status_code}: {message}")

    def _extract_result_urls(self, payload: dict[str, Any]) -> dict[str, str]:
        result = self._find_first(payload, {"Result", "result"})
        if not isinstance(result, dict):
            return {}
        extracted: dict[str, str] = {}
        for key, value in result.items():
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                extracted[key.lower()] = value
        return extracted

    def _extract_message(self, payload: dict[str, Any]) -> str | None:
        err_code = self._find_first(payload, {"ErrCode", "err_code"})
        err_message = self._find_first(payload, {"ErrMessage", "err_message", "Message", "message"})
        if err_code in {0, "0", None, ""}:
            return err_message if isinstance(err_message, str) and err_message else None
        return f"{err_code}: {err_message}"

    def _normalize_status(self, value: Any) -> str:
        text = str(value or "pending").strip().lower()
        if text in {"completed", "success", "succeeded", "finished", "done"}:
            return "completed"
        if text in {"failed", "error", "cancelled", "canceled"}:
            return "failed"
        if text in {"processing", "running", "working", "executing"}:
            return "processing"
        return "pending"

    def _find_first(self, payload: Any, keys: set[str]) -> Any:
        if isinstance(payload, dict):
            for key, value in payload.items():
                if key in keys:
                    return value
                nested = self._find_first(value, keys)
                if nested is not None:
                    return nested
        elif isinstance(payload, list):
            for value in payload:
                nested = self._find_first(value, keys)
                if nested is not None:
                    return nested
        return None

    def _infer_file_type(self, file_url: str) -> str:
        suffix = Path(file_url.split("?", 1)[0]).suffix.lower()
        if suffix in {".mp4", ".avi", ".mkv", ".mov", ".flv", ".wmv"}:
            return "video"
        if suffix:
            mime_type, _ = mimetypes.guess_type(f"file{suffix}")
            if mime_type and mime_type.startswith("video/"):
                return "video"
        return "audio"
