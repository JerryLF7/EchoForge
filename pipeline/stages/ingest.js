import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export async function ingestLocalFile({ repoRoot, input }) {
  const sourcePath = path.resolve(input.file);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Audio file not found: ${sourcePath}`);
  }

  const ext = path.extname(sourcePath).replace(/^\./, "") || "bin";
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const recordingId = createRecordingId(baseName);
  const stat = fs.statSync(sourcePath);
  const checksum = createChecksum(sourcePath);

  const recording = {
    recordingId,
    source: {
      kind: "local_file",
      itemId: sourcePath,
      url: null,
    },
    title: input.title || baseName,
    capturedAt: stat.mtime.toISOString(),
    participants: [],
    audio: {
      path: sourcePath,
      format: ext,
      durationSeconds: 0,
      checksum,
    },
    ingest: {
      status: "normalized",
      ingestedAt: new Date().toISOString(),
      notes: ["Local file registered by CLI ingest stage."],
    },
    metadata: {
      fileSizeBytes: stat.size,
    },
  };

  return recording;
}

function createRecordingId(seed) {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "recording";

  const suffix = Date.now().toString(36);
  return `rec_${slug}_${suffix}`;
}

function createChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}
