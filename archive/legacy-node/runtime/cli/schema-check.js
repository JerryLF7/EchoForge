import fs from "node:fs";
import path from "node:path";

export function assertSchemaFilesExist(repoRoot) {
  const required = [
    "agent-audio-result.schema.json",
    "agent-audio-task.schema.json",
    "profile.schema.json",
    "recording.schema.json",
    "chapters.schema.json",
    "minutes.schema.json",
    "run.schema.json",
    "transcript.schema.json",
  ];

  for (const file of required) {
    const fullPath = path.join(repoRoot, "schemas", file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing schema file: ${fullPath}`);
    }
  }
}
