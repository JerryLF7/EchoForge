#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPipeline } from "../../pipeline/orchestrator.js";
import { loadProfile } from "./profile-loader.js";
import {
  commandCatalog,
  formatCommandList,
  formatJson,
  parseCliArgs,
} from "./parser.js";
import { assertSchemaFilesExist } from "./schema-check.js";

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

  if (parsed.command === "ingest" && parsed.subcommand === "local") {
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

function fail(message) {
  console.error(message);
  process.exit(1);
}

main(process.argv.slice(2)).catch((error) => {
  fail(error.message);
});
