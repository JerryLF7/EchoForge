# Repository Structure

## Intent

EchoForge is the top-level repository for the audio intelligence system.

It keeps source adapters, core pipeline logic, runtime wrappers, profiles, and schemas in one place while keeping runtime state outside version control.

## Top-Level Directories

- `adapters/sources/`
  - source-specific ingest modules such as Feishu Minutes or local file import
- `pipeline/`
  - source-agnostic processing logic
- `pipeline/providers/`
  - host-agent audio understanding task/result contract
- `profiles/`
  - scenario guidance such as `work_meeting` or `lecture`
- `runtime/agent/`
  - thin wrapper for host-agent task preparation and completion
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
- host-agent model choice and credentials should remain outside EchoForge
