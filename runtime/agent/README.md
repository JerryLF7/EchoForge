# Agent Runtime

This directory contains the thin agent-facing execution wrapper.

The wrapper should translate a host-agent request into EchoForge task/result steps without duplicating orchestration logic.

Current contract:

- `prepare-understanding ...`
  - creates or resolves a recording
  - emits an audio understanding task spec for the host agent
- `complete-understanding recording <recordingId> --result <result.json>`
  - accepts the host agent's JSON result
  - runs the normal EchoForge pipeline
