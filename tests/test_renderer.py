from __future__ import annotations

import json
from pathlib import Path

from echoforge.models import RunOutputs, RunRecord, utc_now
from echoforge.renderers.obsidian import ObsidianRenderer


def test_renderer_writes_obsidian_note(tmp_path: Path) -> None:
    outputs_dir = tmp_path / "results"
    outputs_dir.mkdir(parents=True)
    chapters_path = outputs_dir / "chapters.json"
    summarization_path = outputs_dir / "summarization.json"
    meeting_path = outputs_dir / "meeting_assistance.json"
    transcription_path = outputs_dir / "transcription.json"

    chapters_path.write_text(
        json.dumps({"AutoChapters": [{"Headline": "开场", "Summary": "介绍项目", "Start": 0, "End": 30000}]}),
        encoding="utf-8",
    )
    summarization_path.write_text(
        json.dumps({"ParagraphSummary": "本次会议讨论了重构。", "ConversationalSummary": [{"SpeakerId": "speaker_0", "Summary": "说明了目标。"}]}),
        encoding="utf-8",
    )
    meeting_path.write_text(
        json.dumps({"Actions": [{"Action": "完成迁移", "DueTime": "2026-03-25"}], "KeyInformation": [{"Category": "关键决策", "Content": "迁移到 Python CLI"}]}),
        encoding="utf-8",
    )
    transcription_path.write_text(
        json.dumps({
            "Transcription": {
                "Paragraphs": [
                    {
                        "ParagraphId": "p1",
                        "SpeakerId": "1",
                        "Words": [
                            {"Start": 180, "End": 458, "Text": "这"},
                            {"Start": 458, "End": 736, "Text": "是"},
                            {"Start": 736, "End": 1014, "Text": "测试。"},
                        ],
                    },
                    {
                        "ParagraphId": "p2",
                        "SpeakerId": "2",
                        "Words": [
                            {"Start": 3000, "End": 3500, "Text": "收到"},
                            {"Start": 3500, "End": 4000, "Text": "。"},
                        ],
                    },
                ]
            }
        }),
        encoding="utf-8",
    )

    run = RunRecord(
        run_id="run_test_123",
        source="feishu",
        title="周会纪要",
        minute_token="minute-1",
        created_at=utc_now(),
        outputs=RunOutputs(
            chapters=chapters_path,
            summarization=summarization_path,
            meeting_assistance=meeting_path,
            transcription=transcription_path,
        ),
    )

    renderer = ObsidianRenderer()
    note_path = renderer.render_to_run(run, vault_path=tmp_path / "vault")
    content = note_path.read_text(encoding="utf-8")

    assert note_path.exists()
    assert "周会纪要" in content
    assert "迁移到 Python CLI" in content
    assert "完成迁移" in content
    assert "转写原文" in content
    assert "[[2026-04-16-周会纪要-transcript]]" in content
    assert "00:00 - 00:30" in content
    assert "#^ef-000" in content

    transcript_path = note_path.parent / "Transcripts" / "2026-04-16-周会纪要-transcript.md"
    transcript_content = transcript_path.read_text(encoding="utf-8")
    assert "00:00" in transcript_content
    assert "说话人 1" in transcript_content
    assert "这是测试。" in transcript_content
    assert "00:03" in transcript_content
    assert "说话人 2" in transcript_content
    assert "收到。" in transcript_content
    assert "^ef-000" in transcript_content
    assert "^ef-001" in transcript_content


def test_renderer_renders_transcript_only_from_transcription_json(tmp_path: Path) -> None:
    transcription_path = tmp_path / "transcription.json"
    transcription_path.write_text(
        json.dumps(
            {
                "Transcription": {
                    "AudioInfo": {"Duration": 4000},
                    "Paragraphs": [
                        {
                            "SpeakerId": "字幕",
                            "Words": [
                                {"Start": 700, "End": 1580, "Text": "这新弄还是怎么着"},
                                {"Start": 1980, "End": 2780, "Text": "新弄新电脑"},
                            ],
                        }
                    ],
                }
            }
        ),
        encoding="utf-8",
    )

    transcript_path = ObsidianRenderer().render_transcript_only(
        transcription_path=transcription_path,
        vault_path=tmp_path / "vault",
        title="税表填写规则及数据处理讨论",
        note_name="imported-tax-transcript",
        source_label="Feishu Minutes WEBVTT",
        created_at_label="2026-04-22 10:30",
    )
    content = transcript_path.read_text(encoding="utf-8")

    assert transcript_path.exists()
    assert transcript_path.name == "imported-tax-transcript.md"
    assert "Feishu Minutes WEBVTT" in content
    assert "字幕" in content
    assert "这新弄还是怎么着新弄新电脑" in content
