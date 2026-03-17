export async function generateMinutes({ recording, chapters, profile }) {
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
    summary: `Stub minutes for ${recording.title}.`,
    sections,
    sourceArtifacts: {
      transcriptPath: `state/runs/${recording.recordingId}/transcript.json`,
      chaptersPath: `state/runs/${recording.recordingId}/chapters.json`,
    },
  };
}
