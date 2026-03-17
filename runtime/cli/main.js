#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

import {
  loadFeishuManifest,
  normalizeFeishuItem,
} from "../../adapters/sources/feishu_minutes/adapter.js";
import { rebuildFromRecording } from "../../pipeline/rebuild.js";
import { runPipeline } from "../../pipeline/orchestrator.js";
import { loadProfile } from "./profile-loader.js";
import {
  commandCatalog,
  formatCommandList,
  formatJson,
  parseCliArgs,
} from "./parser.js";
import { assertSchemaFilesExist } from "./schema-check.js";
import { getRunDir, listRuns, readRunArtifact } from "./state-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

async function main(argv) {
  const parsed = parseCliArgs(argv);

  if (parsed.help || !parsed.command) {
    printHelp();
    process.exit(parsed.help ? 0 : 1);
  }

  if (parsed.command === "version") {
    console.log("echoforge 0.1.0");
    return;
  }

  const profile = loadProfile(repoRoot, parsed.options.profile || "general");

  if (parsed.command === "plan") {
    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand || null,
        options: parsed.options,
        positionals: parsed.positionals,
        profile,
        next: [
          "resolve source input",
          "build normalized recording record",
          "run pipeline stages",
          "emit structured artifacts",
        ],
      }),
    );
    return;
  }

  const command = commandCatalog[parsed.command];
  if (!command) {
    fail(`Unknown command: ${parsed.command}`);
  }

  assertSchemaFilesExist(repoRoot);

  if (
    (parsed.command === "ingest" || parsed.command === "process") &&
    parsed.subcommand === "local"
  ) {
    requireOption(parsed.options, "file");

    const result = await runPipeline({
      repoRoot,
      input: {
        file: parsed.options.file,
        title: parsed.options.title,
      },
      profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        profile,
        recordingId: result.recording.recordingId,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "runs") {
    const runs = listRuns(repoRoot).map((recordingId) => {
      const runDir = getRunDir(repoRoot, recordingId);
      const recordingPath = path.join(runDir, "recording.json");
      const minutesPath = path.join(runDir, "minutes.json");
      const base = {
        recordingId,
        runDir,
      };

      if (!fs.existsSync(recordingPath) || !fs.existsSync(minutesPath)) {
        return base;
      }

      const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
      const minutes = JSON.parse(fs.readFileSync(minutesPath, "utf8"));

      return {
        ...base,
        title: recording.title,
        source: recording.source.kind,
        profile: minutes.profile,
        capturedAt: recording.capturedAt,
      };
    });

    console.log(formatJson({ runs }));
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "recording") {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: inspect recording <recordingId>");
    }

    console.log(
      formatJson({
        recording: readRunArtifact(repoRoot, recordingId, "recording.json"),
        transcript: readRunArtifact(repoRoot, recordingId, "transcript.json"),
        chapters: readRunArtifact(repoRoot, recordingId, "chapters.json"),
        minutes: readRunArtifact(repoRoot, recordingId, "minutes.json"),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "profile") {
    console.log(formatJson({ profile }));
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "schema") {
    const schemaName = parsed.positionals[0] || parsed.options.name;
    if (!schemaName) {
      fail("Missing schema name. Use: inspect schema <name>");
    }

    const schemaPath = path.join(repoRoot, "schemas", `${schemaName}.schema.json`);
    if (!fs.existsSync(schemaPath)) {
      fail(`Schema not found: ${schemaName}`);
    }

    console.log(fs.readFileSync(schemaPath, "utf8"));
    return;
  }

  if (
    (parsed.command === "process" || parsed.command === "rebuild") &&
    parsed.subcommand === "recording"
  ) {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: process recording <recordingId>");
    }

    const result = await rebuildFromRecording({
      repoRoot,
      recording: readRunArtifact(repoRoot, recordingId, "recording.json"),
      transcript: readRunArtifact(repoRoot, recordingId, "transcript.json"),
      profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        recordingId,
        profile,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "sync" && parsed.subcommand === "feishu") {
    const manifest = loadFeishuManifest(repoRoot, {
      manifest: parsed.options.manifest,
    });

    console.log(
      formatJson({
        source: manifest.source,
        status: manifest.status,
        manifestPath: manifest.manifestPath,
        fetchedAt: manifest.fetchedAt || null,
        count: manifest.items.length,
        items: manifest.items.map((item) => normalizeFeishuItem(item)),
      }),
    );
    return;
  }

  console.log(
    formatJson({
      command: parsed.command,
      subcommand: parsed.subcommand || null,
      options: parsed.options,
      positionals: parsed.positionals,
      status: "stub",
      description: command.description,
      profile,
      repoRoot,
    }),
  );
}

function printHelp() {
  const help = [
    "EchoForge master CLI",
    "",
    "Usage:",
    "  echoforge <command> [subcommand] [options]",
    "",
    "Commands:",
    formatCommandList(commandCatalog),
    "",
    "Examples:",
    "  echoforge ingest local --file ./demo.wav --profile general",
    "  echoforge sync feishu --profile work_meeting",
    "  echoforge process recording rec_001 --profile lecture",
    "  echoforge plan --profile general",
    "",
    "Global options:",
    "  --profile <name>   Processing profile name",
    "  --help             Show this help",
  ].join("\n");

  console.log(help);
}

function requireOption(options, key) {
  if (!options[key]) {
    fail(`Missing required option: --${key}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main(process.argv.slice(2)).catch((error) => {
  fail(error.message);
});
