from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_script_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "gemini_audio_test.py"
    spec = importlib.util.spec_from_file_location("gemini_audio_test", script_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


module = _load_script_module()


def test_trim_overlap_removes_repeated_boundary_text() -> None:
    previous = "[00:59:20] 我们先把接口收口，然后统一处理权限和审计日志。"
    current = "[00:59:20] 我们先把接口收口，然后统一处理权限和审计日志。\n\n[01:00:05] 接下来讨论发布窗口和回滚方案。"

    trimmed = module.trim_overlap(previous, current)

    assert "权限和审计日志" not in trimmed
    assert "[01:00:05] 接下来讨论发布窗口和回滚方案。" in trimmed


def test_merge_transcript_parts_keeps_only_new_content() -> None:
    parts = [
        "[00:00:28] 今天先过一下项目进度。",
        "[00:00:28] 今天先过一下项目进度。\n\n[00:01:03] 这周主要有两个问题。",
    ]

    merged = module.merge_transcript_parts(parts)

    assert merged.count("今天先过一下项目进度") == 1
    assert "[00:01:03] 这周主要有两个问题。" in merged


def test_build_segment_prompt_includes_global_timeline_and_context() -> None:
    segment = {
        "clip_start": 3540,
        "clip_end": 3660,
        "core_start": 3600,
        "core_end": 3660,
    }

    prompt = module.build_segment_prompt(segment, "[00:58:30] 上一段的最后一分钟内容")

    assert "00:59:00" in prompt
    assert "01:00:00" in prompt
    assert "上一段最后约 1 分钟的转写内容" in prompt
    assert "全局时间轴" in prompt


def test_render_combined_output_contains_both_sections() -> None:
    combined = module.render_combined_output("[00:00:28] 转写", "## 会议主题\n测试")

    assert "# 转写文稿" in combined
    assert "# 章节与摘要" in combined
    assert "[00:00:28] 转写" in combined
    assert "## 会议主题" in combined
