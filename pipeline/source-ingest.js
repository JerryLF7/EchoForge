import crypto from "node:crypto";

export function recordingFromSourceItem(sourceItem) {
  const titleSeed = sourceItem.title || sourceItem.source.itemId || "recording";
  const recordingId = createRecordingId(titleSeed, sourceItem.source.itemId);

  return {
    recordingId,
    source: sourceItem.source,
    title: sourceItem.title || sourceItem.source.itemId,
    capturedAt: sourceItem.capturedAt,
    participants: sourceItem.participants || [],
    audio: {
      path: sourceItem.audio?.path || "pending://download",
      format: sourceItem.audio?.format || "unknown",
      durationSeconds: sourceItem.metadata?.durationSeconds || 0,
      checksum: sourceItem.audio?.checksum || "pending",
    },
    ingest: {
      status: sourceItem.audio?.path ? "normalized" : "discovered",
      ingestedAt: new Date().toISOString(),
      notes: ["Source item normalized into EchoForge recording contract."],
    },
    metadata: sourceItem.metadata || {},
  };
}

function createRecordingId(titleSeed, uniquenessSeed = "") {
  const slug = titleSeed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "recording";

  const suffix = crypto
    .createHash("sha1")
    .update(`${titleSeed}:${uniquenessSeed}`)
    .digest("hex")
    .slice(0, 8);

  return `rec_${slug}_${suffix}`;
}
