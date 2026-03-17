export async function transcribeRecording({ recording, profile }) {
  return {
    recordingId: recording.recordingId,
    language: profile.language || "auto",
    utterances: [
      {
        utteranceId: "utt_001",
        speaker: "speaker_1",
        start: 0,
        end: 12,
        text: `Placeholder transcript for ${recording.title}.`,
        confidence: 0.25,
      },
      {
        utteranceId: "utt_002",
        speaker: "speaker_2",
        start: 12,
        end: 27,
        text: "Replace this stub with a real ASR backend.",
        confidence: 0.2,
      },
    ],
    provider: {
      name: "stub",
      model: "none",
    },
  };
}
