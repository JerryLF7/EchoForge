# Audio Intelligence Pipeline Design

## Goal

Build an agent-native audio intelligence system that recreates the useful parts of Feishu Minutes AI while keeping the workflow local, modular, and portable.

The system should:

- accept audio from multiple sources, with Feishu Minutes as the first source adapter
- use agents as the primary runtime instead of a traditional GUI
- keep a CLI for debugging and batch testing
- support pluggable prompts for different scenarios
- produce structured meeting or lecture outputs suitable for Obsidian
- treat `feishu_minutes_sync` as one source module, not as the whole project

## Product Direction

This is not just a downloader and not just a transcript summarizer.

It is a layered audio intelligence pipeline:

1. ingest raw audio from one or more sources
2. transcribe and structure the audio
3. generate meeting or lecture intelligence artifacts
4. publish structured outputs into a note system such as Obsidian

The target experience is closer to Feishu Minutes AI than to a plain ASR tool.

## Key Constraints

### Agent-first runtime

The project should be designed for native agent invocation.

Why:

- no separate GUI is needed for normal use
- no separate API key UX is needed for the end user
- the same pipeline can be triggered by OpenClaw or other agent runtimes
- audio from other surfaces can be handed to the same pipeline without building dedicated frontends

Implication:

- business logic must live in reusable modules
- runtime entrypoints should be thin wrappers
- CLI remains available only for debugging, replay, and local testing

### Modular prompts

Different audio scenarios need different processing styles.

Examples:

- company meeting
- lecture or talk
- interview
- personal voice memo
- brainstorming session

Implication:

- prompts must not be hardcoded into the main logic
- prompts should be split by stage and by scenario profile
- stage prompts should be independently replaceable

### Feishu is only one source

`feishu_minutes_sync` should be treated as a source adapter.

It is responsible for:

- discovering new Feishu Minutes recordings
- extracting real downloadable audio URLs
- downloading raw audio
- emitting normalized metadata

It is not responsible for the whole intelligence pipeline.

## What We Need to Recreate from Feishu AI

Based on observed Feishu AI output, the useful target product contains two large capability groups.

### 1. Structured transcription

This is more than raw ASR text.

Needed outputs:

- timestamped transcript
- speaker separation
- chapter segmentation
- chapter timeline
- key utterance extraction

### 2. Intelligent minutes

This is the harder part.

Observed Feishu output is organized into stable sections rather than a single summary blob.

Common sections observed:

- summary
- intelligent chapters
- key decisions
- quote highlights
- related links

In work meeting scenarios, an additional section appears:

- todos
n
This means the system should generate multiple structured views from the same transcript, not a single generic summary.

## System Architecture

Recommended top-level architecture:

```text
project/
├── adapters/
│   └── sources/
│       ├── feishu_minutes/
│       ├── local_file/
│       └── ...
├── pipeline/
│   ├── ingest/
│   ├── transcribe/
│   ├── chapterize/
│   ├── intelligence/
│   └── publish/
├── prompts/
│   ├── shared/
│   └── profiles/
├── profiles/
│   ├── work_meeting/
│   ├── lecture/
│   ├── interview/
│   └── general/
├── runtime/
│   ├── agent/
│   └── cli/
├── schemas/
├── docs/
└── state/
```

## Major Modules

### Source adapters

Responsibility:

- discover audio items from a source
- download or normalize the source asset
- return a standard source record

First adapter:

- `feishu_minutes`

Future adapters:

- local file import
- direct message audio import
- manual drop folder

### Ingest layer

Responsibility:

- accept audio input from adapters
- assign a stable recording id
- normalize metadata such as title, source, created time, and original path
- hand off to downstream processing

### Transcribe layer

Responsibility:

- run ASR
- retain timestamps
- support speaker diarization if the model or backend supports it
- output utterance-level transcript blocks

Output should not be a single string. It should be structured.

### Chapterize layer

Responsibility:

- segment the transcript into semantic chapters
- assign chapter titles
- attach start and end timestamps
- summarize each chapter

This layer is essential because it creates the skeleton that later minutes generation depends on.

### Intelligence layer

Responsibility:

- generate the Feishu-like output sections
- work from transcript plus chapter structure
- use scenario-specific prompts

Target subsections:

- summary
- intelligent chapters
- todos
- decisions
- quotes
- related links
- optional participant viewpoints
- optional glossary or concepts

This is the true core of the project.

### Publish layer

Responsibility:

- convert structured outputs into final Markdown files
- optionally generate sidecar JSON for machine reuse
- publish to Obsidian-friendly paths

The first version can target a single vault path.

Vault routing between work and life can be added later.

## Delivery and Installation Strategy

The final delivery should be a local project, not a GUI application and not a skill-only bundle.

Recommended shape:

- one standalone repository for the full pipeline
- one CLI entrypoint as the operational core
- one optional OpenClaw skill as a thin wrapper
- externalized config, prompts, and local state

This keeps the project portable, testable, and agent-friendly.

### Why CLI is the core

The project should expose a single master command or master entrypoint.

Reasons:

- orchestration belongs in code, not in prompt instructions
- the same codepath can be used by CLI, agent runtime, and future schedulers
- migration is easier because the runtime contract stays stable
- internal modules can evolve without changing the outer interface too often

Examples of top-level actions:

- sync audio from Feishu
- process one local audio file
- rebuild minutes for one existing recording
- publish results to Obsidian

### Skill boundary

If a skill is added later, it should not manually coordinate many internal scripts.

The skill should only:

- decide when this project is the right tool
- pass parameters to the master command
- explain the high-level usage contract to the agent

