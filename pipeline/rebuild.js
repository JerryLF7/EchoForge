import { chapterizeTranscript } from "./stages/chapterize.js";
import { generateMinutes } from "./stages/intelligence.js";
import { publishArtifacts } from "./stages/publish.js";

export async function rebuildFromRecording({ repoRoot, recording, transcript, profile }) {
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
