export const commandCatalog = {
  ingest: {
    description: "Normalize a new audio input into a recording record.",
    subcommands: ["local", "chat", "source"],
  },
  sync: {
    description: "Pull new items from a source adapter.",
    subcommands: ["feishu", "source"],
  },
  process: {
    description: "Run the pipeline for an existing recording or new input.",
    subcommands: ["local", "recording", "batch"],
  },
  rebuild: {
    description: "Re-generate downstream artifacts from prior state.",
    subcommands: ["recording", "minutes", "publish"],
  },
  inspect: {
    description: "Inspect stored state, schemas, and profiles.",
    subcommands: ["runs", "recordings", "recording", "schema", "profile"],
  },
  plan: {
    description: "Print the resolved execution plan without running it.",
    subcommands: [],
  },
  version: {
    description: "Print the CLI version.",
    subcommands: [],
  },
};

export function parseCliArgs(argv) {
  const options = {};
  const positionals = [];
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];

      if (!next || next.startsWith("--")) {
        options[key] = true;
        continue;
      }

      options[key] = next;
      index += 1;
      continue;
    }

    positionals.push(token);
  }

  const [command, subcommand, ...rest] = positionals;

  return {
    command,
    subcommand,
    positionals: rest,
    options,
    help,
  };
}

export function formatCommandList(catalog) {
  return Object.entries(catalog)
    .map(([name, entry]) => {
      const suffix = entry.subcommands.length
        ? ` (${entry.subcommands.join(", ")})`
        : "";
      return `  ${name.padEnd(8, " ")} ${entry.description}${suffix}`;
    })
    .join("\n");
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}
