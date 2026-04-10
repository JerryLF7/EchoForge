#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const schemaDir = path.join(repoRoot, "schemas");
const files = fs
  .readdirSync(schemaDir)
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

if (files.length === 0) {
  console.error("No schema files found.");
  process.exit(1);
}

for (const file of files) {
  const fullPath = path.join(schemaDir, file);
  JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

console.log(`Validated ${files.length} schema files.`);
