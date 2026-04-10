import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { importChatAudio } from "../pipeline/chat-import.js";
import { processBatchCommand } from "../runtime/cli/batch-commands.js";
import { loadProfile } from "../runtime/cli/profile-loader.js";
import {
  rebuildMinutesCommand,
  republishRunCommand,
} from "../runtime/cli/rebuild-commands.js";
import { validateStoredState } from "../runtime/cli/state-validation.js";
import { upsertRecordings } from "../runtime/store/recordings.js";
import { createFixtureRepo, writeJson, writeText } from "../test-support/repo-fixture.js";

test("batch processing, rebuild minutes, and republish work in a clean repo", async () => {
  const repoRoot = createFixtureRepo("pipeline");
  const audioPathA = path.join(repoRoot, "fixtures", "clip-a.ogg");
  const audioPathB = path.join(repoRoot, "fixtures", "clip-b.ogg");
  const resultPath = path.join(repoRoot, "fixtures", "audio-result.json");
  const batchPath = path.join(repoRoot, "fixtures", "batch.json");

  writeText(audioPathA, "fake audio a");
  writeText(audioPathB, "fake audio b");
  writeJson(resultPath, {
    language: "zh",
    summary: "讨论了目标与后续行动。",
    transcriptUtterances: [
      {
        speaker: "Speaker 1",
        start: 0,
        end: 15,
        text: "我们先把这周的重点收敛一下。",
        notes: [],
      },
      {
        speaker: "Speaker 2",
        start: 15,
        end: 32,
        text: "可以，我今天晚上把负责人和时间线整理出来。",
        notes: ["high confidence"],
      },
    ],
    obsidianTranscriptMarkdown: "## Transcript\n\n[00:00] **Speaker 1**: 我们先把这周的重点收敛一下。\n\n[00:15] **Speaker 2**: 可以，我今天晚上把负责人和时间线整理出来。",
    agent: {
      host: "openclaw",
      model: "host-managed-multimodal-model",
      sessionId: "session-test",
    },
  });

  const recordingA = importChatAudio({
    filePath: audioPathA,
    title: "clip-a",
  });
  const recordingB = importChatAudio({
    filePath: audioPathB,
    title: "clip-b",
  });
  upsertRecordings(repoRoot, [recordingA, recordingB]);

  writeJson(batchPath, {
    items: [
      {
        recordingId: recordingA.recordingId,
        audioResult: resultPath,
        profile: "work_meeting",
      },
      {
        recordingId: recordingB.recordingId,
        audioResult: resultPath,
        profile: "lecture",
      },
    ],
  });

  const batchResult = await processBatchCommand({
    repoRoot,
    batch: batchPath,
    defaultProfile: loadProfile(repoRoot, "general"),
  });

  assert.equal(batchResult.count, 2);
  assert.equal(batchResult.results[0].profile, "work_meeting");
  assert.equal(batchResult.results[1].profile, "lecture");

  const rebuilt = await rebuildMinutesCommand({
    repoRoot,
    runId: batchResult.results[0].runId,
    profile: loadProfile(repoRoot, "work_meeting"),
  });
  assert.equal(rebuilt.published.runId, batchResult.results[0].runId);

  const republished = await republishRunCommand({
    repoRoot,
    runId: batchResult.results[1].runId,
  });
  assert.equal(republished.published.runId, batchResult.results[1].runId);

  const validation = validateStoredState(repoRoot);
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
});
