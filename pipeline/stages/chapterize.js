export async function chapterizeTranscript({ transcript }) {
  const first = transcript.utterances[0];
  const last = transcript.utterances[transcript.utterances.length - 1];

  return {
    recordingId: transcript.recordingId,
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
