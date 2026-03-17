# Repository Structure

## Intent

EchoForge is the top-level repository for the audio intelligence system.

It keeps source adapters, core pipeline logic, runtime wrappers, prompts, profiles, and schemas in one place while keeping local secrets and runtime state outside version control.

## Top-Level Directories

- `adapters/sources/`
  - source-specific ingest modules such as Feishu Minutes or local file import
- `pipeline/`
  - source-agnostic processing logic
- `prompts/shared/`
  - reusable prompt fragments and stage prompts
- `prompts/profiles/`
  - scenario-specific prompt overrides
- `profiles/`
  - runtime processing profiles such as `work_meeting` or `lecture`
- `runtime/agent/`
  - thin wrapper for agent-triggered execution
- `runtime/cli/`
  - thin wrapper for local CLI execution
- `schemas/`
  - structured JSON or typed schemas for transcript and minutes outputs
- `scripts/`
  - developer utilities and one-off tooling
- `docs/`
  - architecture and design docs
- `state/`
  - local runtime state, intentionally gitignored

## Boundary Rules

- orchestration belongs in code, not in skill prompt text
- adapters should only handle source-specific ingestion concerns
- core intelligence logic should remain source-agnostic
- prompts should remain swappable and externalized
- secrets should live outside the repository or in a gitignored local directory
