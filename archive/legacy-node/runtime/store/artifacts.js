import fs from "node:fs";
import path from "node:path";

import { assertValidAgainstSchema } from "../schema/validator.js";

export function getRunsRoot(repoRoot) {
  return path.join(repoRoot, "state", "runs");
}

export function getRunDir(repoRoot, runId) {
  return path.join(getRunsRoot(repoRoot), runId);
}

export function getRunArtifactPath(repoRoot, runId, artifactName) {
  return path.join(getRunDir(repoRoot, runId), artifactName);
}

export function readRunArtifact(repoRoot, runId, artifactName) {
  const fullPath = getRunArtifactPath(repoRoot, runId, artifactName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found: ${fullPath}`);
  }

  const value = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const schemaName = schemaNameForArtifact(artifactName);
  if (schemaName) {
    assertValidAgainstSchema(repoRoot, schemaName, value, `${runId}/${artifactName}`);
  }

  return value;
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

function schemaNameForArtifact(artifactName) {
  switch (artifactName) {
    case "recording.json":
      return "recording.schema.json";
    case "transcript.json":
      return "transcript.schema.json";
    case "chapters.json":
      return "chapters.schema.json";
    case "minutes.json":
      return "minutes.schema.json";
    case "run.json":
      return "run.schema.json";
    default:
      return null;
  }
}
