import { loadNormalizedSourceItems } from "../../adapters/sources/registry.js";
import { recordingFromSourceItem } from "../../pipeline/source-ingest.js";
import { upsertRecordings } from "../store/recordings.js";

export function syncSourceCommand({ repoRoot, sourceKind, manifest }) {
  const catalog = loadNormalizedSourceItems(repoRoot, {
    sourceKind,
    manifest,
  });
  const recordings = catalog.items.map((item) => recordingFromSourceItem(item));
  const persisted = upsertRecordings(repoRoot, recordings);

  return {
    ...catalog,
    count: catalog.items.length,
    persisted: persisted.count,
    recordings,
  };
}

export function ingestSourceCommand({ repoRoot, sourceKind, manifest, itemId, ingestAll = false }) {
  const catalog = loadNormalizedSourceItems(repoRoot, {
    sourceKind,
    manifest,
  });
  const selectedItems = selectSourceItems(catalog.items, {
    itemId,
    ingestAll,
  });
  const recordings = selectedItems.map((item) => recordingFromSourceItem(item));
  const persisted = upsertRecordings(repoRoot, recordings);

  return {
    ...catalog,
    selectedCount: selectedItems.length,
    persisted: persisted.count,
    items: selectedItems,
    recordings,
  };
}

function selectSourceItems(items, { itemId, ingestAll }) {
  if (ingestAll) {
    return items;
  }

  if (!itemId) {
    throw new Error("Missing source item id. Use --item <id> or --all.");
  }

  const matches = items.filter((item) => item.source?.itemId === itemId);
  if (matches.length === 0) {
    throw new Error(`Source item not found: ${itemId}`);
  }

  return matches;
}
