# Example Session

For an uploaded meeting audio file:

1. Run:
   - `node runtime/agent/main.js prepare-understanding local --file "/path/to/file.ogg" --profile work_meeting`
2. Read the returned `recordingId` and task JSON.
3. Create `/tmp/echoforge-audio-result.json` with:
   - `language`
   - `summary`
   - `transcriptUtterances`
   - `obsidianTranscriptMarkdown`
   - optional `agent` metadata
4. Run:
   - `node runtime/agent/main.js complete-understanding recording <recordingId> --profile work_meeting --result /tmp/echoforge-audio-result.json`
5. Validate:
   - `node runtime/cli/main.js inspect validate <runId>`

Expected final outputs include:

- `transcript.json`
- `transcript.md`
- `chapters.json`
- `minutes.json`
- `minutes.md`
- `run.json`
