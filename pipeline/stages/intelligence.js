export async function generateMinutes({ recording, transcript, chapters, profile }) {
  assertMachineTranscript(transcript, "intelligence");

  const sectionSet = new Set(profile.sections || []);
  const preset = getMinutesPreset(profile.outputPreset);
  const candidates = buildSentenceCandidates(transcript);
  const sections = {};

  if (sectionSet.has("chapters")) {
    sections.chapters = chapters.chapters.map((chapter) => ({
      title: chapter.title,
      summary: chapter.summary,
    }));
  }

  const decisions = sectionSet.has("decisions")
    ? extractDecisions(candidates, preset)
    : [];
  const todos = profile.todosEnabled || sectionSet.has("todos")
    ? extractTodos(candidates, recording, preset)
    : [];
  const links = sectionSet.has("links")
    ? extractLinks(transcript)
    : [];

  if (sectionSet.has("decisions")) {
    sections.decisions = decisions;
  }

  if (sectionSet.has("quotes")) {
    sections.quotes = extractQuotes(candidates, {
      decisions,
      todos,
      maxItems: preset.maxQuotes,
    });
  }

  if (sectionSet.has("links")) {
    sections.links = links;
  }

  if (profile.todosEnabled || sectionSet.has("todos")) {
    sections.todos = todos;
  }

  if (sectionSet.has("glossary")) {
    sections.glossary = extractGlossary(transcript, profile, preset);
  }

  return {
    recordingId: recording.recordingId,
    profile: profile.id,
    summary: buildSummary({ recording, transcript, chapters, decisions, todos, preset }),
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

function buildSummary({ recording, transcript, chapters, decisions, todos, preset }) {
  if (preset.preferActionSummary && (decisions.length || todos.length)) {
    const parts = [];

    if (decisions.length) {
      parts.push(`Key decision: ${decisions[0]}`);
    }

    if (todos.length) {
      parts.push(`Next action: ${todos[0].text}`);
    }

    return parts.join(" ");
  }

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

function buildSentenceCandidates(transcript) {
  const candidates = [];

  for (const utterance of transcript.utterances) {
    const parts = splitIntoSentences(utterance.text);
    for (let index = 0; index < parts.length; index += 1) {
      candidates.push({
        id: `${utterance.utteranceId}_s${index + 1}`,
        utteranceId: utterance.utteranceId,
        speaker: utterance.speaker || null,
        start: utterance.start,
        end: utterance.end,
        text: parts[index],
        normalizedText: normalizeText(parts[index]),
      });
    }
  }

  return candidates.filter((item) => item.normalizedText);
}

function splitIntoSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDecisions(candidates, preset) {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreDecisionCandidate(candidate),
    }))
    .filter((candidate) => candidate.score >= preset.minDecisionScore)
    .sort(compareRankedCandidates);

  return uniqueByNormalizedText(ranked)
    .slice(0, preset.maxDecisions)
    .map((candidate) => candidate.text);
}

function extractTodos(candidates, recording, preset) {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreTodoCandidate(candidate),
    }))
    .filter((candidate) => candidate.score >= preset.minTodoScore)
    .sort(compareRankedCandidates);

  return uniqueByNormalizedText(ranked)
    .slice(0, preset.maxTodos)
    .map((candidate) => buildTodo(candidate, recording));
}