The skill should not contain the real orchestration logic.

That logic belongs in the project code.

### Installation shape

Recommended install model:

- clone repository
- create local Python environment
- install dependencies
- copy config template
- restore auth state and local paths
- run health check or dry run

This makes migration simple and keeps secrets outside version control.

### Portability requirements

To stay easy to migrate, the project should keep these boundaries:

- code separate from local state
- config separate from code
- prompts separate from code
- adapters separate from core pipeline
- agent wrapper separate from business logic

On a new machine, migration should mostly mean:

1. clone the repo
2. create the environment
3. restore config
4. restore auth state
5. verify one dry run

## Runtime Design

### Agent runtime

Primary runtime.

Responsibilities:

- accept source material through agent interactions
- choose a processing profile
- invoke the pipeline modules
- return progress or final outputs when needed

Examples:

- agent fetches newly synced Feishu recordings on schedule
- user sends an audio file directly to the agent
- user asks the agent to re-run minutes generation with another profile

### CLI runtime

Secondary runtime.

Responsibilities:

- local debugging
- replay and batch processing
- pipeline validation
- profile comparison

CLI should wrap the same module graph used by the agent runtime.

## Prompt Strategy

Prompts should be split by stage.

Recommended prompt groups:

- transcript cleanup
- speaker normalization
- chapter segmentation
- chapter summarization
- global summary
- todo extraction
- decision extraction
- quote extraction
- related link generation

Prompts should also support profiles.

Example profile mapping:

- `work_meeting`
  - stronger todo and decision extraction
  - more concise operational summary
- `lecture`
  - stronger concept extraction
  - more emphasis on knowledge points and quote highlights
- `interview`
  - stronger speaker viewpoint separation
- `general`
  - fallback balanced mode

This design keeps the pipeline stable while making the behavior adjustable.

## Output Schema

A structured schema is needed before final Markdown rendering.

Suggested first version:

```json
{
  "metadata": {
    "recording_id": "string",
    "title": "string",
    "source_type": "feishu_minutes",
    "source_url": "string",
    "start_time": "string",
    "end_time": "string",
    "duration_seconds": 0,
    "profile": "work_meeting"
  },
  "transcript": {
    "utterances": [
      {
        "start": 0.0,
        "end": 0.0,
        "speaker": "Speaker 1",
        "text": "string"
      }
    ]
  },
  "chapters": [
    {
      "title": "string",
      "start": 0.0,
      "end": 0.0,
      "summary": "string",
      "speakers": ["Speaker 1"],
      "highlights": ["string"]
    }
  ],
  "minutes": {
    "summary": "string",
    "todos": [
      {
        "task": "string",
        "owner": "string",
        "evidence": "string"
      }
    ],
    "decisions": [
      {
        "decision": "string",
        "rationale": "string",
        "evidence": "string"
      }
    ],
    "quotes": [
      {
        "text": "string",
        "speaker": "string",
        "timestamp": 0.0
      }
    ],
    "related_links": [
      {
        "title": "string",
        "target": "string",
        "reason": "string"
      }
    ]
  }
}
```

This schema separates reusable structured data from final presentation.

## Obsidian Output Shape

The first markdown target should resemble Feishu Minutes structure while remaining note-friendly.

Suggested layout:

```markdown
# {Title}

- Source: {source}
- Time: {time range}
- Duration: {duration}
- Profile: {profile}

## 总结

...

## 智能章节

### 1. {chapter title} [{start} - {end}]

- 摘要: ...
- 关键点:
  - ...

## 待办

- [ ] ...

## 关键决策

- ...

## 金句时刻

> ...

## 相关链接

- [[...]]
```

This can be evolved later with vault routing, Dataview fields, and sidecar metadata files.

## Relationship to Existing Skills

### `long-audio-transcript-processor`

Useful for:

- long transcript cleanup
- continuity across segments
- terminology tracking
- iterative refinement

Not sufficient for:

- source ingestion
- automatic chapter timeline generation
- full Feishu-style minutes productization

### `long-audio-to-obsidian`

Useful for:

- final document consolidation
- archiving processed artifacts into Obsidian-friendly markdown

Not sufficient for:

- intelligent content generation
- multi-view minutes output design

## Recommended Development Order

### Phase 1: Foundation

- define project structure
- define shared schema
- isolate `feishu_minutes_sync` as a source adapter
- add a local file source adapter stub

### Phase 2: Structured transcription

- choose ASR backend strategy
- produce utterance-level structured transcript
- add speaker separation support
- add chapter segmentation

### Phase 3: Intelligence generation

- build profile-based prompts
- generate summary, decisions, todos, quotes, and chapter summaries
- compare outputs across work meeting and lecture samples

### Phase 4: Publishing

- generate Obsidian-friendly markdown
- optionally generate machine-readable JSON sidecars

### Phase 5: Runtime integration

- wire to agent runtime
- keep CLI as a debug surface
- add scheduling later if needed

## Decisions Made So Far

- no GUI as a primary interface
- agent-first, CLI-second
- Feishu Minutes support exists as a source module, not as the whole product
- prompt behavior must be modular and scenario-specific
- work/life vault routing is valuable but postponed

## Open Questions

- which ASR backend should be used first
- whether diarization is done by ASR backend or by a separate stage
- how much post-processing should be deterministic rules vs LLM prompts
- whether related links should be inferred from Obsidian contents in the first version or added later
- how aggressively to optimize for exact Feishu output parity versus practical usefulness

## Immediate Next Step

Start converting the current Feishu downloader into a source adapter inside the larger architecture, then define the transcript and minutes schemas before implementing the intelligence layer.
