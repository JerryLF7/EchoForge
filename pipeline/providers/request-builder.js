export function buildAudioUnderstandingRequest({ recording, profile, overrideProvider }) {
  const audioUnderstanding = profile.audioUnderstanding || {};

  return {
    providerId: overrideProvider || audioUnderstanding.provider || "stub",
    model: audioUnderstanding.model || null,
    language: profile.language || "auto",
    audio: {
      path: recording.audio.path,
      format: recording.audio.format,
      durationSeconds: recording.audio.durationSeconds,
    },
    scenarioPrompt: audioUnderstanding.prompt || "Understand the audio.",
    terminologyHints: audioUnderstanding.terminologyHints || [],
    outputSchema: "transcript.schema.json",
  };
}
