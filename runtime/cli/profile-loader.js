import fs from "node:fs";
import path from "node:path";

const defaultProfile = {
  id: "general",
  label: "General audio intelligence",
  promptProfile: "general",
  outputPreset: "default",
  language: "auto",
  audioUnderstanding: {
    capabilities: {
      speakerInference: true,
      timestampAlignment: true,
      terminologyCorrection: true,
    },
    prompt: "Understand the audio.",
    terminologyHints: [],
  },
  sections: ["summary", "chapters", "decisions", "quotes", "links"],
  todosEnabled: false,
};

export function loadProfile(repoRoot, profileName) {
  const profilePath = path.join(repoRoot, "profiles", `${profileName}.json`);

  if (!fs.existsSync(profilePath)) {
    return {
      ...defaultProfile,
      id: profileName,
      inheritedFrom: "builtin-default",
      audioUnderstanding: {
        ...defaultProfile.audioUnderstanding,
      },
    };
  }

  const raw = fs.readFileSync(profilePath, "utf8");
  return JSON.parse(raw);
}
