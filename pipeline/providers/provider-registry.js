import { runStubAudioProvider } from "./stub-audio-provider.js";

const providers = {
  stub: runStubAudioProvider,
};

export function listAudioProviders() {
  return Object.keys(providers).sort();
}

export async function runAudioProvider({ providerId, context }) {
  const provider = providers[providerId];

  if (!provider) {
    throw new Error(`Unknown audio provider: ${providerId}`);
  }

  return provider(context);
}
