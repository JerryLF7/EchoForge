import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { repairStoredState } from "../runtime/cli/state-repair.js";
import { validateStoredState } from "../runtime/cli/state-validation.js";
import { createFixtureRepo, writeJson } from "../test-support/repo-fixture.js";

test("repairStoredState upgrades legacy run artifacts and indexes", async () => {
  const repoRoot = createFixtureRepo("repair");
  const runIdA = "run_legacy_alpha";
  const runIdB = "legacy_beta";
  const runDirA = path.join(repoRoot, "state", "runs", runIdA);
  const runDirB = path.join(repoRoot, "state", "runs", runIdB);

  writeJson(path.join(repoRoot, "state", "runs.json"), {
    items: {
      [runIdA]: {
        runId: runIdA,
        recordingId: "rec_alpha",
        profile: "work_meeting",
        provider: {
          id: "stub",
          model: "unconfigured",
        },
        startedAt: "2026-03-17T00:00:00.000Z",
        completedAt: "2026-03-17T00:00:01.000Z",
        status: "completed",
        artifacts: {
          recording: path.join(runDirA, "recording.json"),
          transcript: path.join(runDirA, "transcript.json"),
          chapters: path.join(runDirA, "chapters.json"),
          minutes: path.join(runDirA, "minutes.json"),
          markdown: path.join(runDirA, "minutes.md"),
        },
      },
    },
  });

  writeJson(path.join(runDirA, "recording.json"), {
    recordingId: "rec_alpha",
    source: {
      kind: "local_file",
      itemId: "/tmp/alpha.ogg",
      url: null,
    },
    title: "alpha",
    capturedAt: "2026-03-17T00:00:00.000Z",
    participants: [],
    audio: {
      path: "/tmp/alpha.ogg",
      format: "ogg",
      durationSeconds: 0,
      checksum: "pending",
    },
    ingest: {
      status: "normalized",
      ingestedAt: "2026-03-17T00:00:02.000Z",
      notes: ["legacy"],
    },
    metadata: {},
  });
  writeJson(path.join(runDirA, "transcript.json"), {
    recordingId: "rec_alpha",
    language: "zh",
    utterances: [
      {
        utteranceId: "utt_001",
        speaker: "Speaker 1",
        start: 0,
        end: 10,
        text: "我们先收敛本周重点。",
        confidence: 0.5,
      },
      {
        utteranceId: "utt_002",
        speaker: "Speaker 2",
        start: 10,
        end: 22,
        text: "可以，我今天晚上整理负责人。",
      },
    ],
    provider: {
      name: "stub",
      model: "old",
    },
  });
  writeJson(path.join(runDirA, "chapters.json"), {
    recordingId: "rec_alpha",
    chapters: [],
  });
  writeJson(path.join(runDirA, "minutes.json"), {
    recordingId: "rec_alpha",
    profile: "work_meeting",
    summary: "legacy",
    sections: {
      todos: [],
    },
    sourceArtifacts: {
      transcriptPath: `state/runs/${runIdA}/transcript.json`,
      chaptersPath: `state/runs/${runIdA}/chapters.json`,
    },
  });

  writeJson(path.join(runDirB, "recording.json"), {
    recordingId: "rec_beta",
    source: {
      kind: "local_file",
      itemId: "/tmp/beta.wav",
      url: null,
    },
    title: "beta",
    capturedAt: "2026-03-17T01:00:00.000Z",
    participants: [],
    audio: {
      path: "/tmp/beta.wav",
      format: "wav",
      durationSeconds: 0,
      checksum: "pending",
    },
    ingest: {
      status: "normalized",
      ingestedAt: "2026-03-17T01:00:02.000Z",
      notes: ["legacy"],
    },
    metadata: {},
  });
  writeJson(path.join(runDirB, "transcript.json"), {
    recordingId: "rec_beta",
    language: "auto",
    mode: "audio_understanding",
    summary: "Structured audio understanding for beta.",
    utterances: [
      {
        utteranceId: "utt_001",
        speaker: "speaker_1",
        start: 0,
        end: 8,
        text: "Placeholder transcript for beta.",
        notes: [],
      },
    ],
    provider: {
      kind: "agent_multimodal",
      name: "stub",
      model: "unconfigured",
    },
    understanding: {
      promptProfile: "lecture",
      scenarioPrompt: "Produce knowledge-oriented notes.",
      terminologyHints: [],
      speakerInference: "model_inferred",
    },
  });
  writeJson(path.join(runDirB, "chapters.json"), {
    recordingId: "rec_beta",
    chapters: [],
  });
  writeJson(path.join(runDirB, "minutes.json"), {
    recordingId: "rec_beta",
    profile: "lecture",
    summary: "legacy beta",
    sections: {
      glossary: [],
    },
    sourceArtifacts: {
      transcriptPath: `state/runs/${runIdB}/transcript.json`,
      chaptersPath: `state/runs/${runIdB}/chapters.json`,
    },
  });

  const before = validateStoredState(repoRoot);
  assert.equal(before.ok, false);

  const repaired = await repairStoredState(repoRoot);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.repairedCount, 2);

  const after = validateStoredState(repoRoot);
  assert.equal(after.ok, true);
});
