import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceRepoRoot = path.resolve(__dirname, "..");

export function createFixtureRepo(name) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `echoforge-${name}-`));

  for (const dirName of ["profiles", "schemas"]) {
    fs.cpSync(
      path.join(sourceRepoRoot, dirName),
      path.join(repoRoot, dirName),
      { recursive: true },
    );
  }

  fs.mkdirSync(path.join(repoRoot, "state"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "state", "sources", "feishu_minutes"), { recursive: true });

  return repoRoot;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}
