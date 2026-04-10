import fs from "node:fs";
import path from "node:path";

import { rebuildRun } from "../../pipeline/rebuild.js";
import { loadProfile } from "./profile-loader.js";
import { validateStoredState } from "./state-validation.js";
import { getRunsRoot, listRuns } from "../store/artifacts.js";
import { loadRunsIndex } from "../store/runs.js";
import { upsertRecordings } from "../store/recordings.js";

export async function repairStoredState(repoRoot, { runId } = {}) {
  const before = validateStoredState(repoRoot, runId ? { runId } : {});
  const targetRunIds = selectRunIds(repoRoot, runId);
  const repaired = [];
  const skipped = [];
  const errors = [];

  for (const currentRunId of targetRunIds) {
    const single = validateStoredState(repoRoot, { runId: currentRunId });
    if (single.ok) {
      skipped.push(currentRunId);
      continue;
    }

    try {
      const repairedRun = await repairRunState(repoRoot, currentRunId);
      repaired.push(repairedRun);
    } catch (error) {
      errors.push({
        runId: currentRunId,
        message: error.message,
      });
    }
  }

  const after = validateStoredState(repoRoot, runId ? { runId } : {});

  return {
    ok: errors.length === 0 && after.ok,
    scope: runId ? { runId } : "all",
    before,
    after,
    repairedCount: repaired.length,
    skippedCount: skipped.length,
    repaired,
    skipped,
    errors,
  };
}

async function repairRunState(repoRoot, runId) {
  const runDir = path.join(getRunsRoot(repoRoot), runId);
  const recording = readJson(path.join(runDir, "recording.json"));
  const minutes = readOptionalJson(path.join(runDir, "minutes.json"));
  const manifest = readOptionalJson(path.join(runDir, "run.json"));
  const profile = loadProfile(repoRoot, resolveLegacyProfileName(manifest, minutes));
  const transcript = normalizeLegacyTranscript({
    recording,
    transcript: readJson(path.join(runDir, "transcript.json")),
    profile,
  });
  const startedAt = manifest?.startedAt || recording.ingest?.ingestedAt || recording.capturedAt;

  upsertRecordings(repoRoot, [recording]);

  const result = await rebuildRun({
    repoRoot,
    runId,
    recording,
    transcript,
    profile,
    startedAt,
  });

  return {
    runId,
    recordingId: recording.recordingId,
    profile: profile.id,
    startedAt,
    output: result.published,
  };
}

function selectRunIds(repoRoot, runId) {
  if (runId) {
    return [runId];
  }

  const indexed = Object.keys(loadRunsIndex(repoRoot).items || {});
  return Array.from(new Set([...indexed, ...listRuns(repoRoot)])).sort();
}

function resolveLegacyProfileName(manifest, minutes) {
  if (manifest?.profile) {
    return manifest.profile;
  }

  if (minutes?.profile) {
    return minutes.profile;
  }

  const sections = minutes?.sections || {};
  if (Array.isArray(sections.todos) && sections.todos.length > 0) {
    return "work_meeting";
  }

  if (Array.isArray(sections.glossary) && sections.glossary.length > 0) {
    return "lecture";
  }

  return "general";
}

function normalizeLegacyTranscript({ recording, transcript, profile }) {
  const utterances = Array.isArray(transcript?.utterances)
    ? transcript.utterances
    : [];
  const normalizedUtterances = utterances
    .map((item, index) => normalizeLegacyUtterance(item, index))
    .filter((item) => item.text);

  const summary = normalizedSummary(transcript?.summary, normalizedUtterances, recording.title);
  const provider = normalizeLegacyProvider(transcript?.provider);

  return {
    recordingId: recording.recordingId,
    contentRole: "machine_transcript",
    language: normalizeLanguage(transcript?.language),
    mode: "audio_understanding",
    summary,
    utterances: normalizedUtterances,
    provider,
    understanding: {
      promptProfile: profile.promptProfile,
      scenarioPrompt: profile.audioUnderstanding?.prompt || "Understand the audio.",
      terminologyHints: profile.audioUnderstanding?.terminologyHints || [],
      speakerInference: normalizedUtterances.some((item) => item.speaker)
        ? "model_inferred"
        : "not_available",
    },
  };
}

function normalizeLegacyUtterance(item, index) {
  const notes = [];

  if (Array.isArray(item?.notes)) {
    for (const note of item.notes) {
      if (typeof note === "string" && note.trim()) {
        notes.push(note.trim());
      }
    }
  }

  if (typeof item?.confidence === "number" && Number.isFinite(item.confidence)) {
    notes.push(`legacy_confidence:${item.confidence}`);
  }

  return {
    utteranceId:
      typeof item?.utteranceId === "string" && item.utteranceId.trim()
        ? item.utteranceId.trim()
        : `utt_${String(index + 1).padStart(3, "0")}`,
    speaker:
      typeof item?.speaker === "string" && item.speaker.trim()
        ? item.speaker.trim()
        : null,
    start: normalizeTimestamp(item?.start, index === 0 ? 0 : null),
    end: normalizeTimestamp(item?.end, normalizeTimestamp(item?.start, 0)),
    text: typeof item?.text === "string" ? item.text.trim() : "",
    notes,
  };
}

function normalizeLegacyProvider(provider) {
  return {
    kind:
      typeof provider?.kind === "string" && provider.kind.trim()
        ? provider.kind.trim()
        : "legacy_audio_understanding",
    name:
      typeof provider?.name === "string" && provider.name.trim()
        ? provider.name.trim()
        : "legacy-runtime",
    model:
      typeof provider?.model === "string" && provider.model.trim()
        ? provider.model.trim()
        : "unspecified-legacy-model",
  };
}

function normalizedSummary(summary, utterances, title) {
  if (typeof summary === "string" && summary.trim()) {
    return summary.trim();
  }

  const joined = utterances.map((item) => item.text).join(" ").trim();
  if (joined) {
    return joined.length > 240 ? `${joined.slice(0, 237)}...` : joined;
  }

  return `Audio understanding for ${title}.`;
}

function normalizeLanguage(language) {
  return typeof language === "string" && language.trim() ? language.trim() : "auto";
}

function normalizeTimestamp(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback ?? 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}
