import { ingestLocalFile } from "./stages/ingest.js";
import { understandAudio } from "./stages/understand-audio.js";
import { chapterizeTranscript } from "./stages/chapterize.js";
import { generateMinutes } from "./stages/intelligence.js";
import { publishArtifacts } from "./stages/publish.js";

export async function runPipeline({ repoRoot, input, profile, providerOverride }) {
  const recording = await ingestLocalFile({ repoRoot, input });
  const transcript = await understandAudio({
    recording,
    profile,
    providerOverride,
  });
  const chapters = await chapterizeTranscript({ transcript, profile });
  const minutes = await generateMinutes({ recording, transcript, chapters, profile });
  const published = await publishArtifacts({ repoRoot, recording, transcript, chapters, minutes });

  return {
    recording,
    transcript,
    chapters,
    minutes,
    published,
  };
}
