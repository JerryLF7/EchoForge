import { loadRecordingIndex } from "../store/recordings.js";
import { listRuns, readRunArtifact } from "../store/artifacts.js";
import { loadRunsIndex } from "../store/runs.js";
import { assertValidAgainstSchema } from "../schema/validator.js";

const requiredRunArtifacts = [
  "run.json",
  "recording.json",
  "transcript.json",
  "chapters.json",
  "minutes.json",
];

export function validateStoredState(repoRoot, { runId } = {}) {
  const report = {
    ok: true,
    checked: {
      recordings: 0,
      indexedRuns: 0,
      runDirs: 0,
      artifacts: 0,
    },
    errors: [],
  };

  let indexedRunIds = [];

  if (!runId) {
    try {
      const recordingsIndex = loadRecordingIndex(repoRoot);
      const recordings = Object.values(recordingsIndex.items);
      report.checked.recordings = recordings.length;

      for (const recording of recordings) {
        try {
          assertValidAgainstSchema(
            repoRoot,
            "recording.schema.json",
            recording,
            `recording ${(recording && recording.recordingId) || "(unknown)"}`,
          );
        } catch (error) {
          pushError(report, {
            scope: "recording",
            recordingId: recording?.recordingId || null,
            message: error.message,
          });
        }
      }
    } catch (error) {
      pushError(report, {
        scope: "recordings_index",
        message: error.message,
      });
    }
  }

  try {
    const runsIndex = loadRunsIndex(repoRoot);
    const manifests = Object.values(runsIndex.items);

    if (runId) {
      const manifest = runsIndex.items[runId];
      indexedRunIds = manifest ? [runId] : [];
      report.checked.indexedRuns = indexedRunIds.length;

      if (manifest) {
        try {
          assertValidAgainstSchema(repoRoot, "run.schema.json", manifest, `run manifest ${runId}`);
        } catch (error) {
          pushError(report, {
            scope: "run_manifest",
            runId,
            message: error.message,
          });
        }
      }
    } else {
      indexedRunIds = Object.keys(runsIndex.items);
      report.checked.indexedRuns = indexedRunIds.length;

      for (const manifest of manifests) {
        try {
          assertValidAgainstSchema(
            repoRoot,
            "run.schema.json",
            manifest,
            `run manifest ${(manifest && manifest.runId) || "(unknown)"}`,
          );
        } catch (error) {
          pushError(report, {
            scope: "run_manifest",
            runId: manifest?.runId || null,
            message: error.message,
          });
        }
      }
    }
  } catch (error) {
    pushError(report, {
      scope: "runs_index",
      message: error.message,
    });
  }

  const discoveredRunIds = runId
    ? Array.from(new Set([runId, ...indexedRunIds]))
    : Array.from(new Set([...indexedRunIds, ...listRuns(repoRoot)])).sort();

  report.checked.runDirs = discoveredRunIds.length;

  for (const currentRunId of discoveredRunIds) {
    for (const artifactName of requiredRunArtifacts) {
      try {
        readRunArtifact(repoRoot, currentRunId, artifactName);
        report.checked.artifacts += 1;
      } catch (error) {
        pushError(report, {
          scope: "run_artifact",
          runId: currentRunId,
          artifact: artifactName,
          message: error.message,
        });
      }
    }
  }

  return report;
}

function pushError(report, error) {
  report.ok = false;
  report.errors.push(error);
}
