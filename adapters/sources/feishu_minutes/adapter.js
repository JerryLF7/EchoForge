import fs from "node:fs";
import path from "node:path";

export function loadFeishuManifest(repoRoot, options = {}) {
  const manifestPath = options.manifest
    ? path.resolve(options.manifest)
    : path.join(repoRoot, "state", "sources", "feishu_minutes", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return {
      source: "feishu_minutes",
      manifestPath,
      items: [],
      status: "missing_manifest",
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return {
    source: "feishu_minutes",
    manifestPath,
    status: "ok",
    items: manifest.items || [],
    fetchedAt: manifest.fetchedAt || null,
  };
}

export function normalizeFeishuItem(item) {
  return {
    source: {
      kind: "feishu_minutes",
      itemId: item.objectToken,
      workspace: item.workspace || null,
      url: item.url || null,
    },
    title: item.title || item.objectToken,
    capturedAt: item.recordedAt || item.createdAt || new Date().toISOString(),
    participants: item.participants || [],
    metadata: {
      durationSeconds: item.durationSeconds || null,
      speakerCount: item.speakerCount || null,
      raw: item,
    },
  };
}
