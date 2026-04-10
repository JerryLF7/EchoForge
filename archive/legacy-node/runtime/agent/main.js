#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPipelineFromRecording } from "../../pipeline/orchestrator.js";
import { ingestLocalFile } from "../../pipeline/stages/ingest.js";
import { buildAgentAudioUnderstandingTask } from "../../pipeline/providers/agent-native-audio-provider.js";
import { buildAudioUnderstandingRequest } from "../../pipeline/providers/request-builder.js";
import { parseCliArgs } from "../cli/parser.js";
import { loadProfile } from "../cli/profile-loader.js";
import { getRecording, upsertRecordings } from "../store/recordings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

async function main(argv) {
  const parsed = parseCliArgs(argv);

  if (parsed.help || !parsed.command) {
    printHelp();
    process.exit(parsed.help ? 0 : 1);
  }

  const profile = loadProfile(repoRoot, parsed.options.profile || "general");

  if (parsed.command === "prepare-understanding" && parsed.subcommand === "local") {
    requireOption(parsed.options, "file");

    const recording = await ingestLocalFile({
      repoRoot,
      input: {
        file: parsed.options.file,
        title: parsed.options.title,
      },
    });
    upsertRecordings(repoRoot, [recording]);

    const task = buildAgentAudioUnderstandingTask({
      recording,
      profile,
      request: buildAudioUnderstandingRequest({
        recording,
        profile,
      }),
    });

    console.log(
      JSON.stringify(
        {
          action: "host_agent_audio_understanding_required",
          profile: profile.id,
          recordingId: recording.recordingId,
          task,
          next: {
            command: "complete-understanding",
            subcommand: "recording",
            args: [recording.recordingId],
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (parsed.command === "prepare-understanding" && parsed.subcommand === "recording") {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: prepare-understanding recording <recordingId>");
    }

    const recording = getRecording(repoRoot, recordingId);
    if (!recording) {
      fail(`Recording not found: ${recordingId}`);
    }

    const task = buildAgentAudioUnderstandingTask({
      recording,
      profile,
      request: buildAudioUnderstandingRequest({
        recording,
        profile,
      }),
    });

    console.log(
      JSON.stringify(
        {
          action: "host_agent_audio_understanding_required",
          profile: profile.id,
          recordingId,
          task,
          next: {
            command: "complete-understanding",
            subcommand: "recording",
            args: [recordingId],
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (parsed.command === "complete-understanding" && parsed.subcommand === "recording") {
    const recordingId = parsed.positionals[0] || parsed.options.id;
    if (!recordingId) {
      fail("Missing recording id. Use: complete-understanding recording <recordingId>");
    }
    requireOption(parsed.options, "result");

    const recording = getRecording(repoRoot, recordingId);
    if (!recording) {
      fail(`Recording not found: ${recordingId}`);
    }

    const result = await runPipelineFromRecording({
      repoRoot,
      recording,
      profile,
      audioUnderstandingResult: parsed.options.result,
    });

    console.log(
      JSON.stringify(
        {
          action: "completed",
          profile: profile.id,
          recordingId,
          runId: result.published.runId,
          output: result.published,
        },
        null,
        2,
      ),
    );
    return;
  }

  fail(`Unknown command: ${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ""}`);
}

function printHelp() {
  const help = [
    "EchoForge agent runtime wrapper",
    "",
    "Usage:",
    "  echoforge-agent <command> [subcommand] [options]",
    "",
    "Commands:",
    "  prepare-understanding local --file <path> [--title <title>] [--profile <name>]",
    "  prepare-understanding recording <recordingId> [--profile <name>]",
    "  complete-understanding recording <recordingId> --result <result.json> [--profile <name>]",
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
