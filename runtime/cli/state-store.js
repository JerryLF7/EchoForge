import fs from "node:fs";
import path from "node:path";

export function getRunsRoot(repoRoot) {
  return path.join(repoRoot, "state", "runs");
}

export function getRunDir(repoRoot, runId) {
  return path.join(getRunsRoot(repoRoot), runId);
}

export function readRunArtifact(repoRoot, runId, artifactName) {
  const fullPath = path.join(getRunDir(repoRoot, runId), artifactName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found: ${fullPath}`);
  }

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function listRuns(repoRoot) {
  const runsRoot = getRunsRoot(repoRoot);
  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  return fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