function extractQuotes(candidates, { decisions, todos, maxItems }) {
  const excluded = new Set([
    ...decisions.map((item) => normalizeText(item)),
    ...todos.map((item) => normalizeText(item.text)),
  ]);

  const ranked = candidates
    .filter((candidate) => candidate.text.length >= 14)
    .filter((candidate) => !excluded.has(candidate.normalizedText))
    .map((candidate) => ({
      ...candidate,
      score: scoreQuoteCandidate(candidate),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(compareRankedCandidates);

  return uniqueByNormalizedText(ranked)
    .slice(0, maxItems)
    .map((candidate) => ({
      text: candidate.text,
      ...(candidate.speaker ? { speaker: candidate.speaker } : {}),
      ...(typeof candidate.start === "number" ? { timestamp: candidate.start } : {}),
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

function extractGlossary(transcript, profile, preset) {
  const counts = new Map();
  const hintedTerms = profile.audioUnderstanding?.terminologyHints || [];

  for (const item of transcript.utterances) {
    const matches = item.text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
    for (const match of matches) {
      counts.set(match, (counts.get(match) || 0) + 1);
    }
  }

  const transcriptText = transcript.utterances.map((item) => item.text).join(" ");

  for (const term of hintedTerms) {
    const normalized = String(term || "").trim();
    if (!normalized) {
      continue;
    }

    if (transcriptText.includes(normalized)) {
      counts.set(normalized, (counts.get(normalized) || 0) + 2);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, preset.maxGlossary)
    .map(([term]) => ({
      term,
      definition: "Mentioned in the machine transcript context.",
    }));
}

function buildTodo(candidate, recording) {
  return {
    text: cleanupTodoText(candidate.text),
    ...inferTodoOwner(candidate),
    ...inferDueAt(candidate.text, recording.capturedAt),
  };
}

function inferTodoOwner(candidate) {
  if (/我来|我负责|我会|我去/u.test(candidate.text) && candidate.speaker) {
    return { owner: candidate.speaker };
  }

  if (/你来|你负责/u.test(candidate.text)) {
    return {};
  }

  if (candidate.speaker) {
    return { owner: candidate.speaker };
  }

  return {};
}

function inferDueAt(text, capturedAt) {
  if (!capturedAt) {
    return {};
  }

  const base = new Date(capturedAt);
  if (Number.isNaN(base.getTime())) {
    return {};
  }

  if (/今天|今日/u.test(text)) {
    return { dueAt: atHour(base, /今晚|今天晚上/u.test(text) ? 20 : 18) };
  }

  if (/明天|明日/u.test(text)) {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 1);
    return { dueAt: atHour(next, /晚上/u.test(text) ? 20 : 18) };
  }

  if (/下周/u.test(text)) {
    const nextWeek = new Date(base);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    return { dueAt: atHour(nextWeek, 18) };
  }

  return {};
}

function atHour(date, hourUtc) {
  const next = new Date(date);
  next.setUTCHours(hourUtc, 0, 0, 0);
  return next.toISOString();
}

function scoreDecisionCandidate(candidate) {
  let score = 0;
  const text = candidate.text;

  if (/(决定|确定|定下来|结论|共识|拍板|就按|方案是|统一为|一致认为)/u.test(text)) {
    score += 4;
  }

  if (/(agree|agreed|decide|decision|resolved|we will|let's)/i.test(text)) {
    score += 3;
  }

  if (/(安排下个|安排为|先把|优先级|下一步|这周最关键)/u.test(text)) {
    score += 2;
  }

  if (/(我来|我负责|你来|你负责)/u.test(text)) {
    score -= 2;
  }

  if (text.length < 8) {
    score -= 1;
  }

  return score;
}

function scoreTodoCandidate(candidate) {
  let score = 0;
  const text = candidate.text;

  if (/(我来|我负责|我会|我去)/u.test(text)) {
    score += 5;
  }

  if (/(你来|你负责|麻烦你|请你)/u.test(text)) {
    score += 4;
  }

  if (/(整理|同步|跟进|补充|发送|更新|处理|准备|确认|安排|落地|推进|对齐)/u.test(text)) {
    score += 2;
  }

  if (/(今天|明天|今晚|稍后|会后|下周)/u.test(text)) {
    score += 1;
  }

  if (/(follow up|follow-up|send|update|share|prepare|action item|todo)/i.test(text)) {
    score += 2;
  }

  if (/(决定|确定|结论|共识|拍板)/u.test(text) && !/(我来|你来|负责)/u.test(text)) {
    score -= 3;
  }

  return score;
}

function scoreQuoteCandidate(candidate) {
  let score = 0;

  if (candidate.speaker) {
    score += 1;
  }

  if (candidate.text.length >= 18) {
    score += 1;
  }

  if (candidate.text.length >= 28) {
    score += 1;
  }

  if (/(决定|确定|优先级|关键|方案|负责人|技术|概念|原则|问题)/u.test(candidate.text)) {
    score += 1;
  }

  return score;
}

function compareRankedCandidates(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if ((left.start || 0) !== (right.start || 0)) {
    return (left.start || 0) - (right.start || 0);
  }

  return left.text.localeCompare(right.text);
}

function uniqueByNormalizedText(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (seen.has(item.normalizedText)) {
      continue;
    }
    seen.add(item.normalizedText);
    result.push(item);
  }

  return result;
}

function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/[。！？!?；;，,\s]+/gu, "")
    .toLowerCase();
}

function cleanupTodoText(text) {
  return String(text || "")
    .trim()
    .replace(/^[好那嗯啊，,\s]+/u, "");
}

function getMinutesPreset(outputPreset) {
  switch (outputPreset) {
    case "meeting":
      return {
        preferActionSummary: true,
        minDecisionScore: 2,
        minTodoScore: 3,
        maxDecisions: 6,
        maxTodos: 8,
        maxQuotes: 4,
        maxGlossary: 6,
      };
    case "knowledge":
      return {
        preferActionSummary: false,
        minDecisionScore: 4,
        minTodoScore: 5,
        maxDecisions: 3,
        maxTodos: 3,
        maxQuotes: 6,
        maxGlossary: 10,
      };
    default:
      return {
        preferActionSummary: false,
        minDecisionScore: 3,
        minTodoScore: 4,
        maxDecisions: 4,
        maxTodos: 5,
        maxQuotes: 5,
        maxGlossary: 8,
      };
  }
}
