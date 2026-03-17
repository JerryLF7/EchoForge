import fs from "node:fs";
import path from "node:path";

export function assertSchemaFilesExist(repoRoot) {
  const required = [
    "recording.schema.json",
    "transcript.schema.json",
    "chapters.schema.json",
    "minutes.schema.json",
  ];

  for (const file of required) {
    const fullPath = path.join(repoRoot, "schemas", file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing schema file: ${fullPath}`);
    }
  }
}
