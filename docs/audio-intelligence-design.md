# Audio Intelligence Pipeline Design

## Goal

EchoForge is an agent-native audio intelligence pipeline for turning raw recordings into reusable knowledge artifacts.

The project is optimized for a host-agent workflow:

- a host agent such as OpenClaw is the only entry surface
- EchoForge provides the pipeline, state model, artifact contracts, and publishing logic
- the host agent uses its own configured multimodal model to understand audio
- EchoForge does not manage API keys, providers, or model selection

The first target experience is Feishu-Minutes-like output for meetings and lectures, but the architecture is source-agnostic and can grow beyond Feishu.

## Product Shape

The intended delivery is a CLI tool that can be wrapped as a skill by a host agent.

Why this shape:

- the pipeline stays deterministic and testable in code
- the host agent can call it as a skill without reimplementing orchestration in prompts
- local replay and debugging stay simple through the CLI
- model/runtime concerns remain with the host agent, where they already belong

In practice, the user experience is:

1. the host agent invokes EchoForge
2. EchoForge prepares or loads a recording
3. EchoForge emits a structured audio-understanding task
4. the host agent runs multimodal understanding with its own model/session
5. the host agent returns a structured result JSON
6. EchoForge resumes the pipeline and publishes artifacts

## Design Principles

### Agent-native, not provider-native

EchoForge assumes the host agent already knows how to call a multimodal model.

So EchoForge should not introduce:

- provider selection UX
- provider-specific adapters for model calls
- API key configuration
- model-id configuration inside profiles

The only runtime assumption is that the host agent is currently using a model that can understand audio well enough for the requested profile.

### One machine transcript, one human transcript

The audio-understanding stage produces two different outputs on purpose:

- `transcript.json`: the machine transcript used by downstream chaptering and intelligence
- `transcript.md`: the human-readable transcript written to Obsidian-friendly output

They are related, but not interchangeable.

The machine transcript should stay structurally stable and close to the spoken content.
The human transcript can be lightly cleaned for readability.

### Structured artifacts over opaque blobs

Every downstream stage should read stable JSON artifacts instead of re-parsing large markdown blobs.

Current artifact flow:

- `recording.json`
- `transcript.json`
- `transcript.md`
- `chapters.json`
- `minutes.json`
- `minutes.md`
- `run.json`

### Profiles shape behavior, not infrastructure

Profiles define scenario intent.

They currently control:

- scenario prompt
- terminology hints
- output preset
- enabled sections such as `todos` or `glossary`

Profiles do not define:

- API credentials
- provider names
- concrete model ids

## Current Runtime Architecture

```text
host agent / skill wrapper
        |
        v
runtime/agent/main.js
        |
        +--> prepare-understanding
        |      |
        |      v
        |  build host-agent task JSON
        |
        +--> complete-understanding --result <result.json>
               |
               v
        pipeline/orchestrator.js
               |
               +--> understand-audio
               +--> chapterize
               +--> intelligence
               +--> publish
```

The normal CLI at `runtime/cli/main.js` remains useful for local inspection, replay, and debugging.
The agent wrapper at `runtime/agent/main.js` is the host-agent contract surface.

## Pipeline Stages

### 1. Ingest

Responsibility:

- normalize a new audio input into a recording record
- assign a stable `recordingId`
- preserve source metadata and local audio path

Primary output:

- `recording.json`

### 2. Audio understanding

Responsibility:

- prepare a host-agent task for multimodal understanding
- accept the host agent's structured result
- normalize that result into EchoForge transcript artifacts

Important detail:

This stage is not a direct model call. It is a handoff boundary between EchoForge and the host agent.

Primary outputs:

- `transcript.json`
- `transcript.md`

### 3. Chapterize

Responsibility:

- segment the machine transcript into semantic chunks
- assign titles, summaries, and timestamps
- preserve the source transcript role for traceability

Primary output:

- `chapters.json`

### 4. Intelligence

Responsibility:

- generate structured minutes sections from the machine transcript and chapters
- apply output-preset heuristics for meetings vs lectures
- keep traceability back to transcript/chapter sources

