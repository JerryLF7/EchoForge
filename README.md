# EchoForge

EchoForge is a Python CLI that turns audio into structured local knowledge artifacts.

The current pipeline targets three steps:

1. fetch or stage audio from Feishu Minutes or a local file
2. submit the audio to Alibaba Cloud Tingwu for transcription and meeting understanding
3. render the results into Obsidian Markdown notes

## Status

The Python implementation under `src/echoforge/` is the current pipeline. It has been verified end-to-end (Tingwu API + R2 transit).

One important integration constraint comes from the current Tingwu documentation:

- as of 2026-03-23, offline transcription tasks require `Input.FileUrl`
- local file paths are staged into `outputs/`, but Tingwu still needs an externally reachable HTTP or HTTPS URL

That means `process-file` is implemented, but you must provide `--media-url` unless your source already exposes a downloadable URL.

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
TINGWU_ACCESS_KEY_SECRET=...
TINGWU_APP_KEY=...
OBSIDIAN_VAULT_PATH=/path/to/vault
```

Optional Feishu settings:

```bash
FEISHU_MINUTES_SYNC_BIN=feishu-minutes-sync
FEISHU_MINUTES_SYNC_EXPORTS_DIR=./exports
```

## Commands

```bash
python -m echoforge process-feishu <minute_token>
python -m echoforge process-feishu <minute_token> --output-vault ~/Obsidian/vault
python -m echoforge process-file ./recording.ogg --media-url https://example.com/recording.ogg
python -m echoforge render <run_id>
python -m echoforge list-runs
python -m echoforge inspect-run <run_id>
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

## Testing

```bash
pytest
```
