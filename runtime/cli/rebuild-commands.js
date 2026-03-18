import { rebuildRun } from "../../pipeline/rebuild.js";
import { publishArtifacts } from "../../pipeline/stages/publish.js";
import { readRunArtifact } from "../store/artifacts.js";
import { getRunManifest } from "../store/runs.js";

export async function rebuildMinutesCommand({ repoRoot, runId, profile }) {
  const manifest = getRunManifest(repoRoot, runId) || readRunArtifact(repoRoot, runId, "run.json");
  const recording = readRunArtifact(repoRoot, runId, "recording.json");
  const transcript = readRunArtifact(repoRoot, runId, "transcript.json");

  return rebuildRun({
    repoRoot,
    runId,
    recording,
    transcript,
    profile,
    startedAt: manifest.startedAt,
  });
}

export async function republishRunCommand({ repoRoot, runId }) {
  const manifest = getRunManifest(repoRoot, runId) || readRunArtifact(repoRoot, runId, "run.json");
  const recording = readRunArtifact(repoRoot, runId, "recording.json");
  const transcript = readRunArtifact(repoRoot, runId, "transcript.json");
  const chapters = readRunArtifact(repoRoot, runId, "chapters.json");
  const minutes = readRunArtifact(repoRoot, runId, "minutes.json");

  const published = await publishArtifacts({
    repoRoot,
    recording,
    transcript,
    chapters,
    minutes,
    runContext: {
      runId,
      startedAt: manifest.startedAt,
    },
  });

  return {
    recording,
    transcript,
    chapters,
    minutes: published.minutes,
    published,
  };
}
