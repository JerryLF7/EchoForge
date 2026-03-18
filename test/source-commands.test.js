import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  ingestSourceCommand,
  syncSourceCommand,
} from "../runtime/cli/source-commands.js";
import { getRecording } from "../runtime/store/recordings.js";
import { createFixtureRepo, writeJson } from "../test-support/repo-fixture.js";

test("sync source and ingest source work with feishu manifests", () => {
  const repoRoot = createFixtureRepo("source");
  const manifestPath = path.join(repoRoot, "state", "sources", "feishu_minutes", "manifest.json");

  writeJson(manifestPath, {
    fetchedAt: "2026-03-18T00:00:00.000Z",
    items: [
      {
        objectToken: "minutes_a",
        workspace: "team-demo",
        title: "Roadmap review",
        recordedAt: "2026-03-17T09:00:00.000Z",
        durationSeconds: 1200,
        url: "https://team-demo.feishu.cn/minutes/minutes_a",
      },
      {
        objectToken: "minutes_b",
        workspace: "team-demo",
        title: "Lecture draft",
        recordedAt: "2026-03-17T10:00:00.000Z",
        durationSeconds: 900,
        url: "https://team-demo.feishu.cn/minutes/minutes_b",
      },
    ],
  });

  const synced = syncSourceCommand({
    repoRoot,
    sourceKind: "feishu",
    manifest: manifestPath,
  });

  assert.equal(synced.count, 2);
  assert.equal(synced.persisted, 2);
  assert.equal(synced.recordings[0].source.kind, "feishu_minutes");

  const ingested = ingestSourceCommand({
    repoRoot,
    sourceKind: "feishu_minutes",
    manifest: manifestPath,
    itemId: "minutes_b",
  });

  assert.equal(ingested.selectedCount, 1);
  assert.equal(ingested.recordings[0].source.itemId, "minutes_b");

  const recording = getRecording(repoRoot, ingested.recordings[0].recordingId);
  assert.equal(recording.title, "Lecture draft");
});
