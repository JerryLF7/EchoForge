# Audio Understanding Providers

This directory contains pluggable provider adapters for EchoForge's agent-native audio understanding stage.

Provider contract:
- input: recording metadata + audio path + profile-scoped scenario prompt
- output: understood transcript JSON matching `schemas/transcript.schema.json`

Current state:
- `stub` exists for contract validation
- real providers should normalize their result into the shared transcript schema
