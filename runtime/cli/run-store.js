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

export function upsertRunManifest(repoRoot, manifest) {
  const index = loadRunsIndex(repoRoot);
  index.items[manifest.runId] = manifest;
  saveRunsIndex(repoRoot, index);
  return manifest;
}
