import { runAgentNativeAudioProvider } from "./agent-native-audio-provider.js";

const audioRuntime = {
  id: "agent-native",
  label: "Built-in agent-native audio runtime",
  kind: "host_agent_multimodal_audio_understanding",
  supportedCapabilities: {
    speakerInference: true,
    timestampAlignment: true,
    terminologyCorrection: true,
    decisionExtractionBias: true,
    conceptNormalization: true,
  },
  inputRequirements: {
    audioPath: true,
    audioFormat: true,
    scenarioPrompt: true,
    terminologyHints: true,
  },
  runner: runAgentNativeAudioProvider,
};

export function getAudioRuntime() {
  return {
    id: audioRuntime.id,
    label: audioRuntime.label,
    kind: audioRuntime.kind,
    supportedCapabilities: audioRuntime.supportedCapabilities,
    inputRequirements: audioRuntime.inputRequirements,
  };
}

export function listAudioProviders() {
  return [getAudioRuntime()];
}

export function resolveAudioProviderSelection({ profile }) {
  const configured = profile.audioUnderstanding || {};

  return {
    ok: true,
    providerId: audioRuntime.id,
    provider: getAudioRuntime(),
    requestedCapabilities: configured.capabilities || {},
    issues: [],
  };
}

export function assertAudioProviderSelection({ profile }) {
  return resolveAudioProviderSelection({ profile });
}

export function formatProviderSelectionError(selection) {
  if (!selection.issues?.length) {
    return "Audio runtime configuration is invalid.";
  }

  return selection.issues.map((issue) => issue.message).join("; ");
}

export async function runAudioProvider({ context }) {
  return audioRuntime.runner(context);
}
