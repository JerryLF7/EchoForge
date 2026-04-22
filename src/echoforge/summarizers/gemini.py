from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests

from config.settings import Settings
from echoforge.errors import EchoForgeError


class GeminiSummarizer:
    """Post-process a transcript markdown file with Gemini to produce
    summarization, chapters, Q&A, and action items.
    """

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.gemini_api_key
        self.base_url = settings.gemini_base_url.rstrip("/")
        self.model = settings.gemini_model
        if not self.api_key:
            raise EchoForgeError("GEMINI_API_KEY is required for summarization")

    def summarize(self, transcript_path: Path) -> dict[str, Any]:
        """Read transcript markdown and return structured summary JSON."""
        transcript = transcript_path.read_text(encoding="utf-8")
        prompt = self._build_prompt(transcript)

        url = f"{self.base_url}/v1beta/models/{self.model}:generateContent"
        headers = {"Content-Type": "application/json"}
        params = {"key": self.api_key}
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
        }

        response = requests.post(url, headers=headers, params=params, json=payload, timeout=120)
        if response.status_code != 200:
            raise EchoForgeError(
                f"Gemini API error ({response.status_code}): {response.text[:500]}"
            )

        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return self._parse_json_output(text)

    def write_summary_artifacts(
        self, summary: dict[str, Any], results_dir: Path
    ) -> dict[str, Path]:
        """Convert Gemini summary into renderer-compatible JSON files."""
        results_dir.mkdir(parents=True, exist_ok=True)
        written: dict[str, Path] = {}

        # chapters
        chapters = {
            "AutoChapters": [
                {
                    "Headline": ch["title"],
                    "Summary": ch["summary"],
                    "StartTime": self._time_to_ms(ch.get("start_time", "00:00")),
                    "EndTime": self._time_to_ms(ch.get("end_time", "00:00")),
                }
                for ch in summary.get("chapters", [])
            ]
        }
        cp = results_dir / "chapters.json"
        cp.write_text(json.dumps(chapters, ensure_ascii=False, indent=2), encoding="utf-8")
        written["chapters"] = cp

        # summarization
        summarization = {
            "ParagraphSummary": summary.get("paragraph_summary", ""),
            "ConversationalSummary": [
                {"SpeakerId": s["name"], "Summary": s["summary"]}
                for s in summary.get("speakers", [])
            ],
            "QaPairs": summary.get("qa_pairs", []),
        }
        sp = results_dir / "summarization.json"
        sp.write_text(json.dumps(summarization, ensure_ascii=False, indent=2), encoding="utf-8")
        written["summarization"] = sp

        # meeting assistance
        meeting_assistance = {
            "Actions": summary.get("actions", []),
            "KeyInformation": summary.get("key_information", []),
        }
        mp = results_dir / "meeting_assistance.json"
        mp.write_text(json.dumps(meeting_assistance, ensure_ascii=False, indent=2), encoding="utf-8")
        written["meeting_assistance"] = mp

        return written

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_prompt(self, transcript: str) -> str:
        return (
            "你是一位专业的会议纪要专家。请根据以下会议转写文本，"
            "生成结构化摘要。\n\n"
            "转写文本格式说明：每行包含时间戳、说话人标识和说话内容。\n\n"
            "--- 转写文本开始 ---\n"
            f"{transcript}\n"
            "--- 转写文本结束 ---\n\n"
            "请输出以下 JSON 格式（不要包含任何其他文字，只输出纯 JSON）：\n"
            '{\n'
            '  "paragraph_summary": "会议整体摘要（200字以内）",\n'
            '  "chapters": [\n'
            '    {"title": "章节标题", "summary": "章节摘要", '
            '"start_time": "00:00", "end_time": "01:23"}\n'
            '  ],\n'
            '  "speakers": [\n'
            '    {"name": "说话人 1", "summary": "该说话人的主要观点和贡献"}\n'
            '  ],\n'
            '  "qa_pairs": [\n'
            '    {"Question": "问题", "Answer": "答案"}\n'
            '  ],\n'
            '  "actions": [\n'
            '    {"Action": "待办事项"}\n'
            '  ],\n'
            '  "key_information": [\n'
            '    {"Category": "重点", "Content": "重点内容"}\n'
            '  ]\n'
            "}"
        )

    def _parse_json_output(self, text: str) -> dict[str, Any]:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            raise EchoForgeError(f"Could not extract JSON from Gemini response: {text[:500]}")
        return json.loads(text[start:end])

    @staticmethod
    def _time_to_ms(value: str) -> int:
        parts = value.split(":")
        if len(parts) == 2:
            m, s = int(parts[0]), int(parts[1])
            return (m * 60 + s) * 1000
        if len(parts) == 3:
            h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
            return (h * 3600 + m * 60 + s) * 1000
        return 0
