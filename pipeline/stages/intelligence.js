export async function generateMinutes({ recording, transcript, chapters, profile }) {
  assertMachineTranscript(transcript, "intelligence");
  const sections = {
    chapters: chapters.chapters.map((chapter) => ({
      title: chapter.title,
      summary: chapter.summary,
    })),
    decisions: [],
    quotes: [],
    links: [],
  };

  if (profile.todosEnabled) {
    sections.todos = [];
  }

  if (profile.sections.includes("glossary")) {
    sections.glossary = [];
  }

  return {
    recordingId: recording.recordingId,
    profile: profile.id,
    summary: transcript.summary || `Stub minutes for ${recording.title}.`,
    sections,
    sourceArtifacts: {
      transcriptContentRole: transcript.contentRole,
      transcriptProviderKind: transcript.provider.kind,
      chapterSourceContentRole: chapters.sourceTranscript?.contentRole || null,
    },
  };
}

function assertMachineTranscript(transcript, stage) {
  if (transcript?.contentRole !== "machine_transcript") {
    throw new Error(`${stage} requires transcript.contentRole=machine_transcript`);
  }
}
