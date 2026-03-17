import fs from "node:fs";
import path from "node:path";

import { upsertRunManifest } from "../../runtime/cli/run-store.js";

export async function publishArtifacts({ repoRoot, recording, transcript, chapters, minutes }) {
  const startedAt = new Date().toISOString();
  const runId = `run_${recording.recordingId}`;
  const runDir = path.join(repoRoot, "state", "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const artifacts = {
    recording: path.join(runDir, "recording.json"),
    transcript: path.join(runDir, "transcript.json"),
    chapters: path.join(runDir, "chapters.json"),
    minutes: path.join(runDir, "minutes.json"),
    markdown: path.join(runDir, "minutes.md"),
    run: path.join(runDir, "run.json")
  };

  fs.writeFileSync(artifacts.recording, `${JSON.stringify(recording, null, 2)}\n`);
  fs.writeFileSync(artifacts.transcript, `${JSON.stringify(transcript, null, 2)}\n`);
  fs.writeFileSync(artifacts.chapters, `${JSON.stringify(chapters, null, 2)}\n`);
  fs.writeFileSync(artifacts.minutes, `${JSON.stringify(minutes, null, 2)}\n`);
  fs.writeFileSync(artifacts.markdown, renderMinutesMarkdown({ recording, minutes }));

  const runManifest = {
    runId,
    recordingId: recording.recordingId,
    profile: minutes.profile,
    provider: {
      id: transcript.provider.name,
      model: transcript.provider.model,
    },
    startedAt,
    completedAt: new Date().toISOString(),
    status: "completed",
    artifacts: {
      recording: artifacts.recording,
      transcript: artifacts.transcript,
      chapters: artifacts.chapters,
      minutes: artifacts.minutes,
      markdown: artifacts.markdown,
    },
  };

  fs.writeFileSync(artifacts.run, `${JSON.stringify(runManifest, null, 2)}\n`);
  upsertRunManifest(repoRoot, runManifest);

  return {
    runId,
    runDir,
    artifacts,
    manifest: runManifest,
  };
}

function renderMinutesMarkdown({ recording, minutes }) {
  const lines = [
    `# ${recording.title}`,
    "",
    `- recording_id: ${recording.recordingId}`,
    `- profile: ${minutes.profile}`,
    `- source: ${recording.source.kind}`,
    "",
    "## Summary",
    "",
    minutes.summary,
  ];

  if (minutes.sections.chapters?.length) {
    lines.push("", "## Chapters", "");
    for (const chapter of minutes.sections.chapters) {
      lines.push(`### ${chapter.title}`, "", chapter.summary, "");
    }
  }

  if (minutes.sections.decisions?.length) {
    lines.push("## Decisions", "");
    for (const item of minutes.sections.decisions) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (minutes.sections.todos?.length) {
    lines.push("## Todos", "");
    for (const item of minutes.sections.todos) {
      lines.push(`- ${item.text}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
