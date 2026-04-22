from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import httpx

from config.settings import Settings
from echoforge.errors import ConfigMissingError, TingwuTaskError
from echoforge.models import TingwuTaskResult
from echoforge.pipeline.poller import poll_until


class DoubaoSpeechProvider:
    """Doubao Speech ASR (big-model edition) — api/v3/auc/bigmodel.

    Docs: https://www.volcengine.com/docs/6561/1354868

    Key differences from the legacy standard edition:
    - Auth: X-Api-* headers (no cluster, no body-auth).
    - Endpoints: /api/v3/auc/bigmodel/submit  and  /api/v3/auc/bigmodel/query
    - Client generates the task UUID and re-uses it for query.
    - Request body carries user/audio/request objects.
    - Query returns utterances inline (no download URLs).
    """

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        if not settings.doubao_speech_appid or not settings.doubao_speech_token:
            raise ConfigMissingError(
                "DOUBAO_SPEECH_APPID and DOUBAO_SPEECH_TOKEN are required"
            )
        self.settings = settings
        self.client = client or httpx.Client(timeout=30.0, follow_redirects=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_task(self, file_url: str, title: str | None = None) -> str:
        del title
        task_id = str(uuid.uuid4())
        payload = self._build_submit_payload(file_url)
        response = self.client.post(
            self.settings.doubao_speech_submit_url,
            headers=self._headers(task_id, sequence="-1"),
            json=payload,
        )
        self._raise_for_submit_error(response)
        return task_id

    def get_task_info(self, task_id: str) -> TingwuTaskResult:
        response = self.client.post(
            self.settings.doubao_speech_query_url,
            headers=self._headers(task_id),
            json={},
        )
        status_code = response.headers.get("X-Api-Status-Code", "")
        message = response.headers.get("X-Api-Message", "")

        # 20000000 = done; 20000001 = still processing; anything else = error
        if status_code not in ("20000000", "20000001"):
            raise TingwuTaskError(
                f"DoubaoSpeech query failed ({status_code}): {message}"
            )

        data = response.json() if response.text else {}
        status = "completed" if status_code == "20000000" else "processing"
        raw_transcription = self._extract_inline_transcription(data)

        return TingwuTaskResult(
            task_id=task_id,
            status=status,
            result_urls={"_raw_transcription": raw_transcription} if raw_transcription else {},
            raw=data,
            message=message,
        )

    def wait_for_completion(self, task_id: str) -> TingwuTaskResult:
        return poll_until(
            lambda: self.get_task_info(task_id),
            get_status=lambda result: result.status,
            get_message=lambda result: result.message,
            poll_interval_seconds=max(self.settings.poll_interval_seconds, 5),
            slow_interval_seconds=max(self.settings.poll_slow_interval_seconds, 15),
            timeout_seconds=self.settings.poll_timeout_seconds,
        )

    def download_results(
        self, result_urls: dict[str, str], output_dir: Path
    ) -> dict[str, Path]:
        """Persist inline transcription and empty stubs for missing artifacts."""
        output_dir.mkdir(parents=True, exist_ok=True)
        downloaded: dict[str, Path] = {}

        raw = result_urls.get("_raw_transcription")
        if raw:
            tpath = output_dir / "transcription.json"
            tpath.write_text(raw, encoding="utf-8")
            downloaded["transcription"] = tpath

        # Big-model edition does not produce chapters / summarization /
        # meeting_assistance. Write empty stubs so rendering can proceed.
        for name, content in (
            ("chapters", '{"chapter_summary": []}'),
            ("summarization", '{"paragraph": "", "title": ""}'),
            ("meeting_assistance", '{"question_answer":[],"todo_list":[]}'),
        ):
            if name not in downloaded:
                p = output_dir / f"{name}.json"
                p.write_text(content, encoding="utf-8")
                downloaded[name] = p

        return downloaded

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _headers(self, request_id: str, sequence: str | None = None) -> dict[str, str]:
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "X-Api-App-Key": self.settings.doubao_speech_appid,
            "X-Api-Access-Key": self.settings.doubao_speech_token,
            "X-Api-Resource-Id": self.settings.doubao_speech_resource_id,
            "X-Api-Request-Id": request_id,
        }
        if sequence is not None:
            headers["X-Api-Sequence"] = sequence
        return headers

    def _build_submit_payload(self, file_url: str) -> dict[str, Any]:
        return {
            "user": {
                "uid": "echoforge",
            },
            "audio": {
                "url": file_url,
                "format": self._infer_format(file_url),
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": True,
                "enable_speaker_info": True,
                "show_utterances": True,
            },
        }

    def _extract_inline_transcription(self, data: dict[str, Any]) -> str | None:
        result = data.get("result")
        if not isinstance(result, dict):
            return None
        utterances = result.get("utterances")
        if not isinstance(utterances, list) or not utterances:
            return None
        normalised = self._normalise_utterances(utterances)
        return json.dumps(normalised, ensure_ascii=False, indent=2)

    def _normalise_utterances(self, utterances: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert big-model utterances into the list-of-sentences shape
        already used by the Lark provider and the Obsidian renderer.
        """
        out: list[dict[str, Any]] = []
        for idx, u in enumerate(utterances):
            start = u.get("start_time", 0)
            end = u.get("end_time", 0)
            text = u.get("text", "")
            additions = u.get("additions", {})
            speaker = additions.get("speaker", "1") if isinstance(additions, dict) else "1"

            # words
            words_in = u.get("words", [])
            words_out: list[dict[str, Any]] = []
            if isinstance(words_in, list):
                for w in words_in:
                    words_out.append({
                        "content": w.get("text", ""),
                        "start_time": w.get("start_time", 0),
                        "end_time": w.get("end_time", 0),
                        "lang": "zh_cn",
                    })

            out.append({
                "sentence_id": str(idx),
                "content": text,
                "start_time": start,
                "end_time": end,
                "speaker": {
                    "id": str(speaker),
                    "name": f"说话人{speaker}",
                    "type": 101,
                },
                "words": words_out,
                "channel_id": 0,
            })
        return out

    def _raise_for_submit_error(self, response: httpx.Response) -> None:
        response.raise_for_status()
        status_code = response.headers.get("X-Api-Status-Code", "")
        message = response.headers.get("X-Api-Message", "")
        if status_code == "20000000":
            return
        raise TingwuTaskError(
            f"DoubaoSpeech submit failed ({status_code}): {message}"
        )

    def _infer_format(self, file_url: str) -> str:
        suffix = Path(file_url.split("?", 1)[0]).suffix.lower()
        if suffix in {".ogg", ".oga"}:
            return "ogg"
        if suffix in {".mp3"}:
            return "mp3"
        if suffix in {".wav"}:
            return "wav"
        if suffix in {".mp4", ".m4a"}:
            return "mp4"
        return "ogg"
