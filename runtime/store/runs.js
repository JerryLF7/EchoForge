import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function getRunsIndexPath(repoRoot) {
  return path.join(repoRoot, "state", "runs.json");
}

export function loadRunsIndex(repoRoot) {
  const indexPath = getRunsIndexPath(repoRoot);
  if (!fs.existsSync(indexPath)) {
    return {
      items: {},
    };
  }

  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

export function saveRunsIndex(repoRoot, index) {
  const indexPath = getRunsIndexPath(repoRoot);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export function createRunId(recordingId) {
  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
  return `run_${recordingId}_${suffix}`;
}

export function getRunManifest(repoRoot, runId) {
  const index = loadRunsIndex(repoRoot);
  return index.items[runId] || null;
}

export function listRunManifests(repoRoot) {
  const index = loadRunsIndex(repoRoot);
  return Object.values(index.items).sort(compareRunsNewestFirst);
}

export function listRunsForRecording(repoRoot, recordingId) {
  return listRunManifests(repoRoot).filter((manifest) => manifest.recordingId === recordingId);
}

export function findLatestRunForRecording(repoRoot, recordingId) {
  return listRunsForRecording(repoRoot, recordingId)[0] || null;
}

export function upsertRunManifest(repoRoot, manifest) {
  const index = loadRunsIndex(repoRoot);
  index.items[manifest.runId] = manifest;
  saveRunsIndex(repoRoot, index);
  return manifest;
}

function compareRunsNewestFirst(left, right) {
  const leftTime = toTimestamp(left.completedAt || left.startedAt);
  const rightTime = toTimestamp(right.completedAt || right.startedAt);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.runId.localeCompare(left.runId);
}

function toTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}
