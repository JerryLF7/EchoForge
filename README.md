# EchoForge

EchoForge is an agent-native audio intelligence pipeline.

It is designed to turn raw audio into structured, reusable knowledge artifacts such as:

- machine transcripts for downstream intelligence
- human-readable transcripts for Obsidian
- chaptered timelines
- AI minutes and summaries
- Obsidian-ready markdown outputs

## Project Positioning

EchoForge is the main project.

It is not limited to Feishu Minutes. Feishu support is only one source adapter among others.

The project is designed to be:

- agent-first
- CLI-debuggable
- modular
- prompt-configurable
- portable across machines

The core assumption is:

- EchoForge is invoked by a host agent such as OpenClaw
- EchoForge does not own model credentials
- EchoForge does not choose a model directly
- the host agent performs multimodal audio understanding and returns a structured result

## Current Direction

The first end-to-end source flow is:

- Feishu Minutes audio discovery
- raw audio download
- multimodal audio understanding with scenario prompts
- intelligent minutes generation
- Obsidian publishing

## Audio Understanding

EchoForge treats transcript generation as an agent-native audio understanding step.

That stage should accept:
- the raw audio file
- a scenario-specific prompt from the active profile
- optional terminology hints and context

The result should be two related artifacts:

- a machine transcript for downstream chaptering and minutes generation
- a human-readable transcript for direct writing into Obsidian

EchoForge itself does not call a model API directly.
Instead, `runtime/agent/` emits a task contract for the host agent and then accepts the host agent's JSON result.

Profiles declare:

- scenario prompt
- terminology hints
- capability expectations

They do not declare API keys, providers, or concrete model ids.

## Host-Agent Flow

Recommended flow:

1. `echoforge ingest ...` or `echoforge-agent prepare-understanding ...`
2. host agent reads the emitted task spec
3. host agent uses its own multimodal model session to understand the audio
4. host agent writes a JSON result file
5. `echoforge process ... --audio-result <file>` or `echoforge-agent complete-understanding ...`

The host-agent result is expected to contain:

- `transcriptUtterances` for machine consumption
- `obsidianTranscriptMarkdown` for direct human reading

## Repository Layout

```text
EchoForge/
├── adapters/
│   └── sources/
├── docs/
├── pipeline/
│   └── providers/
├── profiles/
├── runtime/
│   ├── agent/
│   └── cli/
├── schemas/
├── scripts/
└── state/
```

## Relationship to Other Repositories

`feishu-minutes-sync` remains a dedicated Feishu source adapter repository.

EchoForge is the larger system that will later either:

- import the adapter logic
- wrap it
- or absorb a refined version of it into `adapters/sources/feishu_minutes`

## Design Document

See `docs/audio-intelligence-design.md` for the current system design.
