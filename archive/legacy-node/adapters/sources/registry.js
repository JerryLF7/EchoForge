import {
  loadFeishuManifest,
  normalizeFeishuItem,
} from "./feishu_minutes/adapter.js";

const sourceAdapters = [
  {
    id: "feishu_minutes",
    aliases: ["feishu", "feishu_minutes"],
    load: loadFeishuManifest,
    normalize: normalizeFeishuItem,
  },
];

export function resolveSourceAdapter(sourceKind = "feishu_minutes") {
  const normalized = String(sourceKind || "feishu_minutes").trim().toLowerCase();
  const adapter = sourceAdapters.find((item) => item.aliases.includes(normalized));

  if (!adapter) {
    throw new Error(
      `Unknown source adapter: ${sourceKind}. Available: ${listSourceAdapters().join(", ")}`,
    );
  }

  return adapter;
}

export function listSourceAdapters() {
  return sourceAdapters.map((item) => item.id);
}

export function loadNormalizedSourceItems(repoRoot, options = {}) {
  const adapter = resolveSourceAdapter(options.sourceKind);
  const manifest = adapter.load(repoRoot, {
    manifest: options.manifest,
  });

  return {
    source: adapter.id,
    manifestPath: manifest.manifestPath,
    status: manifest.status,
    fetchedAt: manifest.fetchedAt || null,
    items: (manifest.items || []).map((item) => adapter.normalize(item)),
  };
}
