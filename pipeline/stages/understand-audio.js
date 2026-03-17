export async function understandAudio({ recording, profile }) {
  const scenarioPrompt = profile.audioUnderstanding?.prompt || "Understand the audio.";
  const terminologyHints = profile.audioUnderstanding?.terminologyHints || [];

  return {
    recordingId: recording.recordingId,
    language: profile.language || "auto",
    mode: "audio_understanding",
    summary: `Structured audio understanding for ${recording.title}.`,
    utterances: [
      {
        utteranceId: "utt_001",
        speaker: "speaker_1",
        start: 0,
        end: 12,
        text: `Opening segment for ${recording.title}.`,
        notes: ["Scenario-aware placeholder output."],
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
      name: "stub",
      model: "unconfigured",
    },
    understanding: {
      promptProfile: profile.promptProfile,
      scenarioPrompt,
      terminologyHints,
      speakerInference: "model_inferred",
    },
  };
}
