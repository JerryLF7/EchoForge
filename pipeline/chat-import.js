import fs from "node:fs";
import path from "node:path";

import { recordingFromSourceItem } from "./source-ingest.js";

export function importChatAudio({ filePath, title }) {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).replace(/^\./, "") || "bin";
  const stat = fs.statSync(resolvedPath);

  const sourceItem = {
    source: {
      kind: "chat_attachment",
      itemId: resolvedPath,
      workspace: null,
      url: null,
    },
    title: title || path.basename(resolvedPath, path.extname(resolvedPath)),
    capturedAt: stat.mtime.toISOString(),
    participants: [],
    audio: {
      path: resolvedPath,
      format: ext,
      checksum: null,
    },
    metadata: {
      fileSizeBytes: stat.size,
      importedFrom: "chat_attachment",
    },
  };

  return recordingFromSourceItem(sourceItem);
}
