# EchoForge

EchoForge is an agent-native audio intelligence pipeline.

It is designed to turn raw audio into structured, reusable knowledge artifacts such as:

- timestamped transcripts
- speaker-separated utterances
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

The result should be a structured transcript artifact that is already biased toward the target scenario instead of a plain raw ASR dump.

Provider adapters for this stage live under `pipeline/providers/`.

Profiles explicitly declare the target provider, model, prompt, and capability expectations for this stage.

## Repository Layout

```text
EchoForge/
├── adapters/
│   └── sources/
├── docs/
├── pipeline/
├── profiles/
├── prompts/
│   ├── profiles/
│   └── shared/
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
