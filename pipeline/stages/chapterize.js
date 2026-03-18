export async function chapterizeTranscript({ transcript }) {
  assertMachineTranscript(transcript, "chapterize");
  const first = transcript.utterances[0];
  const last = transcript.utterances[transcript.utterances.length - 1];

  return {
    recordingId: transcript.recordingId,
    sourceTranscript: {
      contentRole: transcript.contentRole,
      providerKind: transcript.provider.kind,
    },
    chapters: [
      {
        chapterId: "ch_001",
        title: "Opening segment",
        start: first.start,
        end: last.end,
        summary: transcript.utterances.map((item) => item.text).join(" "),
        keywords: ["stub", "transcript"],
      },
    ],
  };
}

function assertMachineTranscript(transcript, stage) {
  if (transcript?.contentRole !== "machine_transcript") {
    throw new Error(`${stage} requires transcript.contentRole=machine_transcript`);
  }
}
