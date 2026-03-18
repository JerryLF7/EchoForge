import fs from "node:fs";

import { assertValidAgainstSchema } from "../../runtime/schema/validator.js";
import {
  getRunArtifactPath,
  getRunDir,
} from "../../runtime/store/artifacts.js";
import {
  createRunId,
  upsertRunManifest,
} from "../../runtime/store/runs.js";

export async function publishArtifacts({
  repoRoot,
  recording,
  transcript,
  obsidianTranscriptMarkdown,
  chapters,
  minutes,
  runContext,
}) {
  const runId = runContext?.runId || createRunId(recording.recordingId);
  const startedAt = runContext?.startedAt || new Date().toISOString();
  const completedAt = new Date().toISOString();
  const runDir = getRunDir(repoRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const persistedMinutes = withSourceArtifacts({ minutes, runId });
  assertValidAgainstSchema(repoRoot, "recording.schema.json", recording, `recording ${recording.recordingId}`);
  assertValidAgainstSchema(repoRoot, "transcript.schema.json", transcript, `transcript ${recording.recordingId}`);
  assertValidAgainstSchema(repoRoot, "chapters.schema.json", chapters, `chapters ${recording.recordingId}`);
  assertValidAgainstSchema(repoRoot, "minutes.schema.json", persistedMinutes, `minutes ${recording.recordingId}`);
  const artifacts = {
    recording: getRunArtifactPath(repoRoot, runId, "recording.json"),
    transcript: getRunArtifactPath(repoRoot, runId, "transcript.json"),
    transcriptMarkdown: getRunArtifactPath(repoRoot, runId, "transcript.md"),
    chapters: getRunArtifactPath(repoRoot, runId, "chapters.json"),
    minutes: getRunArtifactPath(repoRoot, runId, "minutes.json"),
    markdown: getRunArtifactPath(repoRoot, runId, "minutes.md"),
    run: getRunArtifactPath(repoRoot, runId, "run.json"),
  };

  fs.writeFileSync(artifacts.recording, `${JSON.stringify(recording, null, 2)}\n`);
  fs.writeFileSync(artifacts.transcript, `${JSON.stringify(transcript, null, 2)}\n`);
  fs.writeFileSync(
    artifacts.transcriptMarkdown,
    renderTranscriptMarkdown({
      recording,
      transcript,
      obsidianTranscriptMarkdown,
    }),
  );
  fs.writeFileSync(artifacts.chapters, `${JSON.stringify(chapters, null, 2)}\n`);
  fs.writeFileSync(artifacts.minutes, `${JSON.stringify(persistedMinutes, null, 2)}\n`);
  fs.writeFileSync(artifacts.markdown, renderMinutesMarkdown({ recording, minutes: persistedMinutes }));

  const runManifest = {
    runId,
    recordingId: recording.recordingId,
    profile: persistedMinutes.profile,
    provider: {
      id: transcript.provider.name,
      model: transcript.provider.model,
    },
    startedAt,
    completedAt,
    status: "completed",
    artifacts: {
      recording: artifacts.recording,
      transcript: artifacts.transcript,
      transcriptMarkdown: artifacts.transcriptMarkdown,
      chapters: artifacts.chapters,
      minutes: artifacts.minutes,
      markdown: artifacts.markdown,
    },
  };

  assertValidAgainstSchema(repoRoot, "run.schema.json", runManifest, `run manifest ${runId}`);
  fs.writeFileSync(artifacts.run, `${JSON.stringify(runManifest, null, 2)}\n`);
  upsertRunManifest(repoRoot, runManifest);

  return {
    runId,
    runDir,
    artifacts,
    manifest: runManifest,
    minutes: persistedMinutes,
  };
}

function withSourceArtifacts({ minutes, runId }) {
  return {
    ...minutes,
    sourceArtifacts: {
      ...(minutes.sourceArtifacts || {}),
      transcriptPath: `state/runs/${runId}/transcript.json`,
      transcriptMarkdownPath: `state/runs/${runId}/transcript.md`,
      chaptersPath: `state/runs/${runId}/chapters.json`,
      transcriptMarkdownRole: "human_readable_transcript",
    },
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

function renderTranscriptMarkdown({ recording, transcript, obsidianTranscriptMarkdown }) {
  const body = typeof obsidianTranscriptMarkdown === "string" && obsidianTranscriptMarkdown.trim()
    ? obsidianTranscriptMarkdown.trim()
    : transcript.utterances
        .map((item) => {
          const timestamp = formatTimestamp(item.start);
          const speaker = item.speaker ? `**${item.speaker}**: ` : "";
          return `- ${timestamp} ${speaker}${item.text}`.trim();
        })
        .join("\n");

  const lines = [
    `# ${recording.title}`,
    "",
    `- recording_id: ${recording.recordingId}`,
    `- content_role: human_readable_transcript`,
    `- profile: ${transcript.understanding.promptProfile}`,
    `- model: ${transcript.provider.model}`,
    "",
    body,
  ];

  return `${lines.join("\n").trim()}\n`;
}

function formatTimestamp(seconds) {
  const safe = typeof seconds === "number" && seconds >= 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
}
