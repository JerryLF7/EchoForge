from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from config.settings import Settings
from echoforge.errors import ConfigMissingError, TingwuTaskError
from echoforge.models import TingwuTaskResult
from echoforge.pipeline.poller import poll_until


class DoubaoSpeechProvider:
    """Doubao Speech ASR (standard edition) — api/v1/auc.

    Docs: https://www.volcengine.com/docs/6561/80820

    Key differences from the Lark/Minutes provider:
    - Auth: Bearer token in header + app/token/cluster in JSON body.
    - Endpoints: /api/v1/auc/submit  and  /api/v1/auc/query
    - Query returns utterances inline (no download URLs).
    - Supports up to 5 hours / 512 MB per file.
    - Status codes: 1000=success, 2000=processing, 2001=queued.
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
        payload = self._build_submit_payload(file_url)
        response = self.client.post(
            self.settings.doubao_speech_submit_url,
            headers=self._headers(),
            json=payload,
        )
        self._raise_for_api_error(response, action="submit")
        data = response.json()
        resp = data.get("resp", {})
        task_id = resp.get("id")
        if not isinstance(task_id, str) or not task_id:
            raise TingwuTaskError(f"Could not extract task id: {data}")
        return task_id

    def get_task_info(self, task_id: str) -> TingwuTaskResult:
        payload = {
            "appid": self.settings.doubao_speech_appid,
            "token": self.settings.doubao_speech_token,
            "cluster": self.settings.doubao_speech_cluster,
            "id": task_id,
        }
        response = self.client.post(
            self.settings.doubao_speech_query_url,
            headers=self._headers(),
            json=payload,
        )
        self._raise_for_api_error(response, action="query")
        data = response.json()
        resp = data.get("resp", {})

        status = self._normalize_status(resp.get("code"))
        raw_transcription = self._extract_inline_transcription(resp)

        return TingwuTaskResult(
            task_id=task_id,
            status=status,
            result_urls={"_raw_transcription": raw_transcription} if raw_transcription else {},
            raw=data,
            message=resp.get("message"),
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

        # Standard edition does not produce chapters / summarization /
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

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer; {self.settings.doubao_speech_token}",
        }

    def _build_submit_payload(self, file_url: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "app": {
                "appid": self.settings.doubao_speech_appid,
                "token": self.settings.doubao_speech_token,
                "cluster": self.settings.doubao_speech_cluster,
            },
            "user": {
                "uid": self.settings.doubao_speech_uid or "echoforge",
            },
            "audio": {
                "url": file_url,
                "format": self._infer_format(file_url),
            },
            "additions": {
                "use_itn": "True",
                "use_punc": "True",
                "use_ddc": "True",
                "with_speaker_info": "True",
            },
        }
        return payload

    def _extract_inline_transcription(self, resp: dict[str, Any]) -> str | None:
        utterances = resp.get("utterances")
        if not isinstance(utterances, list) or not utterances:
            return None
        normalised = self._normalise_utterances(utterances)
        return json.dumps(normalised, ensure_ascii=False, indent=2)

    def _normalise_utterances(self, utterances: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert standard-edition utterances into the list-of-sentences shape
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

    def _raise_for_api_error(self, response: httpx.Response, *, action: str) -> None:
        response.raise_for_status()
        data = response.json()
        resp = data.get("resp", {})
        code = resp.get("code")
        # 1000 = success; 2000/2001 = still processing (query only)
        if code in (1000, "1000", 2000, "2000", 2001, "2001"):
            return
        message = resp.get("message", "")
        raise TingwuTaskError(f"DoubaoSpeech {action} failed ({code}): {message}")

    def _normalize_status(self, code: Any) -> str:
        if code in (1000, "1000"):
            return "completed"
        if code in (2000, "2000", 2001, "2001"):
            return "processing"
        return "failed"

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
