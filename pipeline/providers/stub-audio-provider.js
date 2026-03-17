export async function runStubAudioProvider(context) {
  const { recording, profile, request } = context;
  const scenarioPrompt = request.scenarioPrompt;
  const terminologyHints = request.terminologyHints;

  return {
    recordingId: recording.recordingId,
    language: request.language,
    mode: "audio_understanding",
    summary: `Structured audio understanding for ${recording.title}.`,
    utterances: [
      {
        utteranceId: "utt_001",
        speaker: "speaker_1",
        start: 0,
        end: 12,
        text: `Opening segment for ${recording.title}.`,
        notes: [
          "Scenario-aware placeholder output.",
          `Provider: ${request.providerId}`,
        ],
      },
      {
        utteranceId: "utt_002",
        speaker: "speaker_2",
        start: 12,
        end: 27,
        text: scenarioPrompt,
        notes: terminologyHints,
      }
    ],
    provider: {
      kind: "agent_multimodal",
      name: request.providerId,
      model: profile.audioUnderstanding?.model || "unconfigured",
    },
    understanding: {
      promptProfile: profile.promptProfile,
      scenarioPrompt,
      terminologyHints,
      speakerInference: "model_inferred",
    },
  };
}
