import { buildAudioUnderstandingRequest } from "../providers/request-builder.js";
import { runAudioProvider } from "../providers/provider-registry.js";

export async function understandAudio({ recording, profile, providerOverride }) {
  const request = buildAudioUnderstandingRequest({
    recording,
    profile,
    overrideProvider: providerOverride,
  });

  return runAudioProvider({
    providerId: request.providerId,
    context: {
      recording,
      profile,
      request,
    },
  });
}
