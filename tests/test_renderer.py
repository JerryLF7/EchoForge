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

    chapters_path.write_text(
        json.dumps({"AutoChapters": [{"ChapterTitle": "开场", "Summary": "介绍项目", "StartTime": 0, "EndTime": 30000}]}),
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
        ),
    )

    renderer = ObsidianRenderer()
    note_path = renderer.render_to_run(run, vault_path=tmp_path / "vault")
    content = note_path.read_text(encoding="utf-8")

    assert note_path.exists()
    assert "周会纪要" in content
    assert "迁移到 Python CLI" in content
    assert "完成迁移" in content
