export async function chapterizeTranscript({ transcript }) {
  assertMachineTranscript(transcript, "chapterize");
  const groups = splitIntoChapterGroups(transcript.utterances);

  return {
    recordingId: transcript.recordingId,
    sourceTranscript: {
      contentRole: transcript.contentRole,
      providerKind: transcript.provider.kind,
    },
    chapters: groups.map((group, index) => buildChapter(group, index)),
  };
}

function assertMachineTranscript(transcript, stage) {
  if (transcript?.contentRole !== "machine_transcript") {
    throw new Error(`${stage} requires transcript.contentRole=machine_transcript`);
  }
}

function splitIntoChapterGroups(utterances) {
  const groups = [];
  let current = [];

  for (const utterance of utterances) {
    if (current.length === 0) {
      current.push(utterance);
      continue;
    }

    const previous = current[current.length - 1];
    const timeGap = (utterance.start || 0) - (previous.end || previous.start || 0);
    const shouldSplit =
      current.length >= 4 ||
      timeGap >= 45 ||
      speakerChangedAfterLongTurn(previous, utterance);

    if (shouldSplit) {
      groups.push(current);
      current = [utterance];
      continue;
    }

    current.push(utterance);
  }

  if (current.length) {
    groups.push(current);
  }

  return groups.length ? groups : [utterances];
}

function buildChapter(group, index) {
  const first = group[0];
  const last = group[group.length - 1];
  const combined = group.map((item) => item.text.trim()).filter(Boolean).join(" ");

  return {
    chapterId: `ch_${String(index + 1).padStart(3, "0")}`,
    title: buildChapterTitle(group, index),
    start: first.start,
    end: last.end,
    summary: combined,
    keywords: extractKeywords(combined),
  };
}

function buildChapterTitle(group, index) {
  const firstText = group[0]?.text?.trim() || "";
  const normalized = firstText.replace(/[。！？!?].*$/, "").trim();
  if (normalized) {
    return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
  }

  return index === 0 ? "Opening segment" : `Chapter ${index + 1}`;
}

function extractKeywords(text) {
  const tokens = text.match(/[A-Za-z][A-Za-z0-9_-]{2,}|[\u4e00-\u9fff]{2,8}/g) || [];
  const counts = new Map();
  const stopWords = new Set([
    "我们",
    "这个",
    "然后",
    "一下",
    "今天",
    "晚上",
    "Speaker",
  ]);

  for (const token of tokens) {
    if (stopWords.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([token]) => token);
}

function speakerChangedAfterLongTurn(previous, current) {
  const previousDuration = (previous.end || 0) - (previous.start || 0);
  return Boolean(
    previous.speaker &&
      current.speaker &&
      previous.speaker !== current.speaker &&
      previousDuration >= 20,
  );
}
