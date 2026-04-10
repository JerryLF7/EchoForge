import { ingestLocalFile } from "./stages/ingest.js";
import { understandAudio } from "./stages/understand-audio.js";
import { chapterizeTranscript } from "./stages/chapterize.js";
import { generateMinutes } from "./stages/intelligence.js";
import { publishArtifacts } from "./stages/publish.js";

export async function runPipeline({ repoRoot, input, profile, audioUnderstandingResult }) {
  const startedAt = new Date().toISOString();
  const recording = await ingestLocalFile({ repoRoot, input });
  return runPipelineFromRecording({
    repoRoot,
    recording,
    profile,
    audioUnderstandingResult,
    runContext: {
      startedAt,
    },
  });
}

export async function runPipelineFromRecording({
  repoRoot,
  recording,
  profile,
  audioUnderstandingResult,
  runContext,
}) {
  const understoodAudio = await understandAudio({
    recording,
    profile,
    audioUnderstandingResult,
  });
  const transcript = understoodAudio.transcript;
  const chapters = await chapterizeTranscript({ transcript, profile });
  const minutes = await generateMinutes({ recording, transcript, chapters, profile });
  const published = await publishArtifacts({
    repoRoot,
    recording,
    transcript,
    obsidianTranscriptMarkdown: understoodAudio.obsidianTranscriptMarkdown,
    chapters,
    minutes,
    runContext,
  });

  return {
    recording,
    transcript,
    chapters,
    minutes: published.minutes,
    published,
  };
}
