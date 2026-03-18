import { assertAudioProviderSelection } from "./provider-registry.js";

export function buildAudioUnderstandingRequest({ recording, profile }) {
  const audioUnderstanding = profile.audioUnderstanding || {};
  const selection = assertAudioProviderSelection({
    profile,
  });

  return {
    providerId: selection.providerId,
    language: profile.language || "auto",
    audio: {
      path: recording.audio.path,
      format: recording.audio.format,
      durationSeconds: recording.audio.durationSeconds,
    },
    scenarioPrompt: audioUnderstanding.prompt || "Understand the audio.",
    terminologyHints: audioUnderstanding.terminologyHints || [],
    outputSchema: "transcript.schema.json",
    agentResult: audioUnderstanding.result || null,
  };
}