Current sections include:

- `summary`
- `chapters`
- `decisions`
- `todos`
- `quotes`
- `links`
- `glossary`

Primary output:

- `minutes.json`

### 5. Publish

Responsibility:

- persist all JSON artifacts
- render Obsidian-ready markdown
- write run metadata for later rebuilds and inspection

Primary outputs:

- `minutes.md`
- `run.json`

## Host-Agent Protocol

The host-agent protocol is the most important boundary in the current system.

### Prepare phase

`runtime/agent/main.js prepare-understanding ...` emits a task object with:

- `taskSchema`: `agent-audio-task.schema.json`
- `taskKind`: `audio_understanding`
- `taskVersion`: `2026-03-17`
- `recording`: normalized recording metadata plus local audio path
- `profile`: scenario identity and output preset
- `guidance`: scenario prompt, terminology hints, transcript instructions, and speaker/timestamp guidance
- `resultContract`: expected JSON result shape and schema pointer

The task is designed for the host agent to execute with its own multimodal context and model session.

### Complete phase

The host agent writes a JSON result and then calls:

`runtime/agent/main.js complete-understanding ... --result <file>`

That result is expected to contain:

- `language`
- `summary`
- `transcriptUtterances`
- `obsidianTranscriptMarkdown`
- optional `agent.host`, `agent.model`, `agent.sessionId`

Formal schemas live in:

- `schemas/agent-audio-task.schema.json`
- `schemas/agent-audio-result.schema.json`

## Artifact Contracts

### Machine transcript

`transcript.json` is the canonical machine-readable transcript.

Key guarantees:

- `contentRole` is always `machine_transcript`
- downstream stages must consume this artifact, not the markdown transcript
- `provider.kind` records that the transcript came from host-agent multimodal audio understanding
- `understanding` stores the prompt profile and transcript-generation context

### Human transcript

`transcript.md` is for direct reading and publishing.

Key guarantees:

- it is the Obsidian-facing transcript artifact
- it may be lightly cleaned for readability
- it is not the source of truth for downstream NLP logic

### Chapters and minutes provenance

To avoid mixing human-readable output with machine-processing input:

- `chapters.json.sourceTranscript.contentRole` must stay `machine_transcript`
- `minutes.json.sourceArtifacts` records transcript and chapter provenance
- `minutes.json.sourceArtifacts.transcriptMarkdownRole` is `human_readable_transcript`

This split keeps intelligent minutes anchored to a stable machine transcript while still publishing a nicer transcript to the vault.

## Repository Responsibilities

### `runtime/agent/`

The host-agent integration surface.

Responsibilities:

- emit audio-understanding tasks
- resume the pipeline with a host-produced result

### `runtime/cli/`

Operational and debugging entrypoints.

Responsibilities:

- local processing
- inspection commands
- schema availability checks
- legacy artifact validation and repair

### `pipeline/providers/`

Despite the directory name, this is now effectively the host-agent protocol layer for audio understanding.

Current behavior:

- resolves the built-in `agent-native` runtime
- builds the understanding request
- normalizes host-agent result payloads

It should not drift back toward direct provider SDK integrations unless the product direction changes.

### `pipeline/stages/`

Pure pipeline logic.

Responsibilities:

- understand audio result normalization
- chapter extraction
- minutes generation
- artifact publishing

### `schemas/`

The artifact and protocol contracts.

Current schemas cover:

- recordings
- profiles
- transcripts
- chapters
- minutes
- runs
- host-agent task/result payloads

## Near-term Priorities

1. improve host-agent skill ergonomics around `prepare-understanding` and `complete-understanding`
2. harden schema-aware validation beyond file-existence and JSON parse checks
3. refine intelligence extraction quality for meetings and lectures
4. add more source adapters once the host-agent path is stable

## Non-goals for the current architecture

These ideas are intentionally out of scope for now:

- direct API-key management inside EchoForge
- per-profile model configuration
- embedding provider SDK calls into the pipeline
- making markdown the source of truth for downstream intelligence
- coupling the system to Feishu as the only source
