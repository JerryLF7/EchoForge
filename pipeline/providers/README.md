# Audio Understanding Runtime

This directory contains the host-agent audio understanding runtime contract for EchoForge.

Current contract:
- input: recording metadata + audio path + profile-scoped scenario prompt
- execution: performed by the host agent, not by EchoForge directly
- output:
  - machine transcript JSON matching `schemas/transcript.schema.json`
  - human-readable transcript markdown for Obsidian publishing

Current state:
- `agent-native-audio-provider.js` defines the task/result protocol
- `provider-registry.js` exposes the built-in host-agent runtime metadata
- the host agent is responsible for model choice, credentials, and multimodal execution
