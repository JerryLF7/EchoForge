# EchoForge

EchoForge is a Python CLI that turns audio into structured local knowledge artifacts.

The current pipeline targets three steps:

1. fetch or stage audio from Feishu Minutes or a local file
2. submit the audio to a supported ASR provider for transcription and meeting understanding
3. render the results into Obsidian Markdown notes

## Status

The Python implementation under `src/echoforge/` is the current pipeline. It has been verified end-to-end with Tingwu + R2 transit, and it also supports Doubao ASR.

EchoForge now also works with Feishu Minutes exports that already contain transcript and summary data. When `feishu_minutes_sync` exports a minute from the web page, EchoForge can render the standardized artifacts directly without sending the audio to a third-party ASR provider again.

One important integration constraint comes from the current provider APIs:

- offline transcription tasks require a public `FileUrl`
- local file paths are staged into `outputs/`, and the provider still needs an externally reachable HTTP or HTTPS URL

That means `process-file` is implemented, but you must provide `--media-url` unless your source already exposes a downloadable URL.

## Obsidian Output Structure

EchoForge uses the dual-file structure settled on 2026-04-16:

- Summary note: `meetings/{date}-{title}.md`
- Transcript note: `meetings/Transcripts/{date}-{title}-transcript.md`
- Vault index: `EchoForge Index.md`

The summary note links into transcript block anchors, so different upstream providers can share one rendering format.

## Standard Artifacts

EchoForge renders from a normalized artifact layer. Current standard files are:

- `transcription.json`
- `chapters.json`
- `summarization.json`
- `meeting_assistance.json`

Different upstream sources can map into the same shape:

- Tingwu returns all four categories directly
- Doubao returns transcription, chapters, summarization, and information extraction URLs
- Feishu Minutes web export now produces:
  - `transcript.vtt`
  - `transcription.json`
  - `summarization.json`
  - `chapters.json`

This keeps the final Obsidian output stable across providers.

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Configuration

Copy `.env.example` to `.env` and fill in at least:

```bash
TINGWU_ACCESS_KEY_ID=...
TINGWU_ACCESS_KEY_SECRET=***
TINGWU_APP_KEY=...
OBSIDIAN_VAULT_PATH=/path/to/vault
```

Doubao configuration:

```bash
ECHOFORGE_UNDERSTANDING_PROVIDER=doubao
DOUBAO_APP_KEY=...
DOUBAO_ACCESS_KEY=...
OBSIDIAN_VAULT_PATH=/path/to/vault
```

Optional Feishu settings:

```bash
FEISHU_MINUTES_SYNC_BIN=feishu-minutes-sync
FEISHU_MINUTES_SYNC_EXPORTS_DIR=./exports
```

Feishu Minutes web export workflow:

1. Use `feishu_minutes_sync export-minute --token <minute_token> --fetch-mode web`
2. Exported files land under `exports/<minute_token>/`
3. Render the transcript directly with `render-transcript`, or feed the normalized JSON files into the full EchoForge renderer

## Commands

```bash
python -m echoforge process-feishu <minute_token>
python -m echoforge process-feishu <minute_token> --output-vault ~/Obsidian/vault
python -m echoforge process-file ./recording.ogg --media-url https://example.com/recording.ogg
python -m echoforge render <run_id>
python -m echoforge render-transcript ./transcription.json --title "导入转写" --output-vault ~/Obsidian/vault
python -m echoforge list-runs
python -m echoforge inspect-run <run_id>
```

Render a transcript from Feishu Minutes standardized export:

```bash
python -m echoforge render-transcript \
  ../feishu_minutes_sync/exports/<minute_token>/transcription.json \
  --title "会议标题" \
  --output-vault ~/Obsidian/vault \
  --note-name imported-transcript \
  --source-label "Feishu Minutes WEBVTT"
```

Use `python -m echoforge --help` for the full CLI.

## Layout

```text
EchoForge/
├── config/
├── outputs/
├── src/echoforge/
└── tests/
```

Typical run artifacts:

```text
outputs/runs/run_<timestamp>_<hash>/
├── run.json
├── media.ogg
└── results/
    ├── transcription.json
    ├── chapters.json
    ├── summarization.json
    └── meeting_assistance.json
```

## Testing

```bash
pytest
```
