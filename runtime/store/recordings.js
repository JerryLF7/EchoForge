import fs from "node:fs";
import path from "node:path";

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

  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

export function saveRecordingIndex(repoRoot, index) {
  const indexPath = getRecordingIndexPath(repoRoot);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export function getRecording(repoRoot, recordingId) {
  const index = loadRecordingIndex(repoRoot);
  return index.items[recordingId] || null;
}

export function upsertRecordings(repoRoot, recordings) {
  const index = loadRecordingIndex(repoRoot);

  for (const recording of recordings) {
    index.items[recording.recordingId] = recording;
  }

  saveRecordingIndex(repoRoot, index);

  return {
    count: recordings.length,
    recordings: Object.values(index.items),
  };
}
