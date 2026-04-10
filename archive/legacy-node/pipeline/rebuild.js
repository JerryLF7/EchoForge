import { chapterizeTranscript } from "./stages/chapterize.js";
import { generateMinutes } from "./stages/intelligence.js";
import { publishArtifacts } from "./stages/publish.js";

export async function rebuildRun({
  repoRoot,
  runId,
  recording,
  transcript,
  profile,
  startedAt,
}) {
  const chapters = await chapterizeTranscript({ transcript, profile });
  const minutes = await generateMinutes({ recording, transcript, chapters, profile });
  const published = await publishArtifacts({
    repoRoot,
    recording,
    transcript,
    chapters,
    minutes,
    runContext: {
      runId,
      startedAt,
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
