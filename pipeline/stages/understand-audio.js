import fs from "node:fs";

import { buildAudioUnderstandingRequest } from "../providers/request-builder.js";
import { runAudioProvider } from "../providers/provider-registry.js";

export async function understandAudio({ recording, profile, audioUnderstandingResult }) {
  const request = buildAudioUnderstandingRequest({
    recording,
    profile: withAudioUnderstandingResult(profile, audioUnderstandingResult),
  });

  const output = await runAudioProvider({
    context: {
      recording,
      profile,
      request,
    },
  });

  return {
    transcript: output.transcript,
    obsidianTranscriptMarkdown: output.obsidianTranscriptMarkdown,
  };
}

function withAudioUnderstandingResult(profile, audioUnderstandingResult) {
  return {
    ...profile,
    audioUnderstanding: {
      ...(profile.audioUnderstanding || {}),
      result: loadAudioUnderstandingResult(audioUnderstandingResult),
    },
  };
}

function loadAudioUnderstandingResult(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  const raw = fs.readFileSync(value, "utf8");
  return JSON.parse(raw);
}
