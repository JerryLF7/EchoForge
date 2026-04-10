#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

import { importChatAudio } from "../../pipeline/chat-import.js";
import { ingestLocalFile } from "../../pipeline/stages/ingest.js";
import {
  runPipeline,
  runPipelineFromRecording,
} from "../../pipeline/orchestrator.js";
import {
  getAudioRuntime,
  listAudioProviders,
  resolveAudioProviderSelection,
} from "../../pipeline/providers/provider-registry.js";
import { processBatchCommand } from "./batch-commands.js";
import { loadProfile } from "./profile-loader.js";
import { rebuildMinutesCommand, republishRunCommand } from "./rebuild-commands.js";
import { repairStoredState } from "./state-repair.js";
import {
  commandCatalog,
  formatCommandList,
  formatJson,
  parseCliArgs,
} from "./parser.js";
import { assertSchemaFilesExist } from "./schema-check.js";
import { ingestSourceCommand, syncSourceCommand } from "./source-commands.js";
import { validateStoredState } from "./state-validation.js";
import {
  getRecording,
  listRecordings,
  upsertRecordings,
} from "../store/recordings.js";
import {
  findLatestRunForRecording,
  getRunManifest,
  listRunManifests,
} from "../store/runs.js";
import { readRunArtifact } from "../store/artifacts.js";

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

  const profile = loadProfile(repoRoot, resolveProfileName(parsed));

  if (parsed.command === "plan") {
    const providerSelection = resolveAudioProviderSelection({
      profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand || null,
        options: parsed.options,
        positionals: parsed.positionals,
        profile,
        audioUnderstanding: {
          capabilities: providerSelection.requestedCapabilities || profile.audioUnderstanding.capabilities,
          prompt: profile.audioUnderstanding.prompt,
        },
        runtime: providerSelection.provider,
        capabilityWarnings: providerSelection.issues,
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

  if (parsed.command === "ingest" && parsed.subcommand === "local") {
    requireOption(parsed.options, "file");

    const recording = await ingestLocalFile({
      repoRoot,
      input: {
        file: parsed.options.file,
        title: parsed.options.title,
      },
    });
    upsertRecordings(repoRoot, [recording]);

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        profile,
        recording,
      }),
    );
    return;
  }

  if (parsed.command === "process" && parsed.subcommand === "local") {
    requireOption(parsed.options, "file");
    requireOption(parsed.options, "audio-result");

    const result = await runPipeline({
      repoRoot,
      input: {
        file: parsed.options.file,
        title: parsed.options.title,
      },
      profile,
      audioUnderstandingResult: parsed.options["audio-result"],
    });
    upsertRecordings(repoRoot, [result.recording]);

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

  if (parsed.command === "process" && parsed.subcommand === "batch") {
    const result = await processBatchCommand({
      repoRoot,
      batch: parsed.options.batch || parsed.positionals[0],
      defaultProfile: profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        profile,
        batchPath: result.batchPath,
        count: result.count,
        results: result.results,
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "runs") {
    const runs = listRunManifests(repoRoot);
    console.log(
      formatJson({
        count: runs.length,
        runs,
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
    const recordings = listRecordings(repoRoot);
    console.log(
      formatJson({
        count: recordings.length,
        recordings,
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "recording") {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: inspect recording <recordingId>");
    }

    const recording = getRecording(repoRoot, recordingId);
    if (!recording) {
      fail(`Recording not found: ${recordingId}`);
    }

    console.log(
      formatJson({
        recording,
        latestRun: findLatestRunForRecording(repoRoot, recordingId),
      }),
    );
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "profile") {
    console.log(formatJson({ profile }));
    return;
  }

  if (parsed.command === "inspect" && parsed.subcommand === "providers") {
    const providerSelection = resolveAudioProviderSelection({
      profile,
    });

    console.log(
      formatJson({
        runtime: getAudioRuntime(),
        capabilityWarnings: providerSelection.issues,
        availableAudioRuntimes: listAudioProviders(),
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

  if (parsed.command === "inspect" && parsed.subcommand === "validate") {
    const runId = parsed.positionals[0] || parsed.options.id || null;
    const report = validateStoredState(repoRoot, { runId });
    console.log(
      formatJson({
        scope: runId ? { runId } : "all",
        ...report,
      }),
    );
    process.exit(report.ok ? 0 : 1);
  }

  if (parsed.command === "repair" && parsed.subcommand === "state") {
    const runId = parsed.positionals[0] || parsed.options.id || null;
    const report = await repairStoredState(repoRoot, { runId });
    console.log(formatJson(report));
    process.exit(report.ok ? 0 : 1);
  }

  if (parsed.command === "process" && parsed.subcommand === "recording") {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: process recording <recordingId>");
    }
    requireOption(parsed.options, "audio-result");

    const recording = getRecording(repoRoot, recordingId);
    if (!recording) {
      fail(`Recording not found: ${recordingId}`);
    }

    const result = await runPipelineFromRecording({
      repoRoot,
      recording,
      profile,
      audioUnderstandingResult: parsed.options["audio-result"],
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        recordingId: result.recording.recordingId,
        runId: result.published.runId,
        profile,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "rebuild" && parsed.subcommand === "recording") {
    fail("`rebuild recording` is ambiguous now. Use: rebuild run <runId>");
  }

  if (parsed.command === "rebuild" && parsed.subcommand === "run") {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (!runId) {
      fail("Missing run id. Use: rebuild run <runId>");
    }

    const result = await rebuildMinutesCommand({
      repoRoot,
      runId,
      profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        runId,
        recordingId: result.recording.recordingId,
        profile,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "rebuild" && parsed.subcommand === "minutes") {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (!runId) {
      fail("Missing run id. Use: rebuild minutes <runId>");
    }

    const result = await rebuildMinutesCommand({
      repoRoot,
      runId,
      profile,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        runId,
        recordingId: result.recording.recordingId,
        profile,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "rebuild" && parsed.subcommand === "publish") {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (!runId) {
      fail("Missing run id. Use: rebuild publish <runId>");
    }

    const result = await republishRunCommand({
      repoRoot,
      runId,
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        runId,
        recordingId: result.recording.recordingId,
        output: result.published,
      }),
    );
    return;
  }

  if (parsed.command === "sync" && parsed.subcommand === "feishu") {
    const result = syncSourceCommand({
      repoRoot,
      sourceKind: "feishu_minutes",
      manifest: parsed.options.manifest,
    });

    console.log(
      formatJson({
        source: result.source,
        status: result.status,
        manifestPath: result.manifestPath,
        fetchedAt: result.fetchedAt,
        count: result.count,
        persisted: result.persisted,
        items: result.items,
        recordings: result.recordings,
      }),
    );
    return;
  }

  if (parsed.command === "sync" && parsed.subcommand === "source") {
    const result = syncSourceCommand({
      repoRoot,
      sourceKind: parsed.options.kind || parsed.options.source || "feishu_minutes",
      manifest: parsed.options.manifest,
    });

    console.log(
      formatJson({
        source: result.source,
        status: result.status,
        manifestPath: result.manifestPath,
        fetchedAt: result.fetchedAt,
        count: result.count,
        persisted: result.persisted,
        items: result.items,
        recordings: result.recordings,
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

  if (parsed.command === "ingest" && parsed.subcommand === "source") {
    const result = ingestSourceCommand({
      repoRoot,
      sourceKind: parsed.options.kind || parsed.options.source || "feishu_minutes",
      manifest: parsed.options.manifest,
      itemId: parsed.options.item || parsed.positionals[0] || null,
      ingestAll: Boolean(parsed.options.all),
    });

    console.log(
      formatJson({
        command: parsed.command,
        subcommand: parsed.subcommand,
        source: result.source,
        status: result.status,
        manifestPath: result.manifestPath,
        fetchedAt: result.fetchedAt,
        selectedCount: result.selectedCount,
        persisted: result.persisted,
        items: result.items,
        recordings: result.recordings,
      }),
    );
    return;
  }

  fail(`Unknown command combination: ${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ""}`);
}

function resolveProfileName(parsed) {
  if (parsed.options.profile) {
    return parsed.options.profile;
  }

  if (
    parsed.command === "rebuild" &&
    (parsed.subcommand === "run" || parsed.subcommand === "minutes")
  ) {
    const runId = parsed.positionals[0] || parsed.options.id;
    if (runId) {
      try {
        const manifest = getRunManifest(repoRoot, runId);
        if (manifest?.profile) {
          return manifest.profile;
        }
      } catch {
        return "general";
      }
    }
  }

  return "general";
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
    "  echoforge ingest source --kind feishu_minutes --item <itemId> --manifest ./manifest.json",
    "  echoforge process local --file ./demo.wav --audio-result ./understanding.json --profile general",
    "  echoforge process batch --batch ./batch.json --profile general",
    "  echoforge sync feishu --profile work_meeting",
    "  echoforge sync source --kind feishu_minutes --manifest ./manifest.json",
    "  echoforge process recording rec_001 --audio-result ./understanding.json --profile lecture",
    "  echoforge rebuild run run_rec_001_abcd --profile lecture",
    "  echoforge rebuild publish run_rec_001_abcd",
    "  echoforge inspect validate [runId]",
    "  echoforge repair state [runId]",
    "  echoforge plan --profile general",
    "",
    "Global options:",
    "  --profile <name>   Processing profile name",
    "  --audio-result     Host-agent audio understanding result JSON",
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
