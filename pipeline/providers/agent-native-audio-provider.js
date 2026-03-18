export function buildAgentAudioUnderstandingTask({ recording, profile, request }) {
  return {
    taskKind: "audio_understanding",
    taskVersion: "2026-03-17",
    recording: {
      recordingId: recording.recordingId,
      title: recording.title,
      capturedAt: recording.capturedAt,
      audio: {
        path: recording.audio.path,
        format: recording.audio.format,
        durationSeconds: recording.audio.durationSeconds,
      },
      participants: recording.participants || [],
      source: recording.source,
    },
    profile: {
      id: profile.id,
      promptProfile: profile.promptProfile,
      outputPreset: profile.outputPreset,
      language: profile.language || "auto",
    },
    guidance: {
      scenarioPrompt: request.scenarioPrompt,
      terminologyHints: request.terminologyHints,
      transcriptMode:
        "Produce transcriptUtterances for downstream intelligence. Keep them close to spoken content, but correct obvious mistakes when highly confident.",
      obsidianMode:
        "Produce obsidianTranscriptMarkdown as a lightly cleaned, readable transcript suitable for direct publishing to Obsidian.",
      timestampGuidance:
        "Use coarse timestamps in seconds when exact alignment is uncertain.",
      speakerGuidance:
        "Infer speakers when possible. If identity is unknown, use labels like Speaker 1, Speaker 2.",
    },
    resultContract: {
      contentType: "application/json",
      requiredFields: [
        "language",
        "summary",
        "transcriptUtterances",
        "obsidianTranscriptMarkdown",
      ],
      transcriptUtteranceFields: [
        "speaker",
        "start",
        "end",
        "text",
        "notes",
      ],
      optionalAgentMetadataFields: [
        "host",
        "model",
        "sessionId",
      ],
    },
  };
}

export async function runAgentNativeAudioProvider(context) {
  const { recording, profile, request } = context;
  if (!request.agentResult) {
    const task = buildAgentAudioUnderstandingTask({
      recording,
      profile,
      request,
    });

    throw new Error(
      [
        "Agent audio understanding result required.",
        "Use the agent runtime wrapper to generate a task and rerun with `--audio-result <file>`.",
        `Task kind: ${task.taskKind}`,
        `Recording id: ${recording.recordingId}`,
      ].join(" "),
    );
  }

  return normalizeAgentAudioUnderstandingResult({
    recording,
    profile,
    request,
    result: request.agentResult,
  });
}

export function normalizeAgentAudioUnderstandingResult({
  recording,
  profile,
  request,
  result,
}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Agent audio understanding result must be a JSON object.");
  }

  const transcriptUtterances = Array.isArray(result.transcriptUtterances)
    ? result.transcriptUtterances
    : [];
  const utterances = normalizeUtterances(transcriptUtterances);
  const agent = normalizeAgentMetadata(result.agent);

  return {
    transcript: {
      recordingId: recording.recordingId,
      contentRole: "machine_transcript",
      language: typeof result.language === "string" && result.language.trim()
        ? result.language.trim()
        : request.language || "auto",
      mode: "audio_understanding",
      summary: typeof result.summary === "string" && result.summary.trim()
        ? result.summary.trim()
        : summarizeTranscript(utterances, recording.title),
      utterances,
      provider: {
        kind: "host_agent_multimodal_audio_understanding",
        name: agent.host || "host-agent",
        model: agent.model || "unspecified-by-host-agent",
      },
      understanding: {
        promptProfile: profile.promptProfile,
        scenarioPrompt: request.scenarioPrompt,
        terminologyHints: request.terminologyHints,
        speakerInference: inferSpeakerMode(utterances),
      },
    },
    obsidianTranscriptMarkdown: normalizeMarkdown(
      result.obsidianTranscriptMarkdown,
      utterances,
    ),
  };
}

function normalizeAgentMetadata(agent) {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    return {};
  }

  return {
    host: typeof agent.host === "string" && agent.host.trim() ? agent.host.trim() : null,
    model: typeof agent.model === "string" && agent.model.trim() ? agent.model.trim() : null,
    sessionId:
      typeof agent.sessionId === "string" && agent.sessionId.trim()
        ? agent.sessionId.trim()
        : null,
  };
}

function normalizeUtterances(input) {
  const normalized = input
    .map((item, index) => normalizeUtterance(item, index))
    .filter((item) => item.text);

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    if (current.end < current.start) {
      current.end = current.start;
    }
    if (current.end === current.start && next && next.start > current.start) {
      current.end = next.start;
    }
  }

  if (normalized.length === 0) {
    throw new Error("Agent audio understanding result is missing transcriptUtterances.");
  }

  return normalized;
}

function normalizeUtterance(item, index) {
  const notes = Array.isArray(item?.notes)
    ? item.notes.filter((note) => typeof note === "string" && note.trim())
    : [];

  return {
    utteranceId: `utt_${String(index + 1).padStart(3, "0")}`,
    speaker:
      typeof item?.speaker === "string" && item.speaker.trim()
        ? item.speaker.trim()
        : null,
    start: normalizeTimestamp(item?.start, index === 0 ? 0 : null),
    end: normalizeTimestamp(item?.end, normalizeTimestamp(item?.start, 0)),
    text: typeof item?.text === "string" ? item.text.trim() : "",
    notes,
  };
}

function normalizeMarkdown(markdown, utterances) {
  if (typeof markdown === "string" && markdown.trim()) {
    return markdown.trim();
  }

  return utterances
    .map((item) => {
      const prefix = item.speaker ? `**${item.speaker}**: ` : "";
      return `${prefix}${item.text}`.trim();
    })
    .join("\n\n")
    .trim();
}

function inferSpeakerMode(utterances) {
  return utterances.some((item) => item.speaker) ? "model_inferred" : "not_available";
}

function summarizeTranscript(utterances, title) {
  const joined = utterances.map((item) => item.text).join(" ").trim();
  if (!joined) {
    return `Audio understanding for ${title}.`;
  }

  return joined.length > 240 ? `${joined.slice(0, 237)}...` : joined;
}

function normalizeTimestamp(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback ?? 0;
}
