from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

from config.settings import Settings
from echoforge.errors import ConfigMissingError, TingwuTaskError
from echoforge.models import TingwuTaskResult
from echoforge.pipeline.poller import poll_until


class TingwuRequestExecutor(Protocol):
    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def get_task_info(self, task_id: str) -> dict[str, Any]:
        ...


class AlibabaCloudTingwuSdkExecutor:
    def __init__(self, settings: Settings) -> None:
        if not settings.tingwu_access_key_id or not settings.tingwu_access_key_secret:
            raise ConfigMissingError("TINGWU_ACCESS_KEY_ID and TINGWU_ACCESS_KEY_SECRET are required")
        if not settings.tingwu_app_key:
            raise ConfigMissingError("TINGWU_APP_KEY is required")

        try:
            from alibabacloud_tea_openapi import models as open_api_models
            from alibabacloud_tingwu20230930 import models as tingwu_models
            from alibabacloud_tingwu20230930.client import Client as TingwuClient
        except ImportError as exc:
            raise ConfigMissingError(
                "Install the Alibaba Cloud Tingwu SDK dependency to call Tingwu APIs"
            ) from exc

        endpoint = urlparse(settings.tingwu_endpoint).netloc or settings.tingwu_endpoint
        config = open_api_models.Config(
            access_key_id=settings.tingwu_access_key_id,
            access_key_secret=settings.tingwu_access_key_secret,
            security_token=settings.tingwu_security_token,
            region_id=settings.tingwu_region,
            endpoint=endpoint,
        )
        self._client = TingwuClient(config)
        self._models = tingwu_models

    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = self._build_request("CreateTaskRequest", payload)
        response = self._client.create_task(request)
        return self._to_dict(response)

    def get_task_info(self, task_id: str) -> dict[str, Any]:
        response = self._client.get_task_info(task_id)
        return self._to_dict(response)

    def _build_request(self, model_name: str, payload: dict[str, Any]) -> Any:
        model_cls = getattr(self._models, model_name)
        request = model_cls()
        if hasattr(request, "from_map"):
            mapped = request.from_map(payload)
            request = request if mapped is None else mapped
        else:
            request = model_cls(**payload)
        # Alibaba SDK from_map skips 'type' keyword fields; patch directly
        if "Type" in payload and hasattr(request, "type") and getattr(request, "type") is None:
            request.type = payload["Type"]
        return request

    def _to_dict(self, response: Any) -> dict[str, Any]:
        body = getattr(response, "body", response)
        if hasattr(body, "to_map"):
            return body.to_map()
        if hasattr(response, "to_map"):
            return response.to_map()
        if isinstance(body, dict):
            return body
        raise TingwuTaskError("Unexpected Tingwu SDK response shape")


class TingwuProvider:
    RESULT_NAME_MAP = {
        "transcription": "transcription",
        "auto_chapters": "chapters",
        "autochapters": "chapters",
        "summarization": "summarization",
        "meeting_assistance": "meeting_assistance",
        "meetingassistance": "meeting_assistance",
    }

    def __init__(self, settings: Settings, request_executor: TingwuRequestExecutor | None = None) -> None:
        self.settings = settings
        self.request_executor = request_executor or AlibabaCloudTingwuSdkExecutor(settings)

    def create_task(self, file_url: str, title: str | None = None) -> str:
        payload = self.build_task_payload(file_url=file_url, title=title)
        response = self.request_executor.create_task(payload)
        task_id = self._find_first(response, {"TaskId", "task_id"})
        if not isinstance(task_id, str) or not task_id:
            raise TingwuTaskError(f"Could not extract Tingwu task id from response: {response}")
        return task_id

    def build_task_payload(self, file_url: str, title: str | None = None) -> dict[str, Any]:
        input_block: dict[str, Any] = {
            "FileUrl": file_url,
            "SourceLanguage": self.settings.tingwu_language,
        }
        if title:
            input_block["Title"] = title
        return {
            "AppKey": self.settings.tingwu_app_key,
            "Input": input_block,
            "Type": "offline",
            "Parameters": {
                "TextPolishEnabled": True,
                "AutoChaptersEnabled": True,
                "SummarizationEnabled": True,
                "Summarization": {
                    "Types": ["Paragraph", "Conversational", "QuestionsAnswering", "MindMap"],
                },
                "MeetingAssistanceEnabled": True,
                "MeetingAssistance": {
                    "Types": ["Actions", "KeyInformation"],
                },
            },
        }

    def get_task_info(self, task_id: str) -> TingwuTaskResult:
        response = self.request_executor.get_task_info(task_id)
        status_value = self._find_first(response, {"TaskStatus", "Status", "status"})
        status = self._normalize_status(status_value)
        return TingwuTaskResult(
            task_id=task_id,
            status=status,
            result_urls=self._extract_result_urls(response),
            raw=response,
            message=self._find_first(response, {"Message", "ErrorMessage", "error_message"}),
        )

    def wait_for_completion(self, task_id: str) -> TingwuTaskResult:
        return poll_until(
            lambda: self.get_task_info(task_id),
            get_status=lambda result: result.status,
            get_message=lambda result: result.message,
            poll_interval_seconds=self.settings.poll_interval_seconds,
            slow_interval_seconds=self.settings.poll_slow_interval_seconds,
            timeout_seconds=self.settings.poll_timeout_seconds,
        )

    def download_result(self, url: str, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            response = client.get(url)
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

    def _extract_result_urls(self, payload: dict[str, Any]) -> dict[str, str]:
        result = self._find_first(payload, {"Result", "result"})
        if not isinstance(result, dict):
            return {}
        extracted: dict[str, str] = {}
        for key, value in result.items():
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                extracted[key.lower()] = value
        return extracted

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
