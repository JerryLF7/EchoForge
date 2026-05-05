# EchoForge

EchoForge is a Python CLI that turns audio into structured local knowledge artifacts.

The pipeline covers three steps:

1. Fetch or stage audio from Feishu Minutes or a local file
2. Submit the audio to a supported ASR provider for transcription and meeting understanding
3. Render the results into Obsidian Markdown notes

## Status

The Python implementation under `src/echoforge/` has been verified end-to-end with three provider modes:

| Provider | ASR | Chapters | Summary | QA/Actions | Config value |
|----------|-----|----------|---------|------------|--------------|
| **Doubao Lark Minutes** (推荐) | ✅ | ✅ | ✅ | ✅ | `doubao` |
| **Doubao Speech** (纯 ASR) | ✅ | — | — | — | `doubao-speech` |
| **Tingwu** | ✅ | ✅ | ✅ | ✅ | `tingwu` |

Switch between them via `ECHOFORGE_UNDERSTANDING_PROVIDER` in `.env`.

**Recent additions:**

- **Three ASR provider options**: Tingwu, Doubao Lark Minutes (妙记, with full understanding), Doubao Speech bigmodel (ASR-only)
- **Gemini post-processing**: Optional summarization, chapter extraction, Q&A, and action items generated from the transcript markdown
- **Long-audio segmentation**: Files longer than 119 minutes are automatically split at silence points and processed in parallel
- **State persistence**: All runs are tracked in `outputs/runs.json` with `list-runs` and `inspect-run` commands

EchoForge also works with Feishu Minutes exports that already contain transcript and summary data. When `feishu_minutes_sync` exports a minute from the web page, EchoForge can render the standardized artifacts directly without sending the audio to a third-party ASR provider again.

One important integration constraint comes from the current provider APIs:

- Offline transcription tasks require a public `FileUrl`
- Local file paths are staged into `outputs/`, and the provider still needs an externally reachable HTTP or HTTPS URL

That means `process-file` is implemented, but you must provide `--media-url` or configure R2 transit unless your source already exposes a downloadable URL.

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

- **Doubao Lark Minutes** (recommended) returns transcription, chapters, summarization, and meeting assistance URLs in one API call
- **Doubao Speech** returns only transcription (ASR-only bigmodel edition)
- **Tingwu** returns all four categories directly
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
# ASR provider selection: doubao | doubao-speech | tingwu
ECHOFORGE_UNDERSTANDING_PROVIDER=doubao

# Doubao Lark Minutes (recommended, provider = doubao)
DOUBAO_APP_KEY=...
DOUBAO_ACCESS_KEY=...

# Doubao Speech bigmodel (provider = doubao-speech, ASR only)
DOUBAO_SPEECH_APPID=...
DOUBAO_SPEECH_TOKEN=...

# Tingwu (provider = tingwu)
TINGWU_ACCESS_KEY_ID=...
TINGWU_ACCESS_KEY_SECRET=***
TINGWU_APP_KEY=...

# R2 transit (required for Tingwu, optional for Doubao)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=echoforge-transit

# Obsidian
OBSIDIAN_VAULT_PATH=/path/to/vault

# Optional: Gemini post-processing
GEMINI_API_KEY=***
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_MODEL=gemini-2.0-flash
GEMINI_ENABLE_SUMMARY=true
```

Optional Feishu settings:

```bash
FEISHU_MINUTES_SYNC_BIN=feishu-minutes-sync
FEISHU_MINUTES_SYNC_EXPORTS_DIR=./exports
FEISHU_MINUTES_SYNC_CONFIG_PATH=/path/to/feishu_minutes_sync/config.json
```

When `FEISHU_MINUTES_SYNC_CONFIG_PATH` is set, EchoForge passes `--config` to the feishu-minutes-sync CLI and sets the working directory to the config file's parent, so relative paths in the config resolve correctly.

Feishu Minutes web export workflow:

1. Use `feishu_minutes_sync export-minute --token <minute_token> --fetch-mode web`
2. Exported files land under `exports/<minute_token>/`
3. Render the transcript directly with `render-transcript`, or feed the normalized JSON files into the full EchoForge renderer

## Commands

```bash
# Process audio
python -m echoforge process-feishu <minute_token>
python -m echoforge process-file ./recording.ogg --media-url https://example.com/recording.ogg

# Re-render an existing run
python -m echoforge render <run_id>

# Render a standalone transcript JSON
python -m echoforge render-transcript ./transcription.json --title "导入转写" --output-vault ~/Obsidian/vault

# State management
python -m echoforge list-runs
python -m echoforge list-runs --status failed
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
│   └── runs.json
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
