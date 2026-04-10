---
name: echoforge-chat-audio
description: Use this skill when the user uploads an audio file in chat and wants EchoForge to run the full agent-native pipeline. It prepares a host-agent audio-understanding task, uses the current agent model to produce the result JSON directly, completes the run, validates the output, and reports the generated artifacts.
---

# EchoForge Chat Audio

Use this skill when the user provides a local audio attachment and wants the whole EchoForge flow to run from chat.

## What This Skill Does

- treats the uploaded file as a local recording
- runs `echoforge-agent prepare-understanding local`
- uses the current host agent model to understand the audio directly
- writes a result JSON matching `schemas/agent-audio-result.schema.json`
- runs `echoforge-agent complete-understanding recording ... --result <file>`
- validates the finished run with `echoforge inspect validate <runId>`

## Rules

- do not ask the user for API keys, providers, or model ids
- do not introduce direct model SDK calls into EchoForge
- default profile choice:
  - `work_meeting` for meetings, standups, planning, collaboration audio
  - `lecture` for talks, lessons, presentations
  - `general` otherwise
- keep the transcript split intentional:
  - `transcript.json` is the machine transcript for downstream intelligence
  - `transcript.md` is the human-readable transcript for Obsidian

## Workflow

1. Resolve the uploaded file path from the chat attachment.
2. Pick the profile from the file context or the user's wording.
3. Run:
   - `node runtime/agent/main.js prepare-understanding local --file "<path>" --profile <profile> [--title "<title>"]`
4. Read the emitted JSON task.
5. Produce a result object that matches `schemas/agent-audio-result.schema.json`.
   - Required top-level fields:
     - `language`
     - `summary`
     - `transcriptUtterances`
     - `obsidianTranscriptMarkdown`
   - Optional agent metadata:
     - `agent.host`
     - `agent.model`
     - `agent.sessionId`
6. Write that result JSON to `/tmp/echoforge-audio-result.json`.
7. Run:
   - `node runtime/agent/main.js complete-understanding recording <recordingId> --profile <profile> --result /tmp/echoforge-audio-result.json`
8. Run:
   - `node runtime/cli/main.js inspect validate <runId>`
9. Return the run id, validation result, and artifact paths.

## Result Quality Bar

- `transcriptUtterances` should stay close to the spoken content
- timestamps can be coarse seconds if alignment is uncertain
- infer speakers when possible; otherwise use labels like `Speaker 1`
- `obsidianTranscriptMarkdown` should be readable enough to publish directly
- summary should be useful for the selected profile

## References

- For the exact result shape, read `schemas/agent-audio-result.schema.json`.
- For profile-specific prompting and sections, read `profiles/<profile>.json`.
- For a concrete host-agent flow example, read `skills/echoforge-chat-audio/references/example-session.md`.
