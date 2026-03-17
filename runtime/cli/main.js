#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

import {
  loadFeishuManifest,
  normalizeFeishuItem,
} from "../../adapters/sources/feishu_minutes/adapter.js";
import { importChatAudio } from "../../pipeline/chat-import.js";
import { rebuildFromRecording } from "../../pipeline/rebuild.js";
import { runPipeline } from "../../pipeline/orchestrator.js";
import { recordingFromSourceItem } from "../../pipeline/source-ingest.js";
import { listAudioProviders } from "../../pipeline/providers/provider-registry.js";
import { loadProfile } from "./profile-loader.js";
import {
  commandCatalog,
  formatCommandList,
  formatJson,
  parseCliArgs,
} from "./parser.js";
import { assertSchemaFilesExist } from "./schema-check.js";
import {
  loadRecordingIndex,
  upsertRecordings,
} from "./recording-store.js";
import { loadRunsIndex } from "./run-store.js";
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
        audioUnderstanding: {
          provider: parsed.options.provider || profile.audioUnderstanding.provider,
          model: profile.audioUnderstanding.model,
          capabilities: profile.audioUnderstanding.capabilities,
          prompt: profile.audioUnderstanding.prompt,
        },
        next: [
          "resolve source input",
          "build normalized recording record",
          "run multimodal audio understanding",
          "generate structured minutes artifacts",
          "emit published outputs",
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
      providerOverride: parsed.options.provider,
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
    const index = loadRunsIndex(repoRoot);
    console.log(
      formatJson({
        count: Object.keys(index.items).length,
        runs: Object.values(index.items),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "run") {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (!runId) {
      fail("Missing run id. Use: inspect run <runId>");
    }

    console.log(
      formatJson({
        run: readRunArtifact(repoRoot, runId, "run.json"),
        recording: readRunArtifact(repoRoot, runId, "recording.json"),
        transcript: readRunArtifact(repoRoot, runId, "transcript.json"),
        chapters: readRunArtifact(repoRoot, runId, "chapters.json"),
        minutes: readRunArtifact(repoRoot, runId, "minutes.json"),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "recordings") {
    const index = loadRecordingIndex(repoRoot);
    console.log(
      formatJson({
        count: Object.keys(index.items).length,
        recordings: Object.values(index.items),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "recording") {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (!runId) {
      fail("Missing run id. Use: inspect recording <runId>");
    }

    console.log(
      formatJson({
        recording: readRunArtifact(repoRoot, runId, "recording.json"),
        transcript: readRunArtifact(repoRoot, runId, "transcript.json"),
        chapters: readRunArtifact(repoRoot, runId, "chapters.json"),
        minutes: readRunArtifact(repoRoot, runId, "minutes.json"),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "profile") {
    console.log(formatJson({ profile }));
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "providers") {
    const activeProvider = parsed.options.provider || profile.audioUnderstanding.provider;

    console.log(
      formatJson({
        activeProvider,
        configuredModel: profile.audioUnderstanding.model,
        audioUnderstandingProviders: listAudioProviders(),
        capabilities: profile.audioUnderstanding.capabilities,
      }),
    );
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
    const normalizedItems = manifest.items.map((item) => normalizeFeishuItem(item));
    const recordings = normalizedItems.map((item) => recordingFromSourceItem(item));
    const persisted = upsertRecordings(repoRoot, recordings);

    console.log(
      formatJson({
        source: manifest.source,
        status: manifest.status,
        manifestPath: manifest.manifestPath,
        fetchedAt: manifest.fetchedAt || null,
        count: normalizedItems.length,
        persisted: persisted.count,
        items: normalizedItems,
        recordings,
      }),
    );
    return;
  }

  if (parsed.command === "ingest" && parsed.subcommand === "chat") {
    requireOption(parsed.options, "file");

    const recording = importChatAudio({
      filePath: parsed.options.file,
      title: parsed.options.title,
    });
    upsertRecordings(repoRoot, [recording]);

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        recording,
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
    "  --provider <id>    Audio understanding provider override",
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
