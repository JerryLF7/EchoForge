import fs from "node:fs";
import path from "node:path";

import { assertValidAgainstSchema } from "../schema/validator.js";

export function getRecordingIndexPath(repoRoot) {
  return path.join(repoRoot, "state", "recordings.json");
}

export function loadRecordingIndex(repoRoot) {
  const indexPath = getRecordingIndexPath(repoRoot);
  if (!fs.existsSync(indexPath)) {
    return {
      items: {},
    };
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assertRecordingIndexShape(index, indexPath);
  return index;
}

export function saveRecordingIndex(repoRoot, index) {
  const indexPath = getRecordingIndexPath(repoRoot);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export function getRecording(repoRoot, recordingId) {
  const index = loadRecordingIndex(repoRoot);
  const recording = index.items[recordingId] || null;
  if (recording) {
    assertValidRecording(repoRoot, recording);
  }
  return recording;
}

export function listRecordings(repoRoot) {
  const index = loadRecordingIndex(repoRoot);
  return Object.values(index.items)
    .filter((recording) => isValidRecording(repoRoot, recording))
    .sort(compareRecordingsNewestFirst);
}

export function upsertRecordings(repoRoot, recordings) {
  const index = loadRecordingIndex(repoRoot);

  for (const recording of recordings) {
    assertValidAgainstSchema(
      repoRoot,
      "recording.schema.json",
      recording,
      `recording ${recording.recordingId || "(unknown)"}`,
    );
    index.items[recording.recordingId] = recording;
  }

  saveRecordingIndex(repoRoot, index);

  return {
    count: recordings.length,
    recordings: Object.values(index.items),
  };
}

function assertRecordingIndexShape(index, indexPath) {
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    throw new Error(`Recording index must be an object: ${indexPath}`);
  }

  if (!index.items || typeof index.items !== "object" || Array.isArray(index.items)) {
    throw new Error(`Recording index is missing an object \`items\` field: ${indexPath}`);
  }
}

function assertValidRecording(repoRoot, recording) {
  assertValidAgainstSchema(
    repoRoot,
    "recording.schema.json",
    recording,
    `recording ${(recording && recording.recordingId) || "(unknown)"}`,
  );
}

function isValidRecording(repoRoot, recording) {
  try {
    assertValidRecording(repoRoot, recording);
    return true;
  } catch {
    return false;
  }
}

function compareRecordingsNewestFirst(left, right) {
  const leftTime = toTimestamp(left.capturedAt);
  const rightTime = toTimestamp(right.capturedAt);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return (right.recordingId || "").localeCompare(left.recordingId || "");
}

function toTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}
