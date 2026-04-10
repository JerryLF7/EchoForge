import fs from "node:fs";
import path from "node:path";

import { runPipelineFromRecording } from "../../pipeline/orchestrator.js";
import { loadProfile } from "./profile-loader.js";
import { getRecording } from "../store/recordings.js";

export async function processBatchCommand({ repoRoot, batch, defaultProfile }) {
  const request = loadBatchRequest(batch);
  const results = [];

  for (const item of request.items) {
    const recording = getRecording(repoRoot, item.recordingId);
    if (!recording) {
      throw new Error(`Recording not found for batch item: ${item.recordingId}`);
    }

    const profile = item.profile ? loadProfile(repoRoot, item.profile) : defaultProfile;
    const result = await runPipelineFromRecording({
      repoRoot,
      recording,
      profile,
      audioUnderstandingResult: item.audioResult,
    });

    results.push({
      recordingId: recording.recordingId,
      profile: profile.id,
      runId: result.published.runId,
      output: result.published,
    });
  }

  return {
    batchPath: request.batchPath,
    count: results.length,
    results,
  };
}

export function loadBatchRequest(batchPath) {
  if (!batchPath) {
    throw new Error("Missing batch file. Use --batch <batch.json>.");
  }

  const resolvedPath = path.resolve(batchPath);
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const items = normalizeBatchItems(parsed);

  if (items.length === 0) {
    throw new Error(`Batch file contains no items: ${resolvedPath}`);
  }

  return {
    batchPath: resolvedPath,
    items,
  };
}

function normalizeBatchItems(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map(normalizeBatchItem);
  }

  if (parsed && Array.isArray(parsed.items)) {
    return parsed.items.map(normalizeBatchItem);
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([recordingId, audioResult]) => ({
      recordingId,
      audioResult,
    }));
  }

  throw new Error("Batch file must be an array, an object map, or an object with an `items` array.");
}

function normalizeBatchItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Batch item must be an object.");
  }

  if (!item.recordingId) {
    throw new Error("Batch item is missing `recordingId`.");
  }

  if (!item.audioResult) {
    throw new Error(`Batch item is missing \`audioResult\` for recording ${item.recordingId}.`);
  }

  return {
    recordingId: item.recordingId,
    audioResult: item.audioResult,
    profile: item.profile || null,
  };
}
