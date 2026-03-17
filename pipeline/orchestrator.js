import { ingestLocalFile } from "./stages/ingest.js";
import { transcribeRecording } from "./stages/transcribe.js";
import { chapterizeTranscript } from "./stages/chapterize.js";
import { generateMinutes } from "./stages/intelligence.js";
import { publishArtifacts } from "./stages/publish.js";

export async function runPipeline({ repoRoot, input, profile }) {
  const recording = await ingestLocalFile({ repoRoot, input });
  const transcript = await transcribeRecording({ recording, profile });
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
