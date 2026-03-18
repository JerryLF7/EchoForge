export async function generateMinutes({ recording, transcript, chapters, profile }) {
  assertMachineTranscript(transcript, "intelligence");
  const sectionSet = new Set(profile.sections || []);
  const sections = {};

  if (sectionSet.has("chapters")) {
    sections.chapters = chapters.chapters.map((chapter) => ({
      title: chapter.title,
      summary: chapter.summary,
    }));
  }

  if (sectionSet.has("decisions")) {
    sections.decisions = extractDecisions(transcript);
  }

  if (sectionSet.has("quotes")) {
    sections.quotes = extractQuotes(transcript);
  }

  if (sectionSet.has("links")) {
    sections.links = extractLinks(transcript);
  }

  if (profile.todosEnabled || sectionSet.has("todos")) {
    sections.todos = extractTodos(transcript);
  }

  if (sectionSet.has("glossary")) {
    sections.glossary = extractGlossary(transcript);
  }

  return {
    recordingId: recording.recordingId,
    profile: profile.id,
    summary: buildSummary({ recording, transcript, chapters }),
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

function buildSummary({ recording, transcript, chapters }) {
  if (typeof transcript.summary === "string" && transcript.summary.trim()) {
    return transcript.summary.trim();
  }

  const chapterSummary = chapters.chapters
    .map((chapter) => chapter.summary)
    .find((value) => typeof value === "string" && value.trim());

  if (chapterSummary) {
    return chapterSummary.trim();
  }

  return `Structured minutes for ${recording.title}.`;
}

function extractDecisions(transcript) {
  const seen = new Set();

  return transcript.utterances
    .map((item) => item.text.trim())
    .filter(Boolean)
    .filter((text) => looksLikeDecision(text))
    .filter((text) => {
      if (seen.has(text)) {
        return false;
      }
      seen.add(text);
      return true;
    })
    .slice(0, 5);
}

function extractTodos(transcript) {
  const todos = [];

  for (const item of transcript.utterances) {
    if (!looksLikeTodo(item.text)) {
      continue;
    }

    todos.push({
      text: item.text.trim(),
      ...(item.speaker ? { owner: item.speaker } : {}),
    });
  }

  return todos.slice(0, 8);
}

function extractQuotes(transcript) {
  return transcript.utterances
    .filter((item) => item.text && item.text.trim())
    .filter((item) => item.text.trim().length >= 12)
    .slice(0, 5)
    .map((item) => ({
      text: item.text.trim(),
      ...(item.speaker ? { speaker: item.speaker } : {}),
      ...(typeof item.start === "number" ? { timestamp: item.start } : {}),
    }));
}

function extractLinks(transcript) {
  const matches = new Map();

  for (const item of transcript.utterances) {
    const urls = item.text.match(/https?:\/\/[^\s]+/g) || [];
    for (const url of urls) {
      const normalized = url.replace(/[),.;]+$/, "");
      if (!matches.has(normalized)) {
        matches.set(normalized, {
          url: normalized,
        });
      }
    }
  }

  return Array.from(matches.values()).slice(0, 10);
}

function extractGlossary(transcript) {
  const counts = new Map();
  const stopWords = new Set([
    "Speaker",
    "speaker",
    "Transcript",
  ]);

  for (const item of transcript.utterances) {
    const matches = item.text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
    for (const match of matches) {
      if (stopWords.has(match)) {
        continue;
      }
      counts.set(match, (counts.get(match) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([term]) => ({
      term,
      definition: "Mentioned in the machine transcript context.",
    }));
}

function looksLikeDecision(text) {
  return /决定|确定|结论|方案|安排|就这样|拍板|agree|decide|decision|we will|let's/i.test(text);
}

function looksLikeTodo(text) {
  return /我来|你来|负责|整理|同步|跟进|补充|发送|更新|处理|会后|今天|明天|今晚|稍后|follow up|follow-up|send|update|share|prepare|action item|todo/i.test(text);
}
